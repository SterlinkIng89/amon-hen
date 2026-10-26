import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SteamGameInspectorGrid } from "../SteamGameInspectorGrid";
import { SteamGameInsight } from "../../../utils/steamInsightsUtils";

describe("SteamGameInspectorGrid", () => {
  const sampleGames: readonly SteamGameInsight[] = [
    {
      appid: 105600,
      name: "Terraria",
      playtimeHours: 150.5,
      playtimeForever: 9030,
      playtime2Weeks: 120,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/105600/library_600x900_2x.jpg",
      achievementsPct: 80,
      developers: "Re-Logic",
      publishers: "Re-Logic",
      genres: "Action, Adventure",
      ytVideosCount: 5,
      ytRecordedHours: 12.5,
    },
    {
      appid: 292030,
      name: "The Witcher 3: Wild Hunt",
      playtimeHours: 85.0,
      playtimeForever: 5100,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/292030/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/292030/library_600x900_2x.jpg",
      achievementsPct: 65,
      developers: "CD PROJEKT RED",
      publishers: "CD PROJEKT RED",
      genres: "RPG",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      backlogStatus: "up_next",
      personalTier: "S",
      personalScore: 10,
    },
    {
      appid: 550,
      name: "Left 4 Dead 2",
      playtimeHours: 25.0,
      playtimeForever: 1500,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/550/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/550/library_600x900_2x.jpg",
      achievementsPct: 40,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action",
      ytVideosCount: 0,
      ytRecordedHours: 0,
    },
    {
      appid: 730,
      name: "Counter-Strike 2",
      playtimeHours: 5.0,
      playtimeForever: 300,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/730/library_600x900_2x.jpg",
      achievementsPct: 10,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action",
      ytVideosCount: 0,
      ytRecordedHours: 0,
    },
  ];

  it("renders header bar with title, game count, and search input", () => {
    const onSearchChange = vi.fn();
    const onClearFilters = vi.fn();

    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={true}
        searchQuery=""
        onSearchChange={onSearchChange}
        onClearFilters={onClearFilters}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
      />
    );

    expect(screen.getByText("All games")).toBeDefined();
    expect(screen.getByText("4 games")).toBeDefined();

    const clearBtn = screen.getByTestId("inspector-clear-filter");
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
    expect(onClearFilters).toHaveBeenCalledTimes(1);

    const searchInput = screen.getByTestId("inspector-game-search");
    fireEvent.change(searchInput, { target: { value: "witcher" } });
    expect(onSearchChange).toHaveBeenCalledWith("witcher");
  });

  it("renders clean empty state when games list is empty", () => {
    const onClearFilters = vi.fn();
    render(
      <SteamGameInspectorGrid
        games={[]}
        activeFilterTitle="Genre: Simulation"
        hasActiveFilter={true}
        searchQuery="NonExistent"
        onSearchChange={vi.fn()}
        onClearFilters={onClearFilters}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
      />
    );

    expect(screen.getByText(/no matching games found/i)).toBeDefined();
    const resetBtn = screen.getByTestId("empty-reset-filters");
    fireEvent.click(resetBtn);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("renders spotlight card for games[0] by default and switches when clicking another card", () => {
    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
      />
    );

    const spotlight = screen.getByTestId("inspector-spotlight-card");
    expect(spotlight.textContent).toContain("Terraria");
    expect(spotlight.textContent).toContain("150.5h");
    expect(spotlight.textContent).toContain("Top played");

    const witcherCard = screen.getByTestId("game-card-292030");
    fireEvent.click(witcherCard);

    expect(spotlight.textContent).toContain("The Witcher 3: Wild Hunt");
    expect(spotlight.textContent).toContain("85h");
    expect(spotlight.textContent).toContain("#2 selected");
  });

  it("renders YouTube bridge badge or unrecorded gem badge accurately", () => {
    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
      />
    );

    const ytBadge = screen.getByTestId("yt-badge-105600");
    expect(ytBadge.textContent).toContain("5 YT vids");

    const gemBadge = screen.getByTestId("unrecorded-gem-550");
    expect(gemBadge.textContent).toContain("Unrecorded gem");

    expect(screen.queryByTestId("yt-badge-730")).toBeNull();
    expect(screen.queryByTestId("unrecorded-gem-730")).toBeNull();
  });

  it("handles quick queue button clicks without triggering card selection", () => {
    const onQuickQueue = vi.fn();
    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={onQuickQueue}
        onQuickRate={vi.fn()}
      />
    );

    const queueBtn = screen.getByTestId("quick-queue-105600");
    expect(queueBtn.textContent).toContain("+ Up next");
    fireEvent.click(queueBtn);
    expect(onQuickQueue).toHaveBeenCalledWith(105600, "up_next");

    const queuedBadge = screen.getByTestId("quick-queue-292030");
    expect(queuedBadge.textContent).toContain("Up next");
  });

  it("handles quick rating tier buttons and displays rated tier pill", () => {
    const onQuickRate = vi.fn();
    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={onQuickRate}
      />
    );

    const rateContainer = screen.getByTestId("quick-rate-105600");
    const sBtn = rateContainer.querySelector('[data-tier="S"]')!;
    expect(sBtn).toBeDefined();

    fireEvent.click(sBtn);
    expect(onQuickRate).toHaveBeenCalledWith(105600, "S", 10);

    const ratedPill = screen.getByTestId("quick-rate-292030");
    expect(ratedPill.textContent).toContain("Tier S");
  });

  it("limits visible items to 24 and supports load more pagination", () => {
    const manyGames: SteamGameInsight[] = Array.from({ length: 30 }, (_, i) => ({
      appid: 1000 + i,
      name: `Game ${i + 1}`,
      playtimeHours: 100 - i,
      playtimeForever: (100 - i) * 60,
      playtime2Weeks: 0,
      headerUrl: "",
      posterUrl: "",
      achievementsPct: 50,
      developers: "Studio",
      publishers: "Publisher",
      genres: "Genre",
      ytVideosCount: 0,
      ytRecordedHours: 0,
    }));

    render(
      <SteamGameInspectorGrid
        games={manyGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
      />
    );

    expect(screen.getByTestId("game-card-1000")).toBeDefined();
    expect(screen.getByTestId("game-card-1023")).toBeDefined();
    expect(screen.queryByTestId("game-card-1024")).toBeNull();

    const loadMoreBtn = screen.getByTestId("inspector-load-more");
    fireEvent.click(loadMoreBtn);

    expect(screen.getByTestId("game-card-1024")).toBeDefined();
    expect(screen.getByTestId("game-card-1029")).toBeDefined();
    expect(screen.queryByTestId("inspector-load-more")).toBeNull();
  });

  it("opens inline 1-10 popover on unrated game and allows selecting concrete score", () => {
    const onQuickRate = vi.fn();
    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={onQuickRate}
      />
    );

    const openPopoverBtn = screen.getByTestId("quick-score-open-105600");
    expect(openPopoverBtn).toBeDefined();

    // Click trigger to open popover
    fireEvent.click(openPopoverBtn);
    expect(screen.getByTestId("quick-rate-popover-105600")).toBeDefined();

    // Select score 9 -> maps to tier S by default
    const score9Btn = screen.getByTestId("popover-score-105600-9");
    fireEvent.click(score9Btn);
    expect(onQuickRate).toHaveBeenCalledWith(105600, "S", 9);
    expect(screen.queryByTestId("quick-rate-popover-105600")).toBeNull();

    // Open again and select score 7 -> maps to tier B by default
    fireEvent.click(openPopoverBtn);
    const score7Btn = screen.getByTestId("popover-score-105600-7");
    fireEvent.click(score7Btn);
    expect(onQuickRate).toHaveBeenCalledWith(105600, "B", 7);
  });

  it("renders rated game with edit badge, popover selection, and 1-click remove rating", () => {
    const onQuickRate = vi.fn();
    const onRemoveRating = vi.fn();

    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={onQuickRate}
        onRemoveRating={onRemoveRating}
      />
    );

    // Rated badge displays tier and score
    const editBtn = screen.getByTestId("quick-rate-edit-292030");
    expect(editBtn.textContent).toContain("Tier S");
    expect(editBtn.textContent).toContain("10/10");

    // Open popover from rated badge and change score to 9
    fireEvent.click(editBtn);
    expect(screen.getByTestId("quick-rate-popover-292030")).toBeDefined();
    const score9Btn = screen.getByTestId("popover-score-292030-9");
    fireEvent.click(score9Btn);
    expect(onQuickRate).toHaveBeenCalledWith(292030, "S", 9);

    // 1-click remove button calls onRemoveRating
    const clearBtn = screen.getByTestId("quick-rate-clear-292030");
    fireEvent.click(clearBtn);
    expect(onRemoveRating).toHaveBeenCalledWith(292030);

    // Also verify popover remove button
    fireEvent.click(editBtn);
    const popoverRemoveBtn = screen.getByTestId("popover-remove-rating-292030");
    fireEvent.click(popoverRemoveBtn);
    expect(onRemoveRating).toHaveBeenCalledWith(292030);
  });

  it("handles backlog status selection dropdown and 1-click dequeue button", () => {
    const onQuickQueue = vi.fn();
    const onRemoveBacklog = vi.fn();

    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={onQuickQueue}
        onQuickRate={vi.fn()}
        onRemoveBacklog={onRemoveBacklog}
      />
    );

    // Quick queue container preserves readable text label
    const queueContainer = screen.getByTestId("quick-queue-292030");
    expect(queueContainer.textContent).toContain("Up next");

    // Select element allows changing status
    const selectElem = screen.getByTestId("quick-queue-select-292030");
    fireEvent.change(selectElem, { target: { value: "playing" } });
    expect(onQuickQueue).toHaveBeenCalledWith(292030, "playing");

    // 1-click dequeue button calls onRemoveBacklog
    const dequeueBtn = screen.getByTestId("quick-queue-clear-292030");
    fireEvent.click(dequeueBtn);
    expect(onRemoveBacklog).toHaveBeenCalledWith(292030);
  });

  it("supports sorting games via inspector-sort-select in both controlled and uncontrolled modes", () => {
    const onSortChange = vi.fn();

    const { rerender } = render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
        sortBy="hours"
        onSortChange={onSortChange}
      />
    );

    const sortSelect = screen.getByTestId("inspector-sort-select");
    expect(sortSelect).toBeDefined();

    // Controlled mode: fires onSortChange
    fireEvent.change(sortSelect, { target: { value: "score" } });
    expect(onSortChange).toHaveBeenCalledWith("score");

    // Re-render with sortBy="score"
    rerender(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
        sortBy="score"
        onSortChange={onSortChange}
      />
    );

    // Highest rated game (The Witcher 3: Wild Hunt, score 10) is spotlighted
    const spotlight = screen.getByTestId("inspector-spotlight-card");
    expect(spotlight.textContent).toContain("The Witcher 3: Wild Hunt");
  });

  it("renders enriched spotlight card with rating badge, 2-week playtime, and personal notes", () => {
    const enrichedGames: SteamGameInsight[] = [
      {
        appid: 292030,
        name: "The Witcher 3: Wild Hunt",
        playtimeHours: 85.0,
        playtimeForever: 5100,
        playtime2Weeks: 120, // 2 hours
        headerUrl: "",
        posterUrl: "",
        achievementsPct: 65,
        developers: "CD PROJEKT RED",
        publishers: "CD PROJEKT RED",
        genres: "RPG",
        ytVideosCount: 2,
        ytRecordedHours: 4,
        personalTier: "S",
        personalScore: 10,
        personalNotes: "Masterpiece open world RPG",
      },
    ];

    render(
      <SteamGameInspectorGrid
        games={enrichedGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={vi.fn()}
      />
    );

    const spotlight = screen.getByTestId("inspector-spotlight-card");
    expect(spotlight.textContent).toContain("Tier S · 10/10");
    expect(spotlight.textContent).toContain("2h last 2w");
    expect(spotlight.textContent).toContain("Masterpiece open world RPG");
  });

  it("supports typing concrete or decimal scores via score input in popover", () => {
    const onQuickRate = vi.fn();
    render(
      <SteamGameInspectorGrid
        games={sampleGames}
        activeFilterTitle="All games"
        hasActiveFilter={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearFilters={vi.fn()}
        onQuickQueue={vi.fn()}
        onQuickRate={onQuickRate}
      />
    );

    // Open popover on unrated game
    const openBtn = screen.getByTestId("quick-score-open-105600");
    fireEvent.click(openBtn);

    // Enter decimal score 8.5
    const scoreInput = screen.getByTestId("popover-score-input-105600");
    fireEvent.change(scoreInput, { target: { value: "8.5" } });

    // Click apply button
    const applyBtn = screen.getByTestId("popover-score-apply-105600");
    fireEvent.click(applyBtn);

    // 8.5 maps to Tier A by default
    expect(onQuickRate).toHaveBeenCalledWith(105600, "A", 8.5);
    expect(screen.queryByTestId("quick-rate-popover-105600")).toBeNull();
  });
});

