import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SteamLibraryPulseBar } from "../SteamLibraryPulseBar";
import { SteamLibraryPulse } from "../../../utils/steamInsightsUtils";

describe("SteamLibraryPulseBar", () => {
  const samplePulse: SteamLibraryPulse = {
    totalGames: 120,
    totalHours: 1450,
    unplayedGames: 30,
    triedGames: 20,
    playedGames: 50,
    obsessionGames: 20,
    top10SharePct: 62.4,
    totalAchievements: 1000,
    unlockedAchievements: 450,
    perfectGamesCount: 8,
    almostThereCount: 14,
    recordedGamesCount: 15,
  };

  it("renders KPI summary pills and pareto badge accurately", () => {
    render(
      <SteamLibraryPulseBar
        pulse={samplePulse}
        activeBucket="all"
        activeAchievementFilter="all"
        unrecordedGemsCount={6}
        onSelectBucket={vi.fn()}
        onSelectAchievementFilter={vi.fn()}
      />
    );

    expect(screen.getByText("Library pulse")).toBeDefined();

    const paretoBadge = screen.getByTestId("pulse-pareto-badge");
    expect(paretoBadge.textContent).toContain("Top 10 games = 62% of playtime");

    expect(screen.getByText("120")).toBeDefined();
    expect(screen.getByText("games")).toBeDefined();
    expect(screen.getByText("1450h")).toBeDefined();
    expect(screen.getByText("played")).toBeDefined();
    expect(screen.getByText("45%")).toBeDefined();
    expect(screen.getByText(/achievements \(450\/1000\)/)).toBeDefined();
    expect(screen.getByText("15")).toBeDefined();
    expect(screen.getByText("on YouTube")).toBeDefined();
  });

  it("handles zero values without NaN or division by zero", () => {
    const zeroPulse: SteamLibraryPulse = {
      totalGames: 0,
      totalHours: 0,
      unplayedGames: 0,
      triedGames: 0,
      playedGames: 0,
      obsessionGames: 0,
      top10SharePct: 0,
      totalAchievements: 0,
      unlockedAchievements: 0,
      perfectGamesCount: 0,
      almostThereCount: 0,
      recordedGamesCount: 0,
    };

    render(
      <SteamLibraryPulseBar
        pulse={zeroPulse}
        activeBucket="all"
        activeAchievementFilter="all"
        unrecordedGemsCount={0}
        onSelectBucket={vi.fn()}
        onSelectAchievementFilter={vi.fn()}
      />
    );

    const paretoBadge = screen.getByTestId("pulse-pareto-badge");
    expect(paretoBadge.textContent).toContain("0% of playtime");
    expect(screen.getByText("0%")).toBeDefined();
    expect(screen.getByText(/achievements \(0\/0\)/)).toBeDefined();
  });

  it("toggles playtime bucket chips on click", () => {
    const handleSelectBucket = vi.fn();

    const { rerender } = render(
      <SteamLibraryPulseBar
        pulse={samplePulse}
        activeBucket="all"
        activeAchievementFilter="all"
        unrecordedGemsCount={6}
        onSelectBucket={handleSelectBucket}
        onSelectAchievementFilter={vi.fn()}
      />
    );

    const unplayedChip = screen.getByTestId("bucket-chip-unplayed");
    expect(unplayedChip.textContent).toContain("Unplayed 0h (30)");
    fireEvent.click(unplayedChip);
    expect(handleSelectBucket).toHaveBeenCalledWith("unplayed");

    rerender(
      <SteamLibraryPulseBar
        pulse={samplePulse}
        activeBucket="unplayed"
        activeAchievementFilter="all"
        unrecordedGemsCount={6}
        onSelectBucket={handleSelectBucket}
        onSelectAchievementFilter={vi.fn()}
      />
    );

    fireEvent.click(unplayedChip);
    expect(handleSelectBucket).toHaveBeenCalledWith("all");

    fireEvent.click(screen.getByTestId("bucket-chip-tried"));
    expect(handleSelectBucket).toHaveBeenCalledWith("tried");

    fireEvent.click(screen.getByTestId("bucket-chip-played"));
    expect(handleSelectBucket).toHaveBeenCalledWith("played");

    fireEvent.click(screen.getByTestId("bucket-chip-obsession"));
    expect(handleSelectBucket).toHaveBeenCalledWith("obsession");
  });

  it("toggles playtime bucket when clicking segmented bar items", () => {
    const handleSelectBucket = vi.fn();

    render(
      <SteamLibraryPulseBar
        pulse={samplePulse}
        activeBucket="all"
        activeAchievementFilter="all"
        unrecordedGemsCount={6}
        onSelectBucket={handleSelectBucket}
        onSelectAchievementFilter={vi.fn()}
      />
    );

    const barSegmentUnplayed = screen.getByTestId("bar-segment-unplayed");
    fireEvent.click(barSegmentUnplayed);
    expect(handleSelectBucket).toHaveBeenCalledWith("unplayed");

    const barSegmentObsession = screen.getByTestId("bar-segment-obsession");
    fireEvent.click(barSegmentObsession);
    expect(handleSelectBucket).toHaveBeenCalledWith("obsession");
  });

  it("toggles achievement and curiosity filter chips", () => {
    const handleSelectFilter = vi.fn();

    const { rerender } = render(
      <SteamLibraryPulseBar
        pulse={samplePulse}
        activeBucket="all"
        activeAchievementFilter="all"
        unrecordedGemsCount={6}
        onSelectBucket={vi.fn()}
        onSelectAchievementFilter={handleSelectFilter}
      />
    );

    const perfectChip = screen.getByTestId("filter-chip-perfect");
    expect(perfectChip.textContent).toContain("100% Perfect (8)");
    fireEvent.click(perfectChip);
    expect(handleSelectFilter).toHaveBeenCalledWith("perfect");

    rerender(
      <SteamLibraryPulseBar
        pulse={samplePulse}
        activeBucket="all"
        activeAchievementFilter="perfect"
        unrecordedGemsCount={6}
        onSelectBucket={vi.fn()}
        onSelectAchievementFilter={handleSelectFilter}
      />
    );

    fireEvent.click(perfectChip);
    expect(handleSelectFilter).toHaveBeenCalledWith("all");

    const almostThereChip = screen.getByTestId("filter-chip-almost_there");
    expect(almostThereChip.textContent).toContain("Almost there 75–99% (14)");
    fireEvent.click(almostThereChip);
    expect(handleSelectFilter).toHaveBeenCalledWith("almost_there");

    const gemsChip = screen.getByTestId("filter-chip-unrecorded_gems");
    expect(gemsChip.textContent).toContain("Unrecorded gems 20h+ (6)");
    fireEvent.click(gemsChip);
    expect(handleSelectFilter).toHaveBeenCalledWith("unrecorded_gems");
  });
});
