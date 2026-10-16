import { describe, it, expect } from "vitest";
import { getTopGames } from "../heatmapTopGames";
import type { EnrichedDailyCount } from "../gameStats";

describe("getTopGames", () => {
  const sampleData: Record<string, EnrichedDailyCount> = {
    "2026-01-10": {
      date: "2026-01-10",
      count: 3,
      totalHours: 4.5,
      games: [
        { game: "Elden Ring", count: 2, hours: 3.5 },
        { game: "Hollow Knight", count: 1, hours: 1.0 },
      ],
    },
    "2026-02-15": {
      date: "2026-02-15",
      count: 2,
      totalHours: 3.0,
      games: [
        { game: "elden ring", count: 1, hours: 1.5 },
        { game: "Celeste", count: 1, hours: 1.5 },
      ],
    },
    "2025-11-20": {
      date: "2025-11-20",
      count: 4,
      totalHours: 10.0,
      games: [
        { game: "Dark Souls III", count: 4, hours: 10.0 },
      ],
    },
  };

  it("aggregates hours and sessions across days in 'all' scope, sorted by hours descending", () => {
    const result = getTopGames(sampleData, "all", "All");
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      game: "Dark Souls III",
      hours: 10.0,
      sessions: 4,
    });
    expect(result[1]).toEqual({
      game: "Elden Ring",
      hours: 5.0,
      sessions: 3,
    });
    expect(result[2].hours).toBe(1.5);
    expect(result[3].hours).toBe(1.0);
  });

  it("filters correctly by year when scope is 'year'", () => {
    const result2026 = getTopGames(sampleData, "year", "2026");
    expect(result2026).toHaveLength(3);
    expect(result2026.map((g) => g.game)).toEqual([
      "Elden Ring",
      "Celeste",
      "Hollow Knight",
    ]);

    const result2025 = getTopGames(sampleData, "year", "2025");
    expect(result2025).toHaveLength(1);
    expect(result2025[0].game).toBe("Dark Souls III");
  });

  it("falls back to all dates if scope is 'year' but year is 'All'", () => {
    const result = getTopGames(sampleData, "year", "All");
    expect(result).toHaveLength(4);
    expect(result[0].game).toBe("Dark Souls III");
  });

  it("respects limit parameter and defaults to 5", () => {
    const manyGamesData: Record<string, EnrichedDailyCount> = {};
    const gamesList = ["A", "B", "C", "D", "E", "F", "G"];
    gamesList.forEach((game, idx) => {
      manyGamesData[`2026-03-0${idx + 1}`] = {
        date: `2026-03-0${idx + 1}`,
        count: 1,
        games: [{ game, count: 1, hours: 10 - idx }],
      };
    });

    const defaultTop = getTopGames(manyGamesData, "all", "All");
    expect(defaultTop).toHaveLength(5);
    expect(defaultTop.map((g) => g.game)).toEqual(["A", "B", "C", "D", "E"]);

    const top3 = getTopGames(manyGamesData, "all", "All", 3);
    expect(top3).toHaveLength(3);
    expect(top3.map((g) => g.game)).toEqual(["A", "B", "C"]);
  });

  it("handles empty or missing calendar data gracefully", () => {
    expect(getTopGames({}, "year", "2026")).toEqual([]);
    expect(getTopGames({ "2026-01-01": { date: "2026-01-01", count: 0 } }, "year", "2026")).toEqual([]);
  });
});
