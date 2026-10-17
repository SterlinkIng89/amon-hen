import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GamingTimelineStrip } from "../GamingTimelineStrip";
import { GameStint } from "../../../utils/gameTimeline";
import { getGameColor } from "../../../utils/tagColors";

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

  it("allows bringing rear game to front in stacked card stint without invoking onSelectStint", () => {
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
    // Clicking rear layer brings it to front locally without triggering onSelectStint
    expect(handleSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/1h 00m/)).toBeDefined();

    // Clicking the stint card container itself does invoke onSelectStint with the active game
    const stint2Card = screen.getByTestId("stint-card-stint-2");
    fireEvent.click(stint2Card);
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

  it("applies semantic tokens for connector lines, dots, date pills, and break gap indicators", () => {
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

    const { container } = render(
      <GamingTimelineStrip
        stints={stintsWithGap}
        selectedStintId="stint-1"
      />
    );

    // Verify date pill uses bg-card border-border-subtle
    const datePills = container.querySelectorAll(".bg-card");
    expect(datePills.length).toBeGreaterThan(0);

    // Verify break pill uses bg-surface
    const breakPill = container.querySelector(".bg-surface");
    expect(breakPill).not.toBeNull();

    // Verify no hardcoded blue-tinted hex codes remain
    const html = container.innerHTML;
    expect(html).not.toContain("#444458");
    expect(html).not.toContain("#2d2d3b");
    expect(html).not.toContain("#525266");
    expect(html).not.toContain("#1e1e26");
    expect(html).not.toContain("#32323e");
    expect(html).not.toContain("#48485a");
    expect(html).not.toContain("#12141a");
    expect(html).not.toContain("#48485c");
  });

  it("cross-highlights matching stint and dims non-matching stint when selectedGameName is provided", () => {
    const { container } = render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedGameName="Hades II"
      />
    );

    const stint1Card = screen.getByTestId("stint-card-stint-1");
    const stint2Card = screen.getByTestId("stint-card-stint-2");

    // stint-1 contains Hades II -> opacity-100, styled with Hades II hash color
    expect(stint1Card.className).toContain("opacity-100");
    expect(stint1Card.className).not.toContain("opacity-35");

    const hadesColor = getGameColor("Hades II");
    const stint1FrontCard = stint1Card.querySelector<HTMLElement>('[data-testid="timeline-front-card"]');
    expect(stint1FrontCard).not.toBeNull();
    expect(stint1FrontCard?.style.borderColor).toBeTruthy();

    const datePill = stint1Card.querySelector<HTMLElement>('[data-testid="stint-date-pill"]');
    expect(datePill?.style.borderColor).toBeTruthy();
    expect(datePill?.style.borderColor).toBe(stint1FrontCard?.style.borderColor);

    const datePillDot = stint1Card.querySelector<HTMLElement>('[data-testid="stint-date-pill-dot"]');
    expect(datePillDot?.style.backgroundColor).toBeTruthy();
    expect(datePillDot?.style.backgroundColor).toBe(stint1FrontCard?.style.borderColor);

    // stint-2 does NOT contain Hades II -> dimmed with opacity-35
    expect(stint2Card.className).toContain("opacity-35");
  });

  it("auto-syncs rear game to front in multi-game stint when matching selectedGameName", () => {
    render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedGameName="Celeste"
      />
    );

    const stint2Card = screen.getByTestId("stint-card-stint-2");
    expect(stint2Card.className).toContain("opacity-100");

    // Stint 2 front card should be styled with Celeste's hash color
    const stint2FrontCard = stint2Card.querySelector<HTMLElement>('[data-testid="timeline-front-card"]');
    expect(stint2FrontCard).not.toBeNull();
    expect(stint2FrontCard?.style.borderColor).toBeTruthy();

    const datePillDot = stint2Card.querySelector<HTMLElement>('[data-testid="stint-date-pill-dot"]');
    expect(datePillDot?.style.backgroundColor).toBe(stint2FrontCard?.style.borderColor);

    // Stint 2 subtitle should show Celeste's playtime (1h 00m) instead of Silksong (1h 30m)
    expect(screen.getByText(/1h 00m/)).toBeDefined();

    // Bring Celeste to front button should no longer exist since Celeste is now at the front
    const bringCelesteBtn = screen.queryByRole("button", { name: "Bring Celeste to front" });
    expect(bringCelesteBtn).toBeNull();

    // Bring Silksong to front button should now exist
    const bringSilksongBtn = screen.queryByRole("button", { name: "Bring Silksong to front" });
    expect(bringSilksongBtn).not.toBeNull();
  });

  it("does not apply colored border when clicking or switching cards without an active game filter", () => {
    render(
      <GamingTimelineStrip
        stints={mockStints}
        selectedStintId="stint-2"
      />
    );

    const stint2Card = screen.getByTestId("stint-card-stint-2");
    const frontCard = stint2Card.querySelector<HTMLElement>('[data-testid="timeline-front-card"]');
    // Front card should NOT have colored border style
    expect(frontCard?.style.borderColor).toBe("");

    const datePill = stint2Card.querySelector<HTMLElement>('[data-testid="stint-date-pill"]');
    expect(datePill?.style.borderColor).toBe("");

    const datePillDot = stint2Card.querySelector('[data-testid="stint-date-pill-dot"]');
    expect(datePillDot).toBeNull();
  });
});

