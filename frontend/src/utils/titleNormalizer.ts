import type { GameProfile } from "../types";
import {
  extractCustomVars,
  extractEpisodeFromTitle,
  titlesMatch,
} from "./videoUtils";

export type DateSource = "title" | "published" | "manual";
export type NormalizationStatus =
  | "already_normalized"
  | "ready"
  | "needs_review";

export interface ExtractedTitleFields {
  readonly event: string;
  readonly gameMode: string;
  readonly date: string; // D/MM/YY format matching generateYouTubeTitle
  readonly dateSource: DateSource;
  readonly episode: number | "";
  readonly customVars: Record<string, string>;
}

export interface NormalizeTitleInput {
  readonly currentTitle: string;
  readonly publishedAt: string;
  readonly gameTag: string;
  readonly profile?: GameProfile;
  readonly titleSeparator?: string;
  readonly recentFieldValues?: Record<string, string[]>;
  readonly contentType?: "vod" | "clip";
}

export interface NormalizedTitleResult {
  readonly fields: ExtractedTitleFields;
  readonly proposedTitle: string;
  readonly missingFields: readonly string[];
  readonly status: NormalizationStatus;
}

const DEFAULT_MULTIPLAYER_TEMPLATE = "{event} - {gamemode} - {date}";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDmy(day: number, month: number, year: number): string {
  if (
    year < 2000 ||
    year > 2099 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "";
  }
  return `${day}/${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function expandTwoDigitYear(yearPart: string): number {
  const num = parseInt(yearPart, 10);
  return yearPart.length === 2 ? 2000 + num : num;
}

function formatPublishedDate(publishedAt: string): string {
  if (!publishedAt) return "";
  const d = new Date(publishedAt);
  if (isNaN(d.getTime())) return "";
  return formatDmy(d.getDate(), d.getMonth() + 1, d.getFullYear());
}

function extractAndStripDate(title: string): {
  date: string;
  remainder: string;
} {
  // 1. YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const ymdSep =
    /\b(\d{4})[-./\u2215\u2044\uff0f](\d{1,2})[-./\u2215\u2044\uff0f](\d{1,2})\b/;
  const ymdSepMatch = title.match(ymdSep);
  if (ymdSepMatch) {
    const formatted = formatDmy(
      parseInt(ymdSepMatch[3], 10),
      parseInt(ymdSepMatch[2], 10),
      parseInt(ymdSepMatch[1], 10),
    );
    if (formatted) {
      return {
        date: formatted,
        remainder: title.replace(ymdSep, " "),
      };
    }
  }

  // 2. Space-separated YYYY MM DD
  const ymdSpace = /\b(\d{4})\s+(\d{1,2})\s+(\d{1,2})\b/;
  const ymdSpaceMatch = title.match(ymdSpace);
  if (ymdSpaceMatch) {
    const formatted = formatDmy(
      parseInt(ymdSpaceMatch[3], 10),
      parseInt(ymdSpaceMatch[2], 10),
      parseInt(ymdSpaceMatch[1], 10),
    );
    if (formatted) {
      return {
        date: formatted,
        remainder: title.replace(ymdSpace, " "),
      };
    }
  }

  // 3. Space-separated DD MM YYYY
  const dmySpace = /\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/;
  const dmySpaceMatch = title.match(dmySpace);
  if (dmySpaceMatch) {
    const formatted = formatDmy(
      parseInt(dmySpaceMatch[1], 10),
      parseInt(dmySpaceMatch[2], 10),
      parseInt(dmySpaceMatch[3], 10),
    );
    if (formatted) {
      return {
        date: formatted,
        remainder: title.replace(dmySpace, " "),
      };
    }
  }

  // 4. Slash or hyphen separated DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY, DD-MM-YY
  const dmySep =
    /\b(\d{1,2})[/\u2215\u2044\uff0f\-](\d{1,2})[/\u2215\u2044\uff0f\-](\d{2,4})\b/g;
  for (const m of title.matchAll(dmySep)) {
    if (m[1].length === 4) continue;
    const formatted = formatDmy(
      parseInt(m[1], 10),
      parseInt(m[2], 10),
      expandTwoDigitYear(m[3]),
    );
    if (formatted) {
      const idx = m.index ?? 0;
      return {
        date: formatted,
        remainder: title.slice(0, idx) + " " + title.slice(idx + m[0].length),
      };
    }
  }

  return { date: "", remainder: title };
}

function matchAndStripCandidate(
  text: string,
  candidates: readonly string[],
): { matched: string; remainder: string } {
  const sorted = [...candidates]
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const candidate of sorted) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(candidate)}(?![\\p{L}\\p{N}])`,
      "iu",
    );
    const match = pattern.exec(text);
    if (match && match.index !== undefined) {
      const remainder =
        text.slice(0, match.index) +
        " " +
        text.slice(match.index + match[0].length);
      return { matched: candidate, remainder };
    }
  }

  return { matched: "", remainder: text };
}

