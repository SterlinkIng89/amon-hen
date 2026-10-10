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

  it("renders stint cards cleanly without game title text overlays", () => {
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

    // Cards should not display title overlays / text labels for game names when poster exists
    // The image alt attribute can exist for accessibility, but no rendered title badge div
    const overlayBadges = screen.queryByText("Hades II");
    // When posterUrl is mocked, Hades II should only be in alt attribute, not as visible text element
    expect(overlayBadges).toBeNull();
  });

  it("allows swapping active game for multiple games stint", () => {
    const handleSelect = vi.fn();
    render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedStintId="stint-2"
        onSelectStint={handleSelect}
      />
    );

    // Stint 2 has 2 games, should show swap button
    const swapBtn = screen.getByRole("button", { name: "Switch to next game" });
    expect(swapBtn).toBeDefined();

    fireEvent.click(swapBtn);
    // After swapping, callback is invoked with the next game
    expect(handleSelect).toHaveBeenCalledWith(mockStints[1], "Celeste");
  });
});
