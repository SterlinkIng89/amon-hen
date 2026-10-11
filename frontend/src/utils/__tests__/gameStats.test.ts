import { describe, it, expect } from "vitest";
import {
  parseDurationToHours,
  extractGameName,
  normalizeGameKey,
  assignGameColors,
  buildDailyGameBreakdown,
  buildMonthlyGameBreakdown,
  filterHistoricalVideos,
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
});
