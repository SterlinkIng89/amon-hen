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

    const lightSyncButton = screen.getByTitle("Light sync — fetch recent 20 videos");
    expect(lightSyncButton).toBeDisabled();

    // Resolve the sync operation
    await act(async () => {
      resolveSync();
      await syncPromise;
    });

    // Button should be enabled again
    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
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

    const lightSyncButton = screen.getByTitle("Light sync — fetch recent 20 videos");
    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
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

    const lightSyncButton = await screen.findByTitle("Light sync — fetch recent 20 videos");

    // During auto-sync, button should be disabled
    expect(lightSyncButton).toBeDisabled();

    // Finish auto-sync
    await act(async () => {
      resolveAutoSync();
      await autoSyncPromise;
    });

    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
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
});

