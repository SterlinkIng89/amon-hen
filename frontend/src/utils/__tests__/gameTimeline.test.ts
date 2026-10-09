import { describe, it, expect } from "vitest";
import {
  buildMonthStints,
  formatDateLabel,
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
});
