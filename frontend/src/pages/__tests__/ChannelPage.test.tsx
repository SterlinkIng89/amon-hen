import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChannelPage from "../ChannelPage";
import * as AppBackend from "../../../wailsjs/go/backend/App";

// Mock Wails backend App calls
vi.mock("../../../wailsjs/go/backend/App", () => ({
  SyncRecentVideos: vi.fn().mockResolvedValue(undefined),
  SyncChannelData: vi.fn().mockResolvedValue(undefined),
  GetSyncStatus: vi.fn().mockResolvedValue({ count: 10, total: 10 }),
  IsYouTubeAuthed: vi.fn().mockResolvedValue(true),
  GetPlaylistVideos: vi.fn().mockResolvedValue([]),
  GetChannelVideosPaginated: vi.fn().mockResolvedValue({ videos: [], total: 0 }),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  AddVideoToPlaylist: vi.fn().mockResolvedValue(undefined),
  PurgePlaylistDuplicates: vi.fn().mockResolvedValue(0),
  UpdatePlaylistsVisibility: vi.fn().mockResolvedValue(undefined),
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
      eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
    };
  }),
  EventsOff: vi.fn(),
}));

describe("ChannelPage YouTube Sync State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key in eventListeners) {
      delete eventListeners[key];
    }
  });

  it("resets isSyncing and re-enables sync button after Light Sync completes", async () => {
    let resolveSync: () => void = () => {};
    const syncPromise = new Promise<void>((res) => {
      resolveSync = res;
    });
    vi.mocked(AppBackend.SyncRecentVideos).mockReturnValue(syncPromise as any);

    render(<ChannelPage />);

    // Wait for initial load
    const lightSyncButton = await screen.findByTitle("Light sync — fetch recent 20 videos");
    expect(lightSyncButton).not.toBeDisabled();

    // Click Light sync
    fireEvent.click(lightSyncButton);

    // Should be in syncing state (disabled)
    expect(lightSyncButton).toBeDisabled();

    // Resolve the sync operation
    await act(async () => {
      resolveSync();
      await syncPromise;
    });

    // Button should be enabled again and isSyncing reset to false
    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing and re-enables sync button after Full Sync completes", async () => {
    let resolveSync: () => void = () => {};
    const syncPromise = new Promise<void>((res) => {
      resolveSync = res;
    });
    vi.mocked(AppBackend.SyncChannelData).mockReturnValue(syncPromise as any);

    render(<ChannelPage />);

    const moreOptionsButton = await screen.findByTitle("More sync options");
    fireEvent.click(moreOptionsButton);

    const fullSyncButton = await screen.findByText("Full Sync");
    fireEvent.click(fullSyncButton);

    const syncButton = screen.getByTitle("Full sync in progress...");
    expect(syncButton).toBeDisabled();
    expect(syncButton).toHaveTextContent("Full");

    // Resolve the sync operation
    await act(async () => {
      resolveSync();
      await syncPromise;
    });

    // Button should be enabled again and reset to Light
    await waitFor(() => {
      const idleButton = screen.getByTitle("Light sync — fetch recent 20 videos");
      expect(idleButton).not.toBeDisabled();
      expect(idleButton).toHaveTextContent("Light");
    });
  });

  it("updates button label to 'Full' and tooltip to 'Full sync in progress...' when Full Sync is running", async () => {
    let resolveSync: () => void = () => {};
    const syncPromise = new Promise<void>((res) => {
      resolveSync = res;
    });
    vi.mocked(AppBackend.SyncChannelData).mockReturnValue(syncPromise as any);

    render(<ChannelPage />);

    // Initially idle
    const idleButton = await screen.findByTitle("Light sync — fetch recent 20 videos");
    expect(idleButton).toHaveTextContent("Light");

    // Open dropdown and click Full Sync
    const moreOptionsButton = screen.getByTitle("More sync options");
    fireEvent.click(moreOptionsButton);

    const fullSyncOption = await screen.findByText("Full Sync");
    fireEvent.click(fullSyncOption);

    // Should dynamically show "Full" and "Full sync in progress..."
    const syncingButton = screen.getByTitle("Full sync in progress...");
    expect(syncingButton).toBeDisabled();
    expect(syncingButton).toHaveTextContent("Full");

    // Complete sync
    await act(async () => {
      resolveSync();
      await syncPromise;
    });

    await waitFor(() => {
      const completedButton = screen.getByTitle("Light sync — fetch recent 20 videos");
      expect(completedButton).toHaveTextContent("Light");
      expect(completedButton).not.toBeDisabled();
    });
  });

  it("updates tooltip to 'Light sync in progress...' while maintaining 'Light' label when Light Sync is running", async () => {
    let resolveSync: () => void = () => {};
    const syncPromise = new Promise<void>((res) => {
      resolveSync = res;
    });
    vi.mocked(AppBackend.SyncRecentVideos).mockReturnValue(syncPromise as any);

    render(<ChannelPage />);

    const lightSyncButton = await screen.findByTitle("Light sync — fetch recent 20 videos");
    expect(lightSyncButton).toHaveTextContent("Light");

    fireEvent.click(lightSyncButton);

    const syncingButton = screen.getByTitle("Light sync in progress...");
    expect(syncingButton).toBeDisabled();
    expect(syncingButton).toHaveTextContent("Light");

    await act(async () => {
      resolveSync();
      await syncPromise;
    });

    await waitFor(() => {
      const completedButton = screen.getByTitle("Light sync — fetch recent 20 videos");
      expect(completedButton).toHaveTextContent("Light");
      expect(completedButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing to false when youtube:sync-done event fires", async () => {
    // Keep sync running initially
    vi.mocked(AppBackend.SyncRecentVideos).mockReturnValue(new Promise(() => {}) as any);

    render(<ChannelPage />);

    const lightSyncButton = await screen.findByTitle("Light sync — fetch recent 20 videos");
    fireEvent.click(lightSyncButton);

    expect(lightSyncButton).toBeDisabled();

    // Trigger the backend youtube:sync-done event
    await act(async () => {
      const callbacks = eventListeners["youtube:sync-done"] || [];
      callbacks.forEach(cb => cb());
    });

    // Should become enabled when sync-done fires
    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing to false when youtube:done event fires", async () => {
    vi.mocked(AppBackend.SyncRecentVideos).mockReturnValue(new Promise(() => {}) as any);

    render(<ChannelPage />);

    const lightSyncButton = await screen.findByTitle("Light sync — fetch recent 20 videos");
    fireEvent.click(lightSyncButton);

    expect(lightSyncButton).toBeDisabled();

    // Trigger youtube:done event
    await act(async () => {
      const callbacks = eventListeners["youtube:done"] || [];
      callbacks.forEach(cb => cb());
    });

    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing when light sync fails", async () => {
    vi.mocked(AppBackend.SyncRecentVideos).mockRejectedValue(new Error("Network failure"));

    render(<ChannelPage />);

    const lightSyncButton = await screen.findByTitle("Light sync — fetch recent 20 videos");
    fireEvent.click(lightSyncButton);

    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing when full sync fails", async () => {
    vi.mocked(AppBackend.SyncChannelData).mockRejectedValue(new Error("Network failure"));

    render(<ChannelPage />);

    const moreOptionsButton = await screen.findByTitle("More sync options");
    fireEvent.click(moreOptionsButton);

    const fullSyncButton = await screen.findByText("Full Sync");
    fireEvent.click(fullSyncButton);

    await waitFor(() => {
      const lightSyncButton = screen.getByTitle("Light sync — fetch recent 20 videos");
      expect(lightSyncButton).not.toBeDisabled();
      expect(lightSyncButton).toHaveTextContent("Light");
    });
  });

  it("resets isSyncing after auto-sync on first visit completes", async () => {
    vi.mocked(AppBackend.GetSyncStatus).mockResolvedValue({ count: 0, total: 0 } as any);
    let resolveAutoSync: () => void = () => {};
    const autoSyncPromise = new Promise<void>((res) => {
      resolveAutoSync = res;
    });
    vi.mocked(AppBackend.SyncChannelData).mockReturnValue(autoSyncPromise as any);

    render(<ChannelPage />);

    const fullSyncButton = await screen.findByTitle("Full sync in progress...");
    expect(fullSyncButton).toBeDisabled();
    expect(fullSyncButton).toHaveTextContent("Full");

    // Finish auto-sync
    await act(async () => {
      resolveAutoSync();
      await autoSyncPromise;
    });

    await waitFor(() => {
      const lightSyncButton = screen.getByTitle("Light sync — fetch recent 20 videos");
      expect(lightSyncButton).not.toBeDisabled();
      expect(lightSyncButton).toHaveTextContent("Light");
    });
  });
  it("renders a responsive subheader without fixed height h-14", async () => {
    const { container } = render(<ChannelPage />);
    
    // Wait for component to settle to avoid act() warnings
    await screen.findByTitle("Light sync — fetch recent 20 videos");

    const stickyHeader = container.querySelector(".sticky.top-0 > div");
    expect(stickyHeader).toBeInTheDocument();
    expect(stickyHeader).not.toHaveClass("h-14");
    expect(stickyHeader).toHaveClass("min-h-14");
    expect(stickyHeader).toHaveClass("py-2");
  });

  it("displays string sync progress message without undefined when youtube:sync-progress fires with string", async () => {
    render(<ChannelPage />);
    await screen.findByTitle("Light sync — fetch recent 20 videos");

    await act(async () => {
      const callbacks = eventListeners["youtube:sync-progress"] || [];
      callbacks.forEach(cb => cb("Syncing playlists..."));
    });

    expect(screen.getByText("Syncing playlists...")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("displays progress when youtube:sync-progress fires with count string", async () => {
    render(<ChannelPage />);
    await screen.findByTitle("Light sync — fetch recent 20 videos");

    await act(async () => {
      const callbacks = eventListeners["youtube:sync-progress"] || [];
      callbacks.forEach(cb => cb("Syncing videos... (42)"));
    });

    expect(screen.getByText("Syncing videos... (42)")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("displays structured sync progress when youtube:sync-progress fires with an object", async () => {
    render(<ChannelPage />);
    await screen.findByTitle("Light sync — fetch recent 20 videos");

    await act(async () => {
      const callbacks = eventListeners["youtube:sync-progress"] || [];
      callbacks.forEach(cb => cb({ stage: "playlists", count: 5, total: 10 }));
    });

    expect(screen.getByText("Syncing: playlists (5/10)")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("shows duplicate warning banner and badges on duplicate videos in playlist view", async () => {
    const mockPlaylists = [
      { id: "pl-1", title: "Boss Battles", description: "", videoCount: 3, thumbnailUrl: "", publishedAt: "", privacy: "public" },
    ];
    const mockPlaylistVideos = [
      { id: "v1", title: "Boss 1", description: "", publishedAt: "2026-01-01T00:00:00Z", thumbnailUrl: "", viewCount: 10, likeCount: 1, duration: "PT1M", privacy: "public", localFile: "" },
      { id: "v2", title: "Boss 2", description: "", publishedAt: "2026-01-02T00:00:00Z", thumbnailUrl: "", viewCount: 20, likeCount: 2, duration: "PT2M", privacy: "public", localFile: "" },
      { id: "v1", title: "Boss 1", description: "", publishedAt: "2026-01-01T00:00:00Z", thumbnailUrl: "", viewCount: 10, likeCount: 1, duration: "PT1M", privacy: "public", localFile: "" },
    ];

    vi.mocked(AppBackend.GetChannelPlaylists).mockResolvedValue(mockPlaylists as any);
    vi.mocked(AppBackend.GetPlaylistVideos).mockResolvedValue(mockPlaylistVideos as any);

    render(<ChannelPage />);

    // Switch to playlists tab
    const playlistsTab = await screen.findByRole("button", { name: "Playlists" });
    fireEvent.click(playlistsTab);

    // Open playlist
    const playlistCard = await screen.findByText("Boss Battles");
    fireEvent.click(playlistCard);

    // Wait for playlist items to load
    await waitFor(() => {
      expect(screen.getByText("1 duplicate video detected")).toBeInTheDocument();
    });

    // Verify duplicate badge on cards
    const duplicateBadges = screen.getAllByText("Duplicate (2x)");
    expect(duplicateBadges.length).toBe(2);

    // Verify purge duplicates button shows count badge
    const purgeButton = screen.getByRole("button", { name: /Purge Duplicates \(1\)/i });
    expect(purgeButton).toBeInTheDocument();

    // Trigger purge
    vi.mocked(AppBackend.PurgePlaylistDuplicates).mockResolvedValue(1);
    fireEvent.click(purgeButton);

    await waitFor(() => {
      expect(AppBackend.PurgePlaylistDuplicates).toHaveBeenCalledWith("pl-1");
    });
  });

  it("shows duplicate badge on playlist cards in playlist grid overview when duplicateCount > 0", async () => {
    const mockPlaylists = [
      { id: "pl-1", title: "Boss Battles", description: "", videoCount: 5, thumbnailUrl: "", publishedAt: "", privacy: "public", duplicateCount: 2 },
      { id: "pl-2", title: "Clean List", description: "", videoCount: 3, thumbnailUrl: "", publishedAt: "", privacy: "public", duplicateCount: 0 },
    ];

    vi.mocked(AppBackend.GetChannelPlaylists).mockResolvedValue(mockPlaylists as any);

    render(<ChannelPage />);

    // Switch to playlists tab
    const playlistsTab = await screen.findByRole("button", { name: "Playlists" });
    fireEvent.click(playlistsTab);

    // Wait for playlists to render
    await screen.findByText("Boss Battles");
    await screen.findByText("Clean List");

    // Check duplicate badge is rendered for pl-1
    const dupBadge = screen.getByTestId("duplicate-badge");
    expect(dupBadge).toBeInTheDocument();
    expect(dupBadge).toHaveTextContent("2 duplicates");
  });
});


