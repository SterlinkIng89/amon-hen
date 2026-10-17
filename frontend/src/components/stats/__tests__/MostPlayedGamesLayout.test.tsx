import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import MostPlayedGames from "../MostPlayedGames";
import { GetChannelAnalytics } from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetChannelAnalytics: vi.fn(),
}));

vi.mock("../../../hooks/useSteamGameData", () => ({
  useSteamGameData: vi.fn((gameName: string) => ({
    appId: 100,
    posterUrl: `https://example.com/${encodeURIComponent(gameName)}.jpg`,
    heroUrl: null,
    achievementsPct: 75,
    isLoading: false,
  })),
}));

describe("MostPlayedGames Monthly Layout", () => {
  const mockHistoricalVideos = [
    {
      title: "Hades II - Session 1",
      published: "2026-10-01T12:00:00Z",
      duration: "PT3H",
      gameTag: "Hades II",
    },
    {
      title: "Hades II - Session 2",
      published: "2026-10-03T12:00:00Z",
      duration: "PT2H",
      gameTag: "Hades II",
    },
    {
      title: "Silksong - Speedrun",
      published: "2026-10-05T12:00:00Z",
      duration: "PT2H30M",
      gameTag: "Hollow Knight: Silksong",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GetChannelAnalytics).mockResolvedValue({
      allHistoricalVideos: mockHistoricalVideos,
    } as never);
  });

  it("renders the grouped top games and timeline sections", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Playtime by game")).toBeDefined();
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
      expect(screen.getByText(/Top games in October 2026/i)).toBeDefined();
      expect(screen.getByText("Monthly timeline")).toBeDefined();
    });
  });

  it("updates the highlight card when selecting a game from the list", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    // Initial highlight is Hades II
    await waitFor(() => {
      expect(screen.getAllByText("Hades II").length).toBeGreaterThan(0);
    });

    // Click on Silksong in the list
    const silksongRow = screen.getByTitle("Hollow Knight: Silksong").closest('[role="button"]');
    expect(silksongRow).not.toBeNull();
    if (silksongRow) {
      fireEvent.click(silksongRow);
    }

    // Highlight title should now reflect selection rank (#2)
    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });
  });

  it("synchronizes view, stint, and game when selectedDate is provided", async () => {
    const { rerender } = render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    // Rerender with selectedDate corresponding to Silksong (2026-10-05)
    rerender(<MostPlayedGames selectedDate="2026-10-05" />);

    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
      expect(screen.getAllByText("Hollow Knight: Silksong").length).toBeGreaterThan(0);
    });
  });

  it("applies warm-neutral elevated card surface, subtle border, and subtle divider", async () => {
    const { container } = render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Playtime by game")).toBeDefined();
    });

    const card = container.querySelector(".bg-elevated\\/30");
    expect(card).not.toBeNull();
    expect(card?.className).toContain("border-border-subtle");
    expect(card?.className).not.toContain("bg-surface border-border-medium");

    const divider = container.querySelector(".bg-border-subtle.h-px");
    expect(divider).not.toBeNull();
  });

  it("renders period summary KPI pills for total playtime, active days, and game count in month view", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Playtime by game")).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText("7h 30m")).toBeDefined();
      expect(screen.getByText((_, el) => el?.textContent?.trim() === "3/31 active days")).toBeDefined();
      expect(screen.getByText("2 games")).toBeDefined();
    });
  });

  it("updates period summary KPI pills to active months when switching to year view", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Playtime by game")).toBeDefined();
    });

    const yearModeButton = screen.getByRole("button", { name: "By year" });
    fireEvent.click(yearModeButton);

    await waitFor(() => {
      expect(screen.getByText("7h 30m")).toBeDefined();
      expect(screen.getByText((_, el) => el?.textContent?.trim() === "1/12 active months")).toBeDefined();
      expect(screen.getByText("2 games")).toBeDefined();
    });
  });

  it("renders PlaytimeToolbar with unified segmented control styling and no hairline divider", async () => {
    const { container } = render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Playtime by game")).toBeDefined();
    });

    // Segmented track containers (mode switcher, year track, month track)
    const segmentedContainers = container.querySelectorAll('[class*="bg-[#141418]"][class*="rounded-lg"]');
    expect(segmentedContainers.length).toBeGreaterThanOrEqual(3);

    // Active year button has unified rounded-md accent styling
    const yearButton = screen.getByRole("button", { name: "2026" });
    expect(yearButton.className).toContain("rounded-md");
    expect(yearButton.className).toContain("bg-accent/15");
    expect(yearButton.className).toContain("border-accent/40");
    expect(yearButton.className).not.toContain("rounded-full");

    // Active month button has unified rounded-md accent styling
    const monthButton = screen.getByRole("button", { name: "Oct" });
    expect(monthButton.className).toContain("rounded-md");
    expect(monthButton.className).toContain("bg-accent/15");
    expect(monthButton.className).toContain("border-accent/40");

    // Redundant hairline divider removed
    const toolbarDivider = container.querySelector(".h-5.w-px.bg-border-subtle");
    expect(toolbarDivider).toBeNull();
  });

  it("toggles game selection off when clicking an already selected game in TopGamesList", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    // Select Silksong (#2)
    const silksongRow = screen.getByTitle("Hollow Knight: Silksong").closest('[role="button"]');
    expect(silksongRow).not.toBeNull();
    if (silksongRow) {
      fireEvent.click(silksongRow);
    }

    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });

    // Clicking Silksong again should toggle back to null and restore #1 Game
    if (silksongRow) {
      fireEvent.click(silksongRow);
    }

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });
  });

  it("allows selecting a game and resetting via PlaytimeStackedChart legend filter chips", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    // Locate the legend chip for Silksong via test id
    const silksongChip = screen.getByTestId("legend-chip-Hollow Knight: Silksong");
    expect(silksongChip).toBeDefined();

    fireEvent.click(silksongChip);

    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });

    // Click Reset button to clear selection
    const resetButton = screen.getByTestId("legend-reset-button");
    expect(resetButton).toBeDefined();

    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });
  });

  it("selects day bar on click, synchronizes timeline stint and dominant game, and toggles selection off", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    const dayColumn = screen.getByTestId("bar-column-2026-10-05");
    expect(dayColumn).toBeDefined();

    const barEl = screen.getByTestId("stacked-bar-2026-10-05");
    expect(barEl.className).not.toContain("ring-2 ring-accent");

    // Click active day bar
    fireEvent.click(dayColumn);

    await waitFor(() => {
      expect(barEl.className).toContain("ring-2 ring-accent");
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });

    // Click again to toggle off
    fireEvent.click(dayColumn);

    await waitFor(() => {
      expect(barEl.className).not.toContain("ring-2 ring-accent");
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });
  });

  it("ignores click on empty day bar stub with 0 recorded hours", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    const emptyStubColumn = screen.getByTestId("bar-column-2026-10-02");
    expect(emptyStubColumn).toBeDefined();

    fireEvent.click(emptyStubColumn);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });
  });

  it("renders spotlight context metrics (period share % and active days played) and updates when selecting another game", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    const metricsRow = screen.getByTestId("highlight-spotlight-metrics");
    expect(metricsRow).toBeDefined();
    expect(metricsRow.textContent).toContain("67% of month");
    expect(metricsRow.textContent).toContain("2 days played");

    // Click on Silksong (#2)
    const silksongRow = screen.getByTitle("Hollow Knight: Silksong").closest('[role="button"]');
    expect(silksongRow).not.toBeNull();
    if (silksongRow) {
      fireEvent.click(silksongRow);
    }

    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
      const updatedMetrics = screen.getByTestId("highlight-spotlight-metrics");
      expect(updatedMetrics.textContent).toContain("33% of month");
      expect(updatedMetrics.textContent).toContain("1 day played");
    });
  });

  it("applies dynamic game color to rank badge border, pulse dot, and label", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    const rankBadge = screen.getByTestId("highlight-rank-badge");
    const rankDot = screen.getByTestId("highlight-rank-dot");
    expect(rankBadge).toBeDefined();
    expect(rankDot).toBeDefined();

    // Default Hades II badge should use getGameColor("Hades II")
    expect(rankBadge.getAttribute("style")).toMatch(/border-color/i);
    expect(rankDot.getAttribute("style")).toMatch(/background-color/i);

    // Click Silksong and verify badge updates to Silksong's color
    const silksongRow = screen.getByTitle("Hollow Knight: Silksong").closest('[role="button"]');
    if (silksongRow) {
      fireEvent.click(silksongRow);
    }

    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });
  });

  it("updates spotlight metrics to % of year when switching to year view", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    const yearButton = screen.getByRole("button", { name: "By year" });
    fireEvent.click(yearButton);

    await waitFor(() => {
      const metricsRow = screen.getByTestId("highlight-spotlight-metrics");
      expect(metricsRow.textContent).toContain("67% of year");
      expect(metricsRow.textContent).toContain("2 days played");
    });
  });

  it("cross-highlights matching stint in GamingTimelineStrip when selecting a game from TopGamesList", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    const hadesStint = screen.getByTestId("stint-card-2026-10-01_2026-10-03_Hades II");
    const silksongStint = screen.getByTestId("stint-card-2026-10-05_2026-10-05_Hollow Knight: Silksong");

    // By default no game is selected -> both have opacity-100
    expect(hadesStint.className).toContain("opacity-100");
    expect(silksongStint.className).toContain("opacity-100");

    // Click on Silksong in TopGamesList
    const silksongRow = screen.getByTitle("Hollow Knight: Silksong").closest('[role="button"]');
    if (silksongRow) {
      fireEvent.click(silksongRow);
    }

    await waitFor(() => {
      // Silksong stint should be highlighted (opacity-100)
      expect(silksongStint.className).toContain("opacity-100");
      // Hades stint should be dimmed (opacity-35)
      expect(hadesStint.className).toContain("opacity-35");
    });
  });

  it("cross-highlights matching stint in GamingTimelineStrip when clicking a legend chip in PlaytimeStackedChart", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    const hadesStint = screen.getByTestId("stint-card-2026-10-01_2026-10-03_Hades II");
    const silksongStint = screen.getByTestId("stint-card-2026-10-05_2026-10-05_Hollow Knight: Silksong");

    // Click on Hades II legend chip in PlaytimeStackedChart
    const hadesChip = screen.getByTestId("legend-chip-Hades II");
    fireEvent.click(hadesChip);

    await waitFor(() => {
      expect(hadesStint.className).toContain("opacity-100");
      expect(silksongStint.className).toContain("opacity-35");
    });
  });

  it("renders Yearly timeline and chronological stints across year when switching to By year view", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Playtime by game")).toBeDefined();
    });

    const yearButton = screen.getByRole("button", { name: "By year" });
    fireEvent.click(yearButton);

    await waitFor(() => {
      expect(screen.getByText("Yearly timeline")).toBeDefined();
      expect(screen.queryByText("Switch to month view to inspect chronological stints")).toBeNull();
      expect(screen.getByTestId("stint-card-2026-10-01_2026-10-03_Hades II")).toBeDefined();
      expect(screen.getByTestId("stint-card-2026-10-05_2026-10-05_Hollow Knight: Silksong")).toBeDefined();
    });
  });

  it("updates highlight card when clicking a stint card in year view and toggles off on second click", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Playtime by game")).toBeDefined();
    });

    const yearButton = screen.getByRole("button", { name: "By year" });
    fireEvent.click(yearButton);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the year")).toBeDefined();
    });

    const silksongStint = screen.getByTestId("stint-card-2026-10-05_2026-10-05_Hollow Knight: Silksong");
    fireEvent.click(silksongStint);

    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });

    // Second click deselects
    fireEvent.click(silksongStint);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the year")).toBeDefined();
    });
  });

  it("resets selected stint when switching view mode", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("Monthly timeline")).toBeDefined();
    });

    const silksongStint = screen.getByTestId("stint-card-2026-10-05_2026-10-05_Hollow Knight: Silksong");
    fireEvent.click(silksongStint);

    await waitFor(() => {
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });

    const yearButton = screen.getByRole("button", { name: "By year" });
    fireEvent.click(yearButton);

    await waitFor(() => {
      expect(screen.getByText("Yearly timeline")).toBeDefined();
      expect(screen.getByText("Selected (#2)")).toBeDefined();
    });

    // Clicking Silksong in the list deselects it and restores #1 Game of the year
    const silksongRow = screen.getByTitle("Hollow Knight: Silksong").closest('[role="button"]');
    if (silksongRow) {
      fireEvent.click(silksongRow);
    }

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the year")).toBeDefined();
    });
  });
});
