export type PlaytimeBucket = "all" | "unplayed" | "tried" | "played" | "obsession";
export type AchievementFilter = "all" | "perfect" | "almost_there" | "unrecorded_gems";
export type BacklogStatus = "playing" | "up_next" | "candidate" | "on_hold" | "dropped";
export type TierLevel = "S" | "A" | "B" | "C" | "D";

export interface SteamLibraryPulse {
  readonly totalGames: number;
  readonly totalHours: number;
  readonly unplayedGames: number;
  readonly triedGames: number;
  readonly playedGames: number;
  readonly obsessionGames: number;
  readonly top10SharePct: number;
  readonly totalAchievements: number;
  readonly unlockedAchievements: number;
  readonly perfectGamesCount: number;
  readonly almostThereCount: number;
  readonly recordedGamesCount: number;
}

export interface SteamGameInsight {
  readonly appid: number;
  readonly name: string;
  readonly playtimeHours: number;
  readonly playtimeForever: number;
  readonly playtime2Weeks: number;
  readonly headerUrl: string;
  readonly posterUrl: string;
  readonly achievementsPct: number;
  readonly developers: string;
  readonly publishers: string;
  readonly genres: string;
  readonly isUtility?: boolean;
  readonly ytVideosCount: number;
  readonly ytRecordedHours: number;
  readonly backlogStatus?: BacklogStatus;
  readonly backlogRank?: number;
  readonly backlogNotes?: string;
  readonly personalTier?: TierLevel;
  readonly personalScore?: number;
  readonly personalNotes?: string;
}

export interface SteamFilterOptions {
  readonly search?: string;
  readonly bucket?: PlaytimeBucket;
  readonly achievementFilter?: AchievementFilter;
  readonly developer?: string | null;
  readonly publisher?: string | null;
  readonly tag?: string | null;
}

export interface SmartSuggestionItem {
  readonly game: SteamGameInsight;
  readonly matchReasons: readonly string[];
  readonly score: number;
}

const STEAM_CORPORATE_SUFFIXES = new Set([
  "inc.",
  "inc",
  "ltd.",
  "ltd",
  "llc",
  "l.l.c.",
  "s.a.",
  "s.a",
  "gmbh",
  "co.",
  "co",
  "corp.",
  "corp",
  "corporation",
  "interactive entertainment",
]);

/**
 * Splits comma-separated studio names while re-attaching corporate suffixes.
 */
export function splitSteamCompanies(raw: string): string[] {
  if (!raw) return [];
  const tokens = raw.split(",");
  const result: string[] = [];

  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;

    const lower = t.toLowerCase();
    if (STEAM_CORPORATE_SUFFIXES.has(lower)) {
      if (result.length > 0) {
        const lastIdx = result.length - 1;
        const separator = lower === "interactive entertainment" ? " " : ", ";
        result[lastIdx] = `${result[lastIdx]}${separator}${t}`;
      }
      continue;
    }

    result.push(t);
  }

  return result;
}

/**
 * Splits comma-separated tags or genres into cleaned tokens.
 */
export function splitSteamTags(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Checks whether a game's total playtime matches the specified bucket criteria.
 */
export function matchesPlaytimeBucket(
  playtimeForeverMinutes: number,
  bucket: PlaytimeBucket
): boolean {
  switch (bucket) {
    case "all":
      return true;
    case "unplayed":
      return playtimeForeverMinutes === 0;
    case "tried":
      return playtimeForeverMinutes > 0 && playtimeForeverMinutes < 120;
    case "played":
      return playtimeForeverMinutes >= 120 && playtimeForeverMinutes < 3000;
    case "obsession":
      return playtimeForeverMinutes >= 3000;
  }
}

/**
 * Checks whether a game satisfies the specified achievement or channel filter criteria.
 */
export function matchesAchievementFilter(
  game: SteamGameInsight,
  filter: AchievementFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "perfect":
      return Math.round(game.achievementsPct) >= 100;
    case "almost_there": {
      const rounded = Math.round(game.achievementsPct);
      return game.achievementsPct >= 75 && rounded < 100;
    }
    case "unrecorded_gems":
      return game.playtimeForever >= 1200 && game.ytVideosCount === 0;
  }
}

/**
 * Filters a collection of Steam games by playtime bucket, achievement/channel criteria,
 * studio (developer / publisher), genre tag, and search query.
 */
export function filterSteamGames(
  games: readonly SteamGameInsight[],
  options: SteamFilterOptions
): SteamGameInsight[] {
  const bucket = options.bucket ?? "all";
  const achievementFilter = options.achievementFilter ?? "all";
  const targetDev = options.developer?.trim().toLowerCase();
  const targetPub = options.publisher?.trim().toLowerCase();
  const targetTag = options.tag?.trim().toLowerCase();
  const searchQuery = options.search?.trim().toLowerCase();

  return games.filter((game) => {
    if (!matchesPlaytimeBucket(game.playtimeForever, bucket)) {
      return false;
    }

    if (!matchesAchievementFilter(game, achievementFilter)) {
      return false;
    }

    if (
      targetDev &&
      !splitSteamCompanies(game.developers).some((d) => d.toLowerCase() === targetDev)
    ) {
      return false;
    }

    if (
      targetPub &&
      !splitSteamCompanies(game.publishers).some((p) => p.toLowerCase() === targetPub)
    ) {
      return false;
    }

    if (
      targetTag &&
      !splitSteamTags(game.genres).some((t) => t.toLowerCase() === targetTag)
    ) {
      return false;
    }

    if (searchQuery) {
      const matchesSearch =
        game.name.toLowerCase().includes(searchQuery) ||
        game.developers.toLowerCase().includes(searchQuery) ||
        game.genres.toLowerCase().includes(searchQuery);
      if (!matchesSearch) return false;
    }

    return true;
  });
}

