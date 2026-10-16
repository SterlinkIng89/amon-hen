import type { EnrichedDailyCount } from "./gameStats";
import { normalizeGameKey } from "./gameStats";

export interface TopGame {
  readonly game: string;
  readonly hours: number;
  readonly sessions: number;
}

export type TopGamesScope = "year" | "all";

export function getTopGames(
  calendarData: Record<string, EnrichedDailyCount>,
  scope: TopGamesScope,
  year: string,
  limit: number = 5,
): TopGame[] {
  if (!calendarData) {
    return [];
  }

  const isYearScoped = scope === "year" && year !== "All";
  const yearPrefix = `${year}-`;

  const map: Record<string, { game: string; hours: number; sessions: number }> = {};

  for (const [dateKey, entry] of Object.entries(calendarData)) {
    if (isYearScoped && !dateKey.startsWith(yearPrefix)) {
      continue;
    }

    if (!entry.games || entry.games.length === 0) {
      continue;
    }

    for (const g of entry.games) {
      if (!g.game || g.game.trim().length === 0) continue;
      const key = normalizeGameKey(g.game);
      if (!key) continue;

      const existing = map[key];
      if (!existing) {
        map[key] = {
          game: g.game.trim(),
          hours: g.hours || 0,
          sessions: g.count || 0,
        };
      } else {
        existing.hours += g.hours || 0;
        existing.sessions += g.count || 0;
      }
    }
  }

  return Object.values(map)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, limit);
}
