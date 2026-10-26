import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import SteamStats from "../SteamStats";
import * as AppBackend from "../../../wailsjs/go/backend/App";

// Mock Wails backend App calls
vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetSteamAPIKey: vi.fn().mockResolvedValue("mock-steam-api-key"),
  GetSteamID: vi.fn().mockResolvedValue("76561198000000000"),
  IsSteamSyncing: vi.fn().mockResolvedValue(false),
  GetSteamLibraryPulse: vi.fn().mockResolvedValue({
    totalGames: 120,
    totalHours: 1450,
    unplayedGames: 30,
    triedGames: 20,
    playedGames: 50,
    obsessionGames: 20,
    top10SharePct: 45.2,
    totalAchievements: 1000,
    unlockedAchievements: 650,
    perfectGamesCount: 4,
    almostThereCount: 8,
    recordedGamesCount: 15,
  }),
  GetEnrichedSteamGames: vi.fn().mockResolvedValue([
    {
      appid: 10,
      name: "Counter-Strike",
      playtimeHours: 250,
      playtimeForever: 15000,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.steam.com/10.jpg",
      posterUrl: "https://cdn.steam.com/10_poster.jpg",
      achievementsPct: 100,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action, Multiplayer",
      isUtility: false,
      ytVideosCount: 2,
      ytRecordedHours: 5.5,
      backlogStatus: "playing",
      backlogRank: 1,
      personalTier: "S",
      personalScore: 10,
    },
    {
      appid: 20,
      name: "Team Fortress Classic",
      playtimeHours: 40,
      playtimeForever: 2400,
      playtime2Weeks: 120,
      headerUrl: "https://cdn.steam.com/20.jpg",
      posterUrl: "https://cdn.steam.com/20_poster.jpg",
      achievementsPct: 80,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action, Shooter",
      isUtility: false,
      ytVideosCount: 0,
      ytRecordedHours: 0,
    },
    {
      appid: 431960,
      name: "Wallpaper Engine",
      playtimeHours: 500,
      playtimeForever: 30000,
      playtime2Weeks: 600,
      headerUrl: "https://cdn.steam.com/431960.jpg",
      posterUrl: "",
      achievementsPct: 10,
      developers: "Wallpaper Engine Team",
      publishers: "Wallpaper Engine Team",
      genres: "Utilities, Animation",
      isUtility: true,
      ytVideosCount: 0,
      ytRecordedHours: 0,
    },
  ]),
  GetSteamDeveloperStats: vi.fn().mockResolvedValue([
    { name: "Valve", totalHours: 290, gamesCount: 2 },
    { name: "Wallpaper Engine Team", totalHours: 500, gamesCount: 1 },
  ]),
  GetSteamPublisherStats: vi.fn().mockResolvedValue([
    { name: "Valve", totalHours: 290, gamesCount: 2 },
    { name: "Wallpaper Engine Team", totalHours: 500, gamesCount: 1 },
  ]),
  GetSteamTagStats: vi.fn().mockResolvedValue([
    { tag: "Action", category: "genre", totalHours: 290, gamesCount: 2, avgHours: 145 },
    { tag: "Shooter", category: "genre", totalHours: 40, gamesCount: 1, avgHours: 40 },
  ]),
  GetSteamOverallStats: vi.fn().mockResolvedValue({
    totalGames: 120,
    totalHours: 1450,
    totalAchievements: 1000,
    unlockedAchievements: 650,
  }),
  UpsertSteamBacklogItem: vi.fn().mockResolvedValue(undefined),
  ReorderSteamBacklog: vi.fn().mockResolvedValue(undefined),
  RemoveSteamBacklogItem: vi.fn().mockResolvedValue(undefined),
  UpsertSteamGameRating: vi.fn().mockResolvedValue(undefined),
  RemoveSteamGameRating: vi.fn().mockResolvedValue(undefined),
  SyncSteamData: vi.fn().mockResolvedValue(undefined),
}));

