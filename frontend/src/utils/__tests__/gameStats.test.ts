import { describe, it, expect } from "vitest";
import {
  parseDurationToHours,
  extractGameName,
  resolveSessionGameName,
  aggregateDailyActivity,
  normalizeGameKey,
  assignGameColors,
  buildDailyGameBreakdown,
  buildMonthlyGameBreakdown,
  filterHistoricalVideos,
  computeHeatmapPeriodSummary,
  EnrichedDailyCount,
  HistoricalVideo,
} from "../gameStats";

describe("gameStats utils", () => {
  it("parses ISO 8601 duration and HH:MM:SS accurately", () => {
    expect(parseDurationToHours("PT1H30M0S")).toBe(1.5);
    expect(parseDurationToHours("01:30:00")).toBe(1.5);
    expect(parseDurationToHours("3600")).toBe(1);
    expect(parseDurationToHours("")).toBe(0);
  });

  it("extracts game name with or without gameTag", () => {
    expect(extractGameName("Metaphor: ReFantazio - Part 1", "Metaphor")).toBe("Metaphor");
    expect(extractGameName("Core Keeper - Episode 5")).toBe("Core Keeper");
    expect(extractGameName("Alone Title")).toBe("Alone Title");
  });

  it("ignores purely numeric/timestamp prefixes in resolveSessionGameName", () => {
    expect(resolveSessionGameName("2026-10-15 18-30-00.mp4")).toBe("");
    expect(resolveSessionGameName("2026-10-15 18-30-00.mp4", "Elden Ring")).toBe("Elden Ring");
    expect(resolveSessionGameName("Hades II — 15/10/26 — 4")).toBe("Hades II");
  });

  it("aggregates daily activity counts, hours, games, and sources", () => {
    const res = aggregateDailyActivity([
      { date: "2026-10-10", game: "Hades II", hours: 1.5, source: "local" },
      { date: "2026-10-10", game: "hades ii", hours: 2.0, source: "youtube" },
      { date: "2026-10-10", game: "Deadlock", hours: 1.0, source: "local" },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({
      date: "2026-10-10",
      count: 3,
      totalHours: 4.5,
      localCount: 2,
      youtubeCount: 1,
      games: [
        { game: "Hades II", count: 2, hours: 3.5 },
        { game: "Deadlock", count: 1, hours: 1.0 },
      ],
    });
  });

  it("normalizes game key consistently", () => {
    expect(normalizeGameKey("Core Keeper")).toBe("corekeeper");
    expect(normalizeGameKey("Metaphor: Re-Fantazio")).toBe("metaphor:refantazio");
  });

  it("assigns consistent colors to top games", () => {
    const colors = assignGameColors(["Game A", "Game B"]);
    expect(colors["Game A"]).toBeDefined();
    expect(colors["Game B"]).toBeDefined();
    expect(colors["Game A"]).not.toBe(colors["Game B"]);
  });

  it("builds daily game breakdown correctly for a given month", () => {
    const sampleVideos: HistoricalVideo[] = [
      {
        title: "Metaphor ReFantazio - Day 1",
        published: "2026-10-01T12:00:00Z",
        duration: "PT2H0M0S",
      },
      {
        title: "Core Keeper - Day 1",
        published: "2026-10-01T18:00:00Z",
        duration: "PT1H0M0S",
      },
      {
        title: "Metaphor ReFantazio - Day 3",
        published: "2026-10-03T12:00:00Z",
        duration: "PT3H0M0S",
      },
    ];

    const days = buildDailyGameBreakdown(sampleVideos, "2026", "2026-10");
    expect(days.length).toBe(31);

    const day1 = days.find((d) => d.dayNum === 1);
    expect(day1?.totalHours).toBe(3);
    expect(day1?.byGame["Metaphor ReFantazio"]).toBe(2);
    expect(day1?.byGame["Core Keeper"]).toBe(1);

    const day2 = days.find((d) => d.dayNum === 2);
    expect(day2?.totalHours).toBe(0);

    const day3 = days.find((d) => d.dayNum === 3);
    expect(day3?.totalHours).toBe(3);
  });

  it("filters videos by date and exclude words", () => {
    const videos: HistoricalVideo[] = [
      { title: "Normal Stream", published: "2026-10-01T00:00:00Z", duration: "PT1H" },
      { title: "Test Stream Excluded", published: "2026-10-02T00:00:00Z", duration: "PT1H" },
    ];
    const filtered = filterHistoricalVideos(videos, {
      value: { excludeWords: ["excluded"] },
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("Normal Stream");
  });

  it("computes heatmap period summary including monthly active days for All-time, current year, and past year", () => {
    const calendarData: Record<string, EnrichedDailyCount> = {
      "2025-05-01": { date: "2025-05-01", count: 2 },
      "2025-05-02": { date: "2025-05-02", count: 5 },
      "2025-05-03": { date: "2025-05-03", count: 1 },
      "2025-05-04": { date: "2025-05-04", count: 1 },
      "2026-01-08": { date: "2026-01-08", count: 4 },
      "2026-01-09": { date: "2026-01-09", count: 2 },
      "2026-01-10": { date: "2026-01-10", count: 3 },
    };
    const today = new Date(2026, 0, 10, 15, 0, 0); // Jan 10, 2026

    const pastSummary = computeHeatmapPeriodSummary(
      calendarData,
      "2025",
      ["2026", "2025"],
      today,
    );
    expect(pastSummary).toEqual({
      totalSessions: 9,
      activeDays: 4,
      totalDaysInPeriod: 365,
      activePercentage: Math.round((4 / 365) * 100),
      monthLabel: "May",
      monthActiveDays: 4,
      monthTotalDays: 31,
      monthActivePercentage: Math.round((4 / 31) * 100),
      longestStreak: 4,
      currentStreak: 0,
    });

    const currentYearSummary = computeHeatmapPeriodSummary(
      calendarData,
      "2026",
      ["2026", "2025"],
      today,
    );
    expect(currentYearSummary).toEqual({
      totalSessions: 9,
      activeDays: 3,
      totalDaysInPeriod: 10,
      activePercentage: 30,
      monthLabel: "Jan",
      monthActiveDays: 3,
      monthTotalDays: 10,
      monthActivePercentage: 30,
      longestStreak: 3,
      currentStreak: 3,
    });

    const allSummary = computeHeatmapPeriodSummary(
      calendarData,
      "All",
      ["2026", "2025"],
      today,
    );
    expect(allSummary).toEqual({
      totalSessions: 18,
      activeDays: 7,
      totalDaysInPeriod: 375, // 365 in 2025 + 10 in 2026
      activePercentage: Math.round((7 / 375) * 100),
      monthLabel: "Jan",
      monthActiveDays: 3,
      monthTotalDays: 10,
      monthActivePercentage: 30,
      longestStreak: 4,
      currentStreak: 3,
    });
  });
});