function stripLeadingGameTag(text: string, gameTag: string): string {
  const tag = gameTag.trim();
  if (!tag) return text;
  const pattern = new RegExp(
    `^\\s*${escapeRegExp(tag)}(?![\\p{L}\\p{N}])(?:\\s*[\\-—–|:]\\s*|\\s*)`,
    "iu",
  );
  return text.replace(pattern, " ");
}

function extractAndStripEpisode(
  remainder: string,
  originalTitle: string,
): { episode: number | ""; remainder: string } {
  // Match explicit episode markers anywhere in remainder: Ep 12, EP. 12, Episode 12, Part 12, #12
  const explicitEpRe =
    /(?<![\p{L}\p{N}])(?:(?:ep(?:isode)?|part|pt)\.?\s*|#)(\d+)(?![\d/\u2215])/iu;
  const explicitMatch = explicitEpRe.exec(remainder);
  if (explicitMatch && explicitMatch.index !== undefined) {
    const epNum = parseInt(explicitMatch[1], 10);
    if (!isNaN(epNum) && epNum > 0) {
      const nextRemainder =
        remainder.slice(0, explicitMatch.index) +
        " " +
        remainder.slice(explicitMatch.index + explicitMatch[0].length);
      return { episode: epNum, remainder: nextRemainder };
    }
  }

  // Fallback to trailing separator pattern (e.g., "— 14", "- 14") on cleaned remainder or original title
  const trailingRe = /(?:[—–\-|\u2223]\s*|#)(\d+)(?![\d/\u2215])(?:\s*|$)/;
  const cleanedForTrailing = remainder.replace(/[\s\-—–|:]+$/g, "");
  const fallbackEp =
    extractEpisodeFromTitle(cleanedForTrailing) ||
    extractEpisodeFromTitle(originalTitle);

  if (fallbackEp > 0) {
    const nextRemainder = remainder.replace(trailingRe, " ");
    return { episode: fallbackEp, remainder: nextRemainder };
  }

  return { episode: "", remainder };
}

function cleanEventRemainder(text: string): string {
  let cleaned = text
    .replace(/(?:\s*[\-—–|]\s*){2,}/g, " - ")
    .replace(/^[\s\-—–|:]+|[\s\-—–|:]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) return "";

  const withoutNoise = cleaned
    .replace(/(?<![\p{L}\p{N}])(?:clips?|highlights?)(?![\p{L}\p{N}])/giu, " ")
    .replace(/^[\s\-—–|:]+|[\s\-—–|:]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return withoutNoise || cleaned;
}

/**
 * Extracts template fields from a historical YouTube video title and metadata.
 */
export function extractNormalizedFields(
  input: NormalizeTitleInput,
): ExtractedTitleFields {
  const {
    currentTitle,
    publishedAt,
    gameTag,
    profile,
    recentFieldValues,
  } = input;

  // 1. Date extraction
  const dateResult = extractAndStripDate(currentTitle);
  let remainder = dateResult.remainder;
  let date = dateResult.date;
  let dateSource: DateSource = "title";

  if (!date) {
    date = formatPublishedDate(publishedAt);
    dateSource = "published";
  }

  // 2. Game mode extraction (multiplayer profiles)
  let gameMode = "";
  if (profile?.type === "multiplayer" && profile.modes?.length) {
    const modeResult = matchAndStripCandidate(remainder, profile.modes);
    gameMode = modeResult.matched;
    remainder = modeResult.remainder;
  }

  // 3. Custom template variables
  const customVars: Record<string, string> = {};
  if (profile?.titleTemplate) {
    const varNames = extractCustomVars(profile.titleTemplate);
    for (const varName of varNames) {
      const knownValues = recentFieldValues?.[varName] ?? [];
      if (knownValues.length > 0) {
        const varResult = matchAndStripCandidate(remainder, knownValues);
        if (varResult.matched) {
          customVars[varName] = varResult.matched;
          remainder = varResult.remainder;
        }
      }
    }
  }

  // 4. Strip gameTag prefix and extract episode for singleplayer or {episode} templates
  remainder = stripLeadingGameTag(remainder, gameTag);

  let episode: number | "" = "";
  const needsEpisode =
    profile?.type !== "multiplayer" ||
    Boolean(profile.titleTemplate && /\{episode\}/i.test(profile.titleTemplate));

  if (needsEpisode) {
    const epResult = extractAndStripEpisode(remainder, currentTitle);
    episode = epResult.episode;
    remainder = epResult.remainder;
  }

  // 5. Event / remainder cleanup
  const event = cleanEventRemainder(remainder);

  return {
    event,
    gameMode,
    date,
    dateSource,
    episode,
    customVars,
  };
}

/**
 * Builds a normalized YouTube title from extracted fields and game profile.
 */
export function buildNormalizedTitle(
  fields: ExtractedTitleFields,
  input: Pick<
    NormalizeTitleInput,
    "gameTag" | "profile" | "titleSeparator" | "contentType"
  >,
): string {
  const { gameTag, profile, titleSeparator, contentType } = input;
  const sep = titleSeparator || " — ";

  if (profile?.type === "multiplayer") {
    const template = profile.titleTemplate || DEFAULT_MULTIPLAYER_TEMPLATE;
    let res = template.replace(/\{game\}/gi, gameTag.trim());
    res = res.replace(/\{event\}/gi, fields.event.trim());
    res = res.replace(/\{gamemode\}/gi, fields.gameMode.trim());
    res = res.replace(/\{date\}/gi, fields.date.trim());
    res = res.replace(
      /\{episode\}/gi,
      fields.episode !== "" && fields.episode > 0 ? String(fields.episode) : "",
    );

    const customVarNames = extractCustomVars(template);
    for (const varName of customVarNames) {
      const val = fields.customVars[varName]?.trim() || "";
      res = res.replace(new RegExp(`\\{${escapeRegExp(varName)}\\}`, "gi"), val);
    }

    res = res.replace(/(?:\s*-\s*){2,}/g, " - ");
    res = res.replace(/^\s*-\s*/, "");
    res = res.replace(/\s*-\s*$/, "");
    return res.trim();
  }

  const parts: string[] = [];
  if (gameTag.trim()) parts.push(gameTag.trim());
  if (fields.date.trim()) parts.push(fields.date.trim());

  if (contentType === "clip") {
    const clipTitle = fields.event.trim() || "Clip";
    parts.push(clipTitle);
  } else if (fields.episode !== "" && fields.episode > 0) {
    parts.push(String(fields.episode));
  }

  return parts.join(sep);
}

/**
 * Evaluates extracted fields against template requirements to determine missing
 * fields and overall normalization status.
 */
export function evaluateNormalizedTitle(
  currentTitle: string,
  fields: ExtractedTitleFields,
  input: Pick<
    NormalizeTitleInput,
    "gameTag" | "profile" | "titleSeparator" | "contentType"
  >,
): NormalizedTitleResult {
  const { gameTag, profile, contentType } = input;
  const missingFields: string[] = [];

  if (profile?.type === "multiplayer") {
    const template = profile.titleTemplate || DEFAULT_MULTIPLAYER_TEMPLATE;
    const hasStandardValue: Record<string, boolean> = {
      game: Boolean(gameTag.trim()),
      event: Boolean(fields.event.trim()),
      gamemode: Boolean(fields.gameMode.trim()),
      date: Boolean(fields.date.trim()),
      episode: fields.episode !== "" && fields.episode > 0,
    };
    const seen = new Set<string>();

    for (const match of template.matchAll(/\{([^}]+)\}/g)) {
      const key = match[1].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const filled =
        key in hasStandardValue
          ? hasStandardValue[key]
          : Boolean(fields.customVars[key]?.trim());
      if (!filled) {
        missingFields.push(key);
      }
    }
  } else {
    if (!fields.date.trim()) {
      missingFields.push("date");
    }
    if (contentType === "clip") {
      if (!fields.event.trim()) {
        missingFields.push("event");
      }
    } else if (fields.episode === "" || fields.episode <= 0) {
      missingFields.push("episode");
    }
  }

  const proposedTitle = buildNormalizedTitle(fields, input);

  let status: NormalizationStatus;
  if (missingFields.length > 0) {
    status = "needs_review";
  } else if (titlesMatch(currentTitle, proposedTitle)) {
    status = "already_normalized";
  } else {
    status = "ready";
  }

  return {
    fields,
    proposedTitle,
    missingFields,
    status,
  };
}