// Mock runtime events
const eventListeners: Record<string, Function[]> = {};

vi.mock("../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn((event: string, callback: Function) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
    return () => {
      eventListeners[event] = eventListeners[event].filter((cb) => cb !== callback);
    };
  }),
  EventsOff: vi.fn(),
}));

describe("SteamStats Page Redesign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    for (const key in eventListeners) {
      delete eventListeners[key];
    }
  });

  it("renders sticky sub-header with title, segmented tabs, and count badges", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /steam/i })).toBeInTheDocument();
    });

    const insightsTab = screen.getByTestId("steam-tab-insights");
    const backlogTab = screen.getByTestId("steam-tab-backlog");
    const rankingsTab = screen.getByTestId("steam-tab-rankings");

    expect(insightsTab).toBeInTheDocument();
    expect(backlogTab).toBeInTheDocument();
    expect(rankingsTab).toBeInTheDocument();

    // Backlog has 1 queued item in mock games
    expect(backlogTab).toHaveTextContent("1");
    // Rankings has 1 rated item in mock games
    expect(rankingsTab).toHaveTextContent("1");
  });

  it("renders Insights layout by default with pulse bar, studio panel, and inspector grid", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      // Pulse bar pareto badge
      expect(screen.getByTestId("pulse-pareto-badge")).toBeInTheDocument();
      // Studio / Genre panel tab
      expect(screen.getByTestId("tab-developers")).toBeInTheDocument();
      // Inspector grid search input
      expect(screen.getByTestId("inspector-game-search")).toBeInTheDocument();
    });
  });

  it("toggles hide utilities button and re-fetches data", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("steam-hide-utilities-toggle")).toBeInTheDocument();
    });

    // Default was true
    expect(AppBackend.GetEnrichedSteamGames).toHaveBeenCalledWith(true);
    expect(AppBackend.GetSteamLibraryPulse).toHaveBeenCalledWith(true);

    const toggleBtn = screen.getByTestId("steam-hide-utilities-toggle");
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(AppBackend.GetEnrichedSteamGames).toHaveBeenCalledWith(false);
      expect(AppBackend.GetSteamLibraryPulse).toHaveBeenCalledWith(false);
      expect(localStorage.getItem("steam:hideUtilities")).toBe("false");
    });
  });

  it("switches to Backlog tab and renders SteamBacklogView", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("steam-tab-backlog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("steam-tab-backlog"));

    await waitFor(() => {
      expect(screen.getByTestId("backlog-add-search")).toBeInTheDocument();
      expect(screen.getByTestId("roulette-spin-btn")).toBeInTheDocument();
    });
  });

  it("switches to Personal rankings tab and renders SteamPersonalTierView", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("steam-tab-rankings")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("steam-tab-rankings"));

    await waitFor(() => {
      expect(screen.getByTestId("tier-row-S")).toBeInTheDocument();
      expect(screen.getByTestId("tier-rate-search")).toBeInTheDocument();
    });
  });

  it("renders clean Steam Not Connected empty state when credentials are missing", async () => {
    vi.mocked(AppBackend.GetSteamAPIKey).mockResolvedValueOnce("");
    vi.mocked(AppBackend.GetSteamID).mockResolvedValueOnce("");

    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByText("Steam Not Connected")).toBeInTheDocument();
      expect(screen.queryByTestId("steam-tab-insights")).not.toBeInTheDocument();
    });
  });

  it("triggers sync when clicking Sync Library button", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("steam-sync-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("steam-sync-btn"));

    await waitFor(() => {
      expect(AppBackend.SyncSteamData).toHaveBeenCalledTimes(1);
    });
  });

  it("handles quick queue and quick rate actions from game cards", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("quick-queue-20")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("quick-queue-20"));

    await waitFor(() => {
      expect(AppBackend.UpsertSteamBacklogItem).toHaveBeenCalledWith(20, "up_next", "");
    });

    // Quick rate appid 20 to tier S
    const quickRateContainer = screen.getByTestId("quick-rate-20");
    const sBtn = quickRateContainer.querySelector('button[data-tier="S"]') as HTMLButtonElement;
    expect(sBtn).toBeInTheDocument();
    fireEvent.click(sBtn);

    await waitFor(() => {
      expect(AppBackend.UpsertSteamGameRating).toHaveBeenCalledWith(20, "S", 10, "");
    });
  });

  it("responds to steam:sync-progress and steam:sync-done runtime events", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("steam-sync-btn")).toBeInTheDocument();
    });

    // Fire progress event
    const progressCb = eventListeners["steam:sync-progress"]?.[0];
    expect(progressCb).toBeDefined();
    act(() => {
      progressCb("Fetching playtime...");
    });

    await waitFor(() => {
      expect(screen.getByText("Fetching playtime...")).toBeInTheDocument();
    });

    // Fire sync done event
    const doneCb = eventListeners["steam:sync-done"]?.[0];
    expect(doneCb).toBeDefined();
    act(() => {
      doneCb();
    });

    await waitFor(() => {
      expect(screen.queryByText("Fetching playtime...")).not.toBeInTheDocument();
    });
  });

  it("handles 1-click unrate and dequeue actions from game cards in insights", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("game-card-10")).toBeInTheDocument();
    });

    // Counter-Strike (10) is rated and queued in mock data
    const unrateBtn = screen.getByTestId("quick-rate-clear-10");
    fireEvent.click(unrateBtn);

    await waitFor(() => {
      expect(AppBackend.RemoveSteamGameRating).toHaveBeenCalledWith(10);
    });

    const dequeueBtn = screen.getByTestId("quick-queue-clear-10");
    fireEvent.click(dequeueBtn);

    await waitFor(() => {
      expect(AppBackend.RemoveSteamBacklogItem).toHaveBeenCalledWith(10);
    });
  });

  it("filters games by rating status filter chip and updates inspector results", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("game-card-10")).toBeInTheDocument();
      expect(screen.getByTestId("game-card-20")).toBeInTheDocument();
      expect(screen.getByTestId("filter-chip-unrated_10h")).toBeInTheDocument();
    });

    // Click Unrated 10h+ chip
    fireEvent.click(screen.getByTestId("filter-chip-unrated_10h"));

    await waitFor(() => {
      // Counter-Strike is already rated (personalTier: "S"), so it should be filtered out
      expect(screen.queryByTestId("game-card-10")).not.toBeInTheDocument();
      // Team Fortress Classic is unrated with 40h (2400 mins >= 600), so it remains
      expect(screen.getByTestId("game-card-20")).toBeInTheDocument();
    });

    // Clear filters
    const clearBtn = screen.getByTestId("inspector-clear-filter");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByTestId("game-card-10")).toBeInTheDocument();
      expect(screen.getByTestId("game-card-20")).toBeInTheDocument();
    });
  });

  it("passes hours fallback to backend stats when rating sort mode is selected", async () => {
    render(<SteamStats />);

    await waitFor(() => {
      expect(screen.getByTestId("sort-rating")).toBeInTheDocument();
    });

    vi.mocked(AppBackend.GetSteamDeveloperStats).mockClear();
    vi.mocked(AppBackend.GetSteamPublisherStats).mockClear();
    vi.mocked(AppBackend.GetSteamTagStats).mockClear();

    // Click rating sort in studio panel
    fireEvent.click(screen.getByTestId("sort-rating"));

    await waitFor(() => {
      expect(AppBackend.GetSteamDeveloperStats).toHaveBeenCalledWith("hours");
      expect(AppBackend.GetSteamPublisherStats).toHaveBeenCalledWith("hours");
      expect(AppBackend.GetSteamTagStats).toHaveBeenCalledWith("hours");
    });
  });
});

