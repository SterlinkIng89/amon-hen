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
});
