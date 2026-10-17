import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  SteamStudioGenrePanel,
  SteamStudioStatItem,
  SteamTagStatItem,
} from "../SteamStudioGenrePanel";

describe("SteamStudioGenrePanel", () => {
  const sampleDevelopers: readonly SteamStudioStatItem[] = [
    { name: "Valve Corporation", totalHours: 1250, gamesCount: 15, avgHours: 83.3 },
    { name: "CD PROJEKT RED", totalHours: 450, gamesCount: 4, avgHours: 112.5 },
    { name: "FromSoftware", totalHours: 320, gamesCount: 5, avgHours: 64.0 },
    { name: "Capcom", totalHours: 180, gamesCount: 8, avgHours: 22.5 },
  ];

  const samplePublishers: readonly SteamStudioStatItem[] = [
    { name: "Valve", totalHours: 1250, gamesCount: 15, avgHours: 83.3 },
    { name: "Bandai Namco", totalHours: 500, gamesCount: 12, avgHours: 41.7 },
  ];

  const sampleTags: readonly SteamTagStatItem[] = [
    { tag: "Action RPG", category: "genre", totalHours: 890, gamesCount: 18, avgHours: 49.4 },
    { tag: "Multiplayer", category: "feature", totalHours: 1500, gamesCount: 25, avgHours: 60.0 },
    { tag: "Co-op", category: "feature", totalHours: 720, gamesCount: 14, avgHours: 51.4 },
    { tag: "Souls-like", category: "genre", totalHours: 400, gamesCount: 6, avgHours: 66.7 },
    { tag: "Strategy", totalHours: 220, gamesCount: 9, avgHours: 24.4 },
  ];

  it("renders segmented category tabs and displays developer items by default", () => {
    render(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={null}
        onSelectGroup={vi.fn()}
      />
    );

    expect(screen.getByTestId("tab-developers")).toBeDefined();
    expect(screen.getByTestId("tab-publishers")).toBeDefined();
    expect(screen.getByTestId("tab-genres")).toBeDefined();
    expect(screen.getByTestId("tab-features")).toBeDefined();

    expect(screen.getByText("Valve Corporation")).toBeDefined();
    expect(screen.getByText("CD PROJEKT RED")).toBeDefined();
    expect(screen.queryByText("Bandai Namco")).toBeNull();
  });

  it("switches category tabs and correctly isolates genres vs store features", () => {
    render(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={null}
        onSelectGroup={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("tab-publishers"));
    expect(screen.getByText("Bandai Namco")).toBeDefined();
    expect(screen.queryByText("CD PROJEKT RED")).toBeNull();

    fireEvent.click(screen.getByTestId("tab-genres"));
    expect(screen.getByText("Action RPG")).toBeDefined();
    expect(screen.getByText("Souls-like")).toBeDefined();
    expect(screen.getByText("Strategy")).toBeDefined();
    expect(screen.queryByText("Multiplayer")).toBeNull();
    expect(screen.queryByText("Co-op")).toBeNull();

    fireEvent.click(screen.getByTestId("tab-features"));
    expect(screen.getByText("Multiplayer")).toBeDefined();
    expect(screen.getByText("Co-op")).toBeDefined();
    expect(screen.queryByText("Action RPG")).toBeNull();
    expect(screen.queryByText("Strategy")).toBeNull();
  });

  it("filters items by search input and displays empty state on zero matches", () => {
    render(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={null}
        onSelectGroup={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId("studio-genre-search");
    fireEvent.change(searchInput, { target: { value: "valve" } });

    expect(screen.getByText("Valve Corporation")).toBeDefined();
    expect(screen.queryByText("FromSoftware")).toBeNull();

    fireEvent.change(searchInput, { target: { value: "NonExistentStudio" } });
    expect(screen.getByText(/no matching items found/i)).toBeDefined();
  });

  it("triggers onSortChange when clicking sort buttons", () => {
    const onSortChange = vi.fn();
    render(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={onSortChange}
        selectedGroup={null}
        onSelectGroup={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("sort-games"));
    expect(onSortChange).toHaveBeenCalledWith("games");

    fireEvent.click(screen.getByTestId("sort-avg"));
    expect(onSortChange).toHaveBeenCalledWith("avg");

    fireEvent.click(screen.getByTestId("sort-hours"));
    expect(onSortChange).toHaveBeenCalledWith("hours");
  });

  it("sorts items dynamically by hours, games, and avg playtime", () => {
    const { rerender } = render(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={null}
        onSelectGroup={vi.fn()}
      />
    );

    const rowsHours = screen.getAllByRole("button").filter((el) => el.getAttribute("aria-pressed") !== null);
    expect(rowsHours[0].textContent).toContain("Valve Corporation");

    rerender(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="avg"
        onSortChange={vi.fn()}
        selectedGroup={null}
        onSelectGroup={vi.fn()}
      />
    );

    const rowsAvg = screen.getAllByRole("button").filter((el) => el.getAttribute("aria-pressed") !== null);
    expect(rowsAvg[0].textContent).toContain("CD PROJEKT RED");
  });

  it("handles row selection and toggles deselection when clicking active row", () => {
    const onSelectGroup = vi.fn();
    const { rerender } = render(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={null}
        onSelectGroup={onSelectGroup}
      />
    );

    const valveRow = screen.getByText("Valve Corporation").closest('[role="button"]')!;
    expect(valveRow.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(valveRow);
    expect(onSelectGroup).toHaveBeenCalledWith({
      type: "developers",
      name: "Valve Corporation",
    });

    rerender(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={{ type: "developers", name: "Valve Corporation" }}
        onSelectGroup={onSelectGroup}
      />
    );

    const activeValveRow = screen.getByText("Valve Corporation").closest('[role="button"]')!;
    expect(activeValveRow.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(activeValveRow);
    expect(onSelectGroup).toHaveBeenCalledWith(null);
  });

  it("synchronizes active tab with selectedGroup on mount or change", () => {
    render(
      <SteamStudioGenrePanel
        developers={sampleDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={{ type: "genres", name: "Action RPG" }}
        onSelectGroup={vi.fn()}
      />
    );

    expect(screen.getByText("Action RPG")).toBeDefined();
    const row = screen.getByText("Action RPG").closest('[role="button"]')!;
    expect(row.getAttribute("aria-pressed")).toBe("true");
  });

  it("limits initial view to 25 items and loads more on button click", () => {
    const manyDevelopers: SteamStudioStatItem[] = Array.from({ length: 35 }, (_, i) => ({
      name: `Studio #${i + 1}`,
      totalHours: 100 - i,
      gamesCount: 2,
      avgHours: 50,
    }));

    render(
      <SteamStudioGenrePanel
        developers={manyDevelopers}
        publishers={samplePublishers}
        tags={sampleTags}
        sortBy="hours"
        onSortChange={vi.fn()}
        selectedGroup={null}
        onSelectGroup={vi.fn()}
      />
    );

    expect(screen.getByText("Studio #1")).toBeDefined();
    expect(screen.getByText("Studio #25")).toBeDefined();
    expect(screen.queryByText("Studio #26")).toBeNull();

    const loadMoreBtn = screen.getByTestId("load-more-btn");
    expect(loadMoreBtn).toBeDefined();

    fireEvent.click(loadMoreBtn);
    expect(screen.getByText("Studio #26")).toBeDefined();
    expect(screen.getByText("Studio #35")).toBeDefined();
    expect(screen.queryByTestId("load-more-btn")).toBeNull();
  });
});
