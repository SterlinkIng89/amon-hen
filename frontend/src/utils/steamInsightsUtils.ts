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

export type RatingStatusFilter = "all" | "rated" | "unrated_10h" | "queued";
export type InspectorSortMode = "hours" | "score" | "achievements" | "recent" | "name";

export interface SteamFilterOptions {
  readonly search?: string;
  readonly bucket?: PlaytimeBucket;
  readonly achievementFilter?: AchievementFilter;
  readonly ratingStatusFilter?: RatingStatusFilter;
  readonly tierFilter?: TierLevel | null;
  readonly developer?: string | null;
  readonly publisher?: string | null;
  readonly tag?: string | null;
}

export interface StudioRatingSummary {
  readonly name: string;
  readonly avgScore: number;
  readonly ratedCount: number;
}

export interface PersonalRankingSummary {
  readonly ratedCount: number;
  readonly averageScore: number;
  readonly topStudio: StudioRatingSummary | null;
  readonly topMasterpiece: SteamGameInsight | null;
}

export interface GroupRatingStat {
  readonly avgScore: number;
  readonly ratedCount: number;
}

export interface GroupRatingStatsMap {
  readonly developers: Readonly<Record<string, GroupRatingStat>>;
  readonly publishers: Readonly<Record<string, GroupRatingStat>>;
  readonly tags: Readonly<Record<string, GroupRatingStat>>;
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
 * Maps a numeric 1–10 score to its default recommended tier.
 */
export function scoreToDefaultTier(score: number): TierLevel {
  if (score >= 9) return "S";
  if (score >= 8) return "A";
  if (score >= 6) return "B";
  if (score >= 4) return "C";
  return "D";
}

/**
 * Maps a tier level to its baseline default score when clicking tier buttons.
 */
export function tierToDefaultScore(tier: TierLevel): number {
  switch (tier) {
    case "S":
      return 10;
    case "A":
      return 8;
    case "B":
      return 6;
    case "C":
      return 4;
    case "D":
      return 2;
  }
}

/**
 * Resolves a game's effective personal score (explicit personalScore or tier baseline).
 * Returns -1 for unrated games.
 */
export function getEffectiveGameScore(game: SteamGameInsight): number {
  if (game.personalScore !== undefined) {
    return game.personalScore;
  }
  if (game.personalTier) {
    return tierToDefaultScore(game.personalTier);
  }
  return -1;
}

/**
 * Checks whether a game satisfies the specified rating status filter.
 */
export function matchesRatingStatusFilter(
  game: SteamGameInsight,
  filter: RatingStatusFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "rated":
      return Boolean(game.personalTier);
    case "unrated_10h":
      return !game.personalTier && !game.isUtility && game.playtimeForever >= 600;
    case "queued":
      return Boolean(game.backlogStatus);
  }
}

/**
 * Filters a collection of Steam games by playtime bucket, achievement/channel criteria,
 * rating status, tier level, studio (developer / publisher), genre tag, and search query.
 */