/**
 * Computes ranked smart backlog recommendations based on affinity with top genres and developers.
 */
export function computeSmartBacklogSuggestions(
  games: readonly SteamGameInsight[],
  topGenres: readonly string[],
  topDevs: readonly string[],
  limit: number = 8
): SmartSuggestionItem[] {
  const topDevMap = new Map<string, string>();
  for (const d of topDevs) {
    topDevMap.set(d.toLowerCase(), d);
  }

  const topGenreList = topGenres.map((g) => ({
    original: g,
    lower: g.toLowerCase(),
  }));

  const candidatePool = games.filter(
    (game) => game.playtimeForever < 120 && !game.isUtility && !game.backlogStatus
  );

  const scoredItems: SmartSuggestionItem[] = [];

  for (const game of candidatePool) {
    let score = 0;
    const matchReasons: string[] = [];

    // Developers (+3 points each)
    const gameDevs = splitSteamCompanies(game.developers);
    for (const dev of gameDevs) {
      const matchedTopDev = topDevMap.get(dev.toLowerCase());
      if (matchedTopDev) {
        score += 3;
        const reason = `By ${matchedTopDev}`;
        if (!matchReasons.includes(reason)) {
          matchReasons.push(reason);
        }
      }
    }

    // Genres (+2 for top 1-3, +1 for top 4-8)
    const gameGenres = splitSteamTags(game.genres);
    for (const genre of gameGenres) {
      const lower = genre.toLowerCase();
      const topIdx = topGenreList.findIndex((g) => g.lower === lower);
      if (topIdx >= 0 && topIdx < 3) {
        score += 2;
        const reason = topGenreList[topIdx].original;
        if (!matchReasons.includes(reason)) {
          matchReasons.push(reason);
        }
      } else if (topIdx >= 3 && topIdx < 8) {
        score += 1;
        const reason = topGenreList[topIdx].original;
        if (!matchReasons.includes(reason)) {
          matchReasons.push(reason);
        }
      }
    }

    if (score > 0) {
      scoredItems.push({
        game,
        matchReasons,
        score,
      });
    }
  }

  scoredItems.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.game.name.localeCompare(b.game.name);
  });

  return scoredItems.slice(0, limit);
}

/**
 * Picks an unplayed or tried game for Backlog Roulette.
 */
export function pickBacklogRouletteGame(
  games: readonly SteamGameInsight[],
  genreFilter?: string | null,
  randomFn: () => number = Math.random
): SteamGameInsight | null {
  const targetGenre = genreFilter?.trim().toLowerCase();

  const eligiblePool = games.filter((game) => {
    if (game.playtimeForever >= 120) return false;
    if (game.isUtility) return false;
    if (game.backlogStatus === "playing" || game.backlogStatus === "dropped") return false;

    if (
      targetGenre &&
      !splitSteamTags(game.genres).some((t) => t.toLowerCase() === targetGenre)
    ) {
      return false;
    }

    return true;
  });

  if (eligiblePool.length === 0) {
    return null;
  }

  const index = Math.floor(randomFn() * eligiblePool.length);
  return eligiblePool[index] ?? null;
}

export interface RawSteamGameItem {
  readonly appid: number;
  readonly name: string;
  readonly playtimeHours: number;
  readonly playtimeForever: number;
  readonly playtime2Weeks: number;
  readonly headerUrl: string;
  readonly posterUrl: string;
  readonly achievementsPct: number;
  readonly developers: string;
  readonly publishers: string;
  readonly genres: string;
  readonly isUtility?: boolean;
  readonly ytVideosCount: number;
  readonly ytRecordedHours: number;
  readonly backlogStatus?: string;
  readonly backlogRank?: number;
  readonly backlogNotes?: string;
  readonly personalTier?: string;
  readonly personalScore?: number;
  readonly personalNotes?: string;
}

export function normalizeGameInsight(game: RawSteamGameItem): SteamGameInsight {
  const validStatus: BacklogStatus | undefined =
    game.backlogStatus === "playing" ||
    game.backlogStatus === "up_next" ||
    game.backlogStatus === "candidate" ||
    game.backlogStatus === "on_hold" ||
    game.backlogStatus === "dropped"
      ? game.backlogStatus
      : undefined;

  const validTier: TierLevel | undefined =
    game.personalTier === "S" ||
    game.personalTier === "A" ||
    game.personalTier === "B" ||
    game.personalTier === "C" ||
    game.personalTier === "D"
      ? game.personalTier
      : undefined;

  return {
    ...game,
    backlogStatus: validStatus,
    personalTier: validTier,
  };
}
