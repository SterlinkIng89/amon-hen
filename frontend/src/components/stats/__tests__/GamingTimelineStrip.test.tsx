import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GamingTimelineStrip } from "../GamingTimelineStrip";
import { GameStint } from "../../../utils/gameTimeline";

vi.mock("../../../hooks/useSteamGameData", () => ({
  useSteamGameData: vi.fn((gameName: string) => ({
    appId: 100,
    posterUrl: gameName ? `https://example.com/${encodeURIComponent(gameName)}.jpg` : null,
    heroUrl: null,
    achievementsPct: 75,
    isLoading: false,
  })),
}));

describe("GamingTimelineStrip Component", () => {
  const mockStints: readonly GameStint[] = [
    {
      id: "stint-1",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      dayCount: 3,
      totalHours: 5,
      games: [{ game: "Hades II", hours: 5 }],
    },
    {
      id: "stint-2",
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      dayCount: 1,
      totalHours: 2.5,
      games: [
        { game: "Silksong", hours: 1.5 },
        { game: "Celeste", hours: 1.0 },
      ],
    },
  ];

  it("renders empty state when there are no stints", () => {
    render(<GamingTimelineStrip stints={[]} />);
    expect(screen.getByText("Monthly timeline")).toBeDefined();
    expect(screen.getByText("No activity recorded for this period")).toBeDefined();
  });

  it("renders wrapping multi-row layout without forced horizontal scrolling", () => {
    const { container } = render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedStintId="stint-1"
        onSelectStint={vi.fn()}
      />
    );

    // Should not contain single-line forced horizontal scroll track or min-w-max
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeNull();

    const minWMax = container.querySelector(".min-w-max");
    expect(minWMax).toBeNull();

    // Container should use flex-wrap or grid for wrapping items
    const wrappingContainer = container.querySelector(".flex-wrap, .grid");
    expect(wrappingContainer).not.toBeNull();
  });

  it("renders stint cards with date pills and horizontal game segments", () => {
    render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedStintId="stint-1"
        onSelectStint={vi.fn()}
      />
    );

    // Stints have date pills and playtime
    expect(screen.getByText("Oct 1 – 3")).toBeDefined();
    expect(screen.getByText("Oct 4")).toBeDefined();

    // Stint 2 should render subtitle indicating 2 games
    expect(screen.getByText(/2 games/)).toBeDefined();

    // Stint 1 should render subtitle with days count
    expect(screen.getByText(/3 days/)).toBeDefined();
  });

  it("allows bringing rear game to front in stacked card stint", () => {
    const handleSelect = vi.fn();
    render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedStintId="stint-2"
        onSelectStint={handleSelect}
      />
    );

    // Stint 2 has 2 games, Celeste is behind Silksong
    const bringCelesteBtn = screen.getByRole("button", { name: "Bring Celeste to front" });
    expect(bringCelesteBtn).toBeDefined();

    fireEvent.click(bringCelesteBtn);
    // After clicking rear layer, callback is invoked with the clicked game
    expect(handleSelect).toHaveBeenCalledWith(mockStints[1], "Celeste");
  });

  it("renders an inactive break indicator when there is a calendar gap between stints", () => {
    const stintsWithGap: readonly GameStint[] = [
      {
        id: "stint-1",
        startDate: "2026-10-06",
        endDate: "2026-10-06",
        dayCount: 1,
        totalHours: 1,
        games: [{ game: "SOS OPS!", hours: 1 }],
      },
      {
        id: "stint-2",
        startDate: "2026-10-08",
        endDate: "2026-10-08",
        dayCount: 1,
        totalHours: 2,
        games: [{ game: "Control Resonant", hours: 2 }],
      },
    ];

    render(
      <GamingTimelineStrip
        stints={stintsWithGap}
        selectedStintId="stint-1"
      />
    );

    // The gap between Oct 6 and Oct 8 is 1 day (Oct 7)
    expect(screen.getByText("1d break")).toBeDefined();
    expect(screen.getByText("Oct 7")).toBeDefined();
  });

  it("renders seamless connector lines and centered intermediate dot between consecutive stints", () => {
    const { container } = render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedStintId="stint-1"
      />
    );

    // Connecting dot between consecutive stints
    const dotNode = container.querySelector('[class*="translate-x-1/2"]');
    expect(dotNode).not.toBeNull();

    // StintCards have matching fixed track row height and gap alignment classes
    const trackRows = container.querySelectorAll(".h-7");
    expect(trackRows.length).toBe(mockStints.length);
  });
});
