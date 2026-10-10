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
    });

    expect(screen.getByText("#1 Game of the month")).toBeDefined();
    expect(screen.getByText(/Top games in October 2026/i)).toBeDefined();
    expect(screen.getByText("Monthly timeline")).toBeDefined();
  });

  it("updates the highlight card when selecting a game from the list", async () => {
    render(<MostPlayedGames />);

    await waitFor(() => {
      expect(screen.getByText("#1 Game of the month")).toBeDefined();
    });

    // Initial highlight is Hades II
    expect(screen.getAllByText("Hades II").length).toBeGreaterThan(0);

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
});