export function filterSteamGames(
  games: readonly SteamGameInsight[],
  options: SteamFilterOptions
): SteamGameInsight[] {
  const bucket = options.bucket ?? "all";
  const achievementFilter = options.achievementFilter ?? "all";
  const ratingStatusFilter = options.ratingStatusFilter ?? "all";
  const tierFilter = options.tierFilter;
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

    if (!matchesRatingStatusFilter(game, ratingStatusFilter)) {
      return false;
    }

    if (tierFilter && game.personalTier !== tierFilter) {
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
 * Sorts a collection of Steam games by the specified inspector sort mode.
 * Returns a new array and leaves the input array intact.
 */
export function sortSteamGames(
  games: readonly SteamGameInsight[],
  sortBy: InspectorSortMode
): SteamGameInsight[] {
  const sorted = [...games];

  return sorted.sort((a, b) => {
    switch (sortBy) {
      case "hours": {
        if (b.playtimeForever !== a.playtimeForever) {
          return b.playtimeForever - a.playtimeForever;
        }
        return a.name.localeCompare(b.name);
      }
      case "score": {
        const scoreA = getEffectiveGameScore(a);
        const scoreB = getEffectiveGameScore(b);
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        if (b.playtimeForever !== a.playtimeForever) {
          return b.playtimeForever - a.playtimeForever;
        }
        return a.name.localeCompare(b.name);
      }
      case "achievements": {
        if (b.achievementsPct !== a.achievementsPct) {
          return b.achievementsPct - a.achievementsPct;
        }
        if (b.playtimeForever !== a.playtimeForever) {
          return b.playtimeForever - a.playtimeForever;
        }
        return a.name.localeCompare(b.name);
      }
      case "recent": {
        if (b.playtime2Weeks !== a.playtime2Weeks) {
          return b.playtime2Weeks - a.playtime2Weeks;
        }
        if (b.playtimeForever !== a.playtimeForever) {
          return b.playtimeForever - a.playtimeForever;
        }
        return a.name.localeCompare(b.name);
      }
      case "name": {
        return a.name.localeCompare(b.name);
      }
    }
  });
}

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;

function isRatedGame(
  game: SteamGameInsight
): game is SteamGameInsight & { readonly personalTier: TierLevel } {
  return Boolean(game.personalTier);
}

/**
 * Computes high-level personal ranking analytics over rated games.
 */
export function computePersonalRankingSummary(
  games: readonly SteamGameInsight[]
): PersonalRankingSummary {
  const ratedGames = games.filter(isRatedGame);
  if (ratedGames.length === 0) {
    return {
      ratedCount: 0,
      averageScore: 0,
      topStudio: null,
      topMasterpiece: null,
    };
  }

  let totalScore = 0;
  let topMasterpiece: SteamGameInsight | null = null;
  let maxGameScore = -1;

  const studioMap = new Map<
    string,
    { name: string; totalScore: number; count: number; totalPlaytime: number }
  >();

  for (const game of ratedGames) {
    const effectiveScore = getEffectiveGameScore(game);
    totalScore += effectiveScore;

    if (
      effectiveScore > maxGameScore ||
      (effectiveScore === maxGameScore &&
        topMasterpiece &&
        (game.playtimeForever > topMasterpiece.playtimeForever ||
          (game.playtimeForever === topMasterpiece.playtimeForever &&
            game.name.localeCompare(topMasterpiece.name) < 0)))
    ) {
      maxGameScore = effectiveScore;
      topMasterpiece = game;
    }

    const devs = splitSteamCompanies(game.developers);
    for (const dev of devs) {
      const key = dev.toLowerCase();
      const existing = studioMap.get(key);
      if (existing) {
        existing.totalScore += effectiveScore;
        existing.count += 1;
        existing.totalPlaytime += game.playtimeForever;
      } else {
        studioMap.set(key, {
          name: dev,
          totalScore: effectiveScore,
          count: 1,
          totalPlaytime: game.playtimeForever,
        });
      }
    }
  }

  const averageScore = roundToOneDecimal(totalScore / ratedGames.length);

  let topStudio: StudioRatingSummary | null = null;
  let bestAvgScore = -1;
  let bestCount = -1;
  let bestPlaytime = -1;

  for (const item of studioMap.values()) {
    const avgScore = roundToOneDecimal(item.totalScore / item.count);
    if (
      avgScore > bestAvgScore ||
      (avgScore === bestAvgScore &&
        (item.count > bestCount ||
          (item.count === bestCount && item.totalPlaytime > bestPlaytime)))
    ) {
      bestAvgScore = avgScore;
      bestCount = item.count;
      bestPlaytime = item.totalPlaytime;
      topStudio = {
        name: item.name,
        avgScore,
        ratedCount: item.count,
      };
    }
  }

  return {
    ratedCount: ratedGames.length,
    averageScore,
    topStudio,
    topMasterpiece,
  };
}

function accumulateGroupRating(
  map: Map<string, { totalScore: number; count: number }>,
  tokens: readonly string[],
  score: number
): void {
  for (const token of tokens) {
    const key = token.toLowerCase();
    const curr = map.get(key) ?? { totalScore: 0, count: 0 };
    map.set(key, {
      totalScore: curr.totalScore + score,
      count: curr.count + 1,
    });
  }
}

/**
 * Computes average personal scores and rated counts aggregated across developers,
 * publishers, and genres/tags for rated games.
 */
export function computeGroupRatingMap(
  games: readonly SteamGameInsight[]
): GroupRatingStatsMap {
  const ratedGames = games.filter(isRatedGame);

  const devAccum = new Map<string, { totalScore: number; count: number }>();
  const pubAccum = new Map<string, { totalScore: number; count: number }>();
  const tagAccum = new Map<string, { totalScore: number; count: number }>();

  for (const game of ratedGames) {
    const effectiveScore = getEffectiveGameScore(game);
    accumulateGroupRating(devAccum, splitSteamCompanies(game.developers), effectiveScore);
    accumulateGroupRating(pubAccum, splitSteamCompanies(game.publishers), effectiveScore);
    accumulateGroupRating(tagAccum, splitSteamTags(game.genres), effectiveScore);
  }

  const buildResult = (
    accum: Map<string, { totalScore: number; count: number }>
  ): Record<string, GroupRatingStat> => {
    const res: Record<string, GroupRatingStat> = {};
    for (const [key, val] of accum.entries()) {
      res[key] = {
        avgScore: roundToOneDecimal(val.totalScore / val.count),
        ratedCount: val.count,
      };
    }
    return res;
  };

  return {
    developers: buildResult(devAccum),
    publishers: buildResult(pubAccum),
    tags: buildResult(tagAccum),
  };
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
