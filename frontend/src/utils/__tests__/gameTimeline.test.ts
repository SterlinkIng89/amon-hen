import { describe, it, expect } from "vitest";
import {
  buildMonthStints,
  buildYearStints,
  formatDateLabel,
  calculateDayGap,
  formatGapDateLabel,
} from "../gameTimeline";
import { HistoricalVideo } from "../gameStats";

describe("gameTimeline utils", () => {
  it("formats date labels accurately for single and range days", () => {
    expect(formatDateLabel("2026-10-15", "2026-10-15")).toBe("Oct 15");
    expect(formatDateLabel("2026-10-01", "2026-10-09")).toBe("Oct 1 – 9");
    expect(formatDateLabel("2026-09-30", "2026-10-02")).toBe("Sep 30 – Oct 2");
  });

  it("builds chronological stints with A -> B -> A pattern", () => {
    const videos: HistoricalVideo[] = [
      {
        title: "Metaphor ReFantazio - Day 1",
        published: "2026-10-01T10:00:00Z",
        duration: "PT3H",
      },
      {
        title: "Metaphor ReFantazio - Day 2",
        published: "2026-10-02T10:00:00Z",
        duration: "PT3H",
      },
      // Break with game B
      {
        title: "Tekken 8 - Session",
        published: "2026-10-05T10:00:00Z",
        duration: "PT2H",
      },
      // Return to Metaphor
      {
        title: "Metaphor ReFantazio - Day 3",
        published: "2026-10-07T10:00:00Z",
        duration: "PT4H",
      },
    ];

    const stints = buildMonthStints(videos, "2026-10");
    expect(stints.length).toBe(3);

    // Stint 1
    expect(stints[0].startDate).toBe("2026-10-01");
    expect(stints[0].endDate).toBe("2026-10-02");
    expect(stints[0].games[0].game).toBe("Metaphor ReFantazio");
    expect(stints[0].games[0].hours).toBe(6);

    // Stint 2 (Tekken)
    expect(stints[1].startDate).toBe("2026-10-05");
    expect(stints[1].endDate).toBe("2026-10-05");
    expect(stints[1].games[0].game).toBe("Tekken 8");
    expect(stints[1].games[0].hours).toBe(2);

    // Stint 3 (Metaphor return)
    expect(stints[2].startDate).toBe("2026-10-07");
    expect(stints[2].endDate).toBe("2026-10-07");
    expect(stints[2].games[0].game).toBe("Metaphor ReFantazio");
    expect(stints[2].games[0].hours).toBe(4);
  });

  it("handles days with multiple games (stacked games)", () => {
    const videos: HistoricalVideo[] = [
      {
        title: "Armored Core VI - Day 1",
        published: "2026-10-12T10:00:00Z",
        duration: "PT5H",
      },
      {
        title: "Street Fighter 6 - Day 1",
        published: "2026-10-12T18:00:00Z",
        duration: "PT2H",
      },
    ];

    const stints = buildMonthStints(videos, "2026-10");
    expect(stints.length).toBe(1);
    expect(stints[0].games.length).toBe(2);
    expect(stints[0].games[0].game).toBe("Armored Core VI");
    expect(stints[0].games[1].game).toBe("Street Fighter 6");
  });

  it("sorts games by firstPlayedAt ascending within a day (first played game in front)", () => {
    // Game B has more hours (4h) but was played later (18:00)
    // Game A has fewer hours (1h) but was played first (09:00)
    // Game C was played between them (12:00, 2h)
    const videos: HistoricalVideo[] = [
      {
        title: "Heavy Game - Session 2",
        published: "2026-10-15T18:00:00Z",
        duration: "PT4H",
      },
      {
        title: "First Game - Morning Session",
        published: "2026-10-15T09:00:00Z",
        duration: "PT1H",
      },
      {
        title: "Midday Game - Lunch Session",
        published: "2026-10-15T12:00:00Z",
        duration: "PT2H",
      },
    ];

    const stints = buildMonthStints(videos, "2026-10");
    expect(stints.length).toBe(1);
    expect(stints[0].games.length).toBe(3);
    // Should be ordered strictly ascending by firstPlayedAt: First Game -> Midday Game -> Heavy Game
    expect(stints[0].games[0].game).toBe("First Game");
    expect(stints[0].games[0].firstPlayedAt).toBe("2026-10-15T09:00:00Z");
    expect(stints[0].games[1].game).toBe("Midday Game");
    expect(stints[0].games[1].firstPlayedAt).toBe("2026-10-15T12:00:00Z");
    expect(stints[0].games[2].game).toBe("Heavy Game");
    expect(stints[0].games[2].firstPlayedAt).toBe("2026-10-15T18:00:00Z");
  });

  it("skips non-active days smoothly without creating empty gap entries", () => {
    const videos: HistoricalVideo[] = [
      {
        title: "Game A - Part 1",
        published: "2026-10-01T10:00:00Z",
        duration: "PT1H",
      },
      // Oct 2 to 9 have no videos
      {
        title: "Game B - Part 1",
        published: "2026-10-10T10:00:00Z",
        duration: "PT1H",
      },
    ];

    const stints = buildMonthStints(videos, "2026-10");
    expect(stints.length).toBe(2);
    expect(stints[0].startDate).toBe("2026-10-01");
    expect(stints[1].startDate).toBe("2026-10-10");
  });

  it("calculates day gap and formats gap date label between stints accurately", () => {
    // Consecutive days: gap is 0
    expect(calculateDayGap("2026-10-04", "2026-10-05")).toBe(0);
    expect(formatGapDateLabel("2026-10-04", "2026-10-05")).toBe("");

    // 1-day gap: Oct 7 was inactive between Oct 6 and Oct 8
    expect(calculateDayGap("2026-10-06", "2026-10-08")).toBe(1);
    expect(formatGapDateLabel("2026-10-06", "2026-10-08")).toBe("Oct 7");

    // Multi-day gap: Oct 6, 7, 8 were inactive between Oct 5 and Oct 9 (3 days)
    expect(calculateDayGap("2026-10-05", "2026-10-09")).toBe(3);
    expect(formatGapDateLabel("2026-10-05", "2026-10-09")).toBe("Oct 6 – 8");
  });

  describe("buildYearStints", () => {
    it("returns empty array when videos or year are missing", () => {
      expect(buildYearStints([], "2026")).toEqual([]);
      expect(buildYearStints([{ title: "Game", published: "2026-05-01", duration: "PT1H" }], "")).toEqual([]);
    });

    it("builds chronological stints across multiple months in the selected year", () => {
      const videos: HistoricalVideo[] = [
        {
          title: "Balatro - Run 1",
          published: "2026-03-10T12:00:00Z",
          duration: "PT2H",
        },
        {
          title: "Balatro - Run 2",
          published: "2026-03-11T12:00:00Z",
          duration: "PT3H",
        },
        {
          title: "Elden Ring - DLC",
          published: "2026-06-21T18:00:00Z",
          duration: "PT5H",
        },
        {
          title: "Hades II - Early Access",
          published: "2026-10-01T15:00:00Z",
          duration: "PT4H",
        },
        // Video from another year should be ignored
        {
          title: "Silksong - 2025 Release",
          published: "2025-11-01T12:00:00Z",
          duration: "PT10H",
        },
      ];

      const stints = buildYearStints(videos, "2026");
      expect(stints.length).toBe(3);

      // Stint 1: Balatro in March
      expect(stints[0].startDate).toBe("2026-03-10");
      expect(stints[0].endDate).toBe("2026-03-11");
      expect(stints[0].dayCount).toBe(2);
      expect(stints[0].totalHours).toBe(5);
      expect(stints[0].games[0].game).toBe("Balatro");

      // Stint 2: Elden Ring in June
      expect(stints[1].startDate).toBe("2026-06-21");
      expect(stints[1].endDate).toBe("2026-06-21");
      expect(stints[1].totalHours).toBe(5);
      expect(stints[1].games[0].game).toBe("Elden Ring");

      // Stint 3: Hades II in October
      expect(stints[2].startDate).toBe("2026-10-01");
      expect(stints[2].endDate).toBe("2026-10-01");
      expect(stints[2].totalHours).toBe(4);
      expect(stints[2].games[0].game).toBe("Hades II");
    });
  });
});
