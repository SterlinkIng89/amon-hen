import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
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
  GetChannelVideosPaginated: vi
    .fn()
    .mockResolvedValue({ videos: [], total: 0 }),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  AddVideoToPlaylist: vi.fn().mockResolvedValue(undefined),
  PurgePlaylistDuplicates: vi.fn().mockResolvedValue(0),
  UpdatePlaylistsVisibility: vi.fn().mockResolvedValue(undefined),
  ListCatalogPlaylists: vi.fn().mockResolvedValue([]),
  GetPlaylistCatalogDraft: vi.fn().mockResolvedValue(null),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetAllGameTags: vi.fn().mockResolvedValue([]),
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
      eventListeners[event] = eventListeners[event].filter(
        (cb) => cb !== callback,
      );
    };
  }),
  EventsOff: vi.fn(),
}));

vi.mock("../../components/youtube/YouTubeInlinePlayer", () => ({
  default: () => <div data-testid="mock-yt-player" />,
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
    const lightSyncButton = await screen.findByTitle(
      "Light sync — fetch recent 20 videos",
    );
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
      const idleButton = screen.getByTitle(
        "Light sync — fetch recent 20 videos",
      );
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
    const idleButton = await screen.findByTitle(
      "Light sync — fetch recent 20 videos",
    );
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
      const completedButton = screen.getByTitle(
        "Light sync — fetch recent 20 videos",
      );
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

    const lightSyncButton = await screen.findByTitle(
      "Light sync — fetch recent 20 videos",
    );
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
      const completedButton = screen.getByTitle(
        "Light sync — fetch recent 20 videos",
      );
      expect(completedButton).toHaveTextContent("Light");
      expect(completedButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing to false when youtube:sync-done event fires", async () => {
    // Keep sync running initially
    vi.mocked(AppBackend.SyncRecentVideos).mockReturnValue(
      new Promise(() => {}) as any,
    );

    render(<ChannelPage />);

    const lightSyncButton = await screen.findByTitle(
      "Light sync — fetch recent 20 videos",
    );
    fireEvent.click(lightSyncButton);

    expect(lightSyncButton).toBeDisabled();

    // Trigger the backend youtube:sync-done event
    await act(async () => {
      const callbacks = eventListeners["youtube:sync-done"] || [];
      callbacks.forEach((cb) => cb());
    });

    // Should become enabled when sync-done fires
    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing to false when youtube:done event fires", async () => {
    vi.mocked(AppBackend.SyncRecentVideos).mockReturnValue(
      new Promise(() => {}) as any,
    );

    render(<ChannelPage />);

    const lightSyncButton = await screen.findByTitle(
      "Light sync — fetch recent 20 videos",
    );
    fireEvent.click(lightSyncButton);

    expect(lightSyncButton).toBeDisabled();

    // Trigger youtube:done event
    await act(async () => {
      const callbacks = eventListeners["youtube:done"] || [];
      callbacks.forEach((cb) => cb());
    });

    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing when light sync fails", async () => {
    vi.mocked(AppBackend.SyncRecentVideos).mockRejectedValue(
      new Error("Network failure"),
    );

    render(<ChannelPage />);

    const lightSyncButton = await screen.findByTitle(
      "Light sync — fetch recent 20 videos",
    );
    fireEvent.click(lightSyncButton);

    await waitFor(() => {
      expect(lightSyncButton).not.toBeDisabled();
    });
  });

  it("resets isSyncing when full sync fails", async () => {
    vi.mocked(AppBackend.SyncChannelData).mockRejectedValue(
      new Error("Network failure"),
    );

    render(<ChannelPage />);

    const moreOptionsButton = await screen.findByTitle("More sync options");
    fireEvent.click(moreOptionsButton);

    const fullSyncButton = await screen.findByText("Full Sync");
    fireEvent.click(fullSyncButton);

    await waitFor(() => {
      const lightSyncButton = screen.getByTitle(
        "Light sync — fetch recent 20 videos",
      );
      expect(lightSyncButton).not.toBeDisabled();
      expect(lightSyncButton).toHaveTextContent("Light");
    });
  });

  it("resets isSyncing after auto-sync on first visit completes", async () => {
    vi.mocked(AppBackend.GetSyncStatus).mockResolvedValue({
      count: 0,
      total: 0,
    } as any);
    let resolveAutoSync: () => void = () => {};
    const autoSyncPromise = new Promise<void>((res) => {
      resolveAutoSync = res;
    });
    vi.mocked(AppBackend.SyncChannelData).mockReturnValue(
      autoSyncPromise as any,
    );

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
      const lightSyncButton = screen.getByTitle(
        "Light sync — fetch recent 20 videos",
      );
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
      callbacks.forEach((cb) => cb("Syncing playlists..."));
    });

    expect(screen.getByText("Syncing playlists...")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("displays progress when youtube:sync-progress fires with count string", async () => {
    render(<ChannelPage />);
    await screen.findByTitle("Light sync — fetch recent 20 videos");

    await act(async () => {
      const callbacks = eventListeners["youtube:sync-progress"] || [];
      callbacks.forEach((cb) => cb("Syncing videos... (42)"));
    });

    expect(screen.getByText("Syncing videos... (42)")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("displays structured sync progress when youtube:sync-progress fires with an object", async () => {
    render(<ChannelPage />);
    await screen.findByTitle("Light sync — fetch recent 20 videos");

    await act(async () => {
      const callbacks = eventListeners["youtube:sync-progress"] || [];
      callbacks.forEach((cb) =>
        cb({ stage: "playlists", count: 5, total: 10 }),
      );
    });

    expect(screen.getByText("Syncing: playlists (5/10)")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("shows duplicate warning banner and badges on duplicate videos in playlist view", async () => {
    const mockPlaylists = [
      {
        id: "pl-1",
        title: "Boss Battles",
        description: "",
        videoCount: 3,
        thumbnailUrl: "",
        publishedAt: "",
        privacy: "public",
      },
    ];
    const mockPlaylistVideos = [
      {
        id: "v1",
        title: "Boss 1",
        description: "",
        publishedAt: "2026-01-01T00:00:00Z",
        thumbnailUrl: "",
        viewCount: 10,
        likeCount: 1,
        duration: "PT1M",
        privacy: "public",
        localFile: "",
      },
      {
        id: "v2",
        title: "Boss 2",
        description: "",
        publishedAt: "2026-01-02T00:00:00Z",
        thumbnailUrl: "",
        viewCount: 20,
        likeCount: 2,
        duration: "PT2M",
        privacy: "public",
        localFile: "",
      },
      {
        id: "v1",
        title: "Boss 1",
        description: "",
        publishedAt: "2026-01-01T00:00:00Z",
        thumbnailUrl: "",
        viewCount: 10,
        likeCount: 1,
        duration: "PT1M",
        privacy: "public",
        localFile: "",
      },
    ];

    vi.mocked(AppBackend.GetChannelPlaylists).mockResolvedValue(
      mockPlaylists as any,
    );
    vi.mocked(AppBackend.GetPlaylistVideos).mockResolvedValue(
      mockPlaylistVideos as any,
    );

    render(<ChannelPage />);

    // Switch to playlists tab
    const playlistsTab = await screen.findByRole("button", {
      name: "Playlists",
    });
    fireEvent.click(playlistsTab);

    // Open playlist
    const playlistCard = await screen.findByText("Boss Battles");
    fireEvent.click(playlistCard);

    // Wait for playlist items to load
    await waitFor(() => {
      expect(
        screen.getByText("1 duplicate video detected"),
      ).toBeInTheDocument();
    });

    // Verify duplicate badge on cards
    const duplicateBadges = screen.getAllByText("Duplicate (2x)");
    expect(duplicateBadges.length).toBe(2);

    // Verify purge duplicates button shows count badge
    const purgeButton = screen.getByRole("button", {
      name: /Purge Duplicates \(1\)/i,
    });
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
      {
        id: "pl-1",
        title: "Boss Battles",
        description: "",
        videoCount: 5,
        thumbnailUrl: "",
        publishedAt: "",
        privacy: "public",
        duplicateCount: 2,
      },
      {
        id: "pl-2",
        title: "Clean List",
        description: "",
        videoCount: 3,
        thumbnailUrl: "",
        publishedAt: "",
        privacy: "public",
        duplicateCount: 0,
      },
    ];

    vi.mocked(AppBackend.GetChannelPlaylists).mockResolvedValue(
      mockPlaylists as any,
    );

    render(<ChannelPage />);

    // Switch to playlists tab
    const playlistsTab = await screen.findByRole("button", {
      name: "Playlists",
    });
    fireEvent.click(playlistsTab);

    // Wait for playlists to render
    await screen.findByText("Boss Battles");
    await screen.findByText("Clean List");

    // Check duplicate badge is rendered for pl-1
    const dupBadge = screen.getByTestId("duplicate-badge");
    expect(dupBadge).toBeInTheDocument();
    expect(dupBadge).toHaveTextContent("2 duplicates");
  });

  it("opens EditPlaylistModal when clicking edit playlist button on card and in sub-header", async () => {
    const testPlaylists = [
      {
        id: "pl-1",
        title: "Boss Battles",
        description: "Epic fights",
        videoCount: 5,
        thumbnailUrl: "",
        publishedAt: "",
        privacy: "public",
        duplicateCount: 2,
      },
      {
        id: "pl-2",
        title: "Clean List",
        description: "",
        videoCount: 3,
        thumbnailUrl: "",
        publishedAt: "",
        privacy: "public",
        duplicateCount: 0,
      },
    ];

    vi.mocked(AppBackend.GetChannelPlaylists).mockResolvedValue(
      testPlaylists as any,
    );
    vi.mocked(AppBackend.GetPlaylistVideos).mockResolvedValue([]);

    render(<ChannelPage />);

    // Switch to playlists tab
    const playlistsTab = await screen.findByRole("button", {
      name: "Playlists",
    });
    fireEvent.click(playlistsTab);

    await screen.findByText("Boss Battles");

    // Click edit on the first playlist card
    const editBtns = screen.getAllByTitle("Edit playlist");
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);

    // Modal opens
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Playlist" })).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Click into playlist to view its items
    const playlistCard = screen.getByText("Boss Battles");
    fireEvent.click(playlistCard);

    // Edit button appears next to active playlist title in sub-header
    const subheaderEditBtn = await screen.findByTitle("Edit playlist");
    fireEvent.click(subheaderEditBtn);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Boss Battles")).toBeInTheDocument();
  });

  it("switches to catalog tab when clicking the Catalog tab button", async () => {
    vi.mocked(AppBackend.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-cat-1", title: "Control Playthrough", videoCount: 5, linked: false, tag: "" },
    ] as any);

    render(<ChannelPage />);

    const catalogTab = await screen.findByRole("button", {
      name: "Catalog",
    });
    fireEvent.click(catalogTab);

    expect(await screen.findByText("Control Playthrough")).toBeInTheDocument();
  });

  describe("ChannelPage video groups selection and collapse", () => {
    const mockVideos = [
      {
        id: "vid-group-1",
        title: "Elden Ring Ep 1",
        description: "",
        publishedAt: "2026-10-19T10:00:00Z",
        thumbnailUrl: "https://example.com/thumb1.jpg",
        viewCount: 1500,
        likeCount: 50,
        duration: "PT10M",
        privacy: "public",
      },
      {
        id: "vid-group-2",
        title: "Elden Ring Ep 2",
        description: "",
        publishedAt: "2026-10-19T11:00:00Z",
        thumbnailUrl: "https://example.com/thumb2.jpg",
        viewCount: 2500,
        likeCount: 80,
        duration: "PT15M",
        privacy: "public",
      },
    ];

    it("renders group total views badge and handles select/deselect all in group", async () => {
      vi.mocked(AppBackend.GetChannelVideosPaginated).mockResolvedValue({
        videos: mockVideos as any,
        total: 2,
      });

      render(<ChannelPage />);

      await screen.findByText("Elden Ring Ep 1");
      expect(screen.getByText("Elden Ring Ep 2")).toBeInTheDocument();

      // Check group total views badge (1500 + 2500 = 4,000)
      expect(screen.getByText("4,000 views")).toBeInTheDocument();
      expect(screen.getByText("2 videos")).toBeInTheDocument();

      // Checkbox button for selecting all videos in group
      const selectGroupButton = screen.getByRole("button", {
        name: /Select all videos in/i,
      });
      expect(selectGroupButton).toBeInTheDocument();
      expect(selectGroupButton).toHaveAttribute("title", "Select group");

      // Select group
      fireEvent.click(selectGroupButton);

      // Verify bulk action bar is displayed with count 2
      expect(await screen.findByText("videos selected")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(selectGroupButton).toHaveAttribute("title", "Deselect group");

      // Deselect group
      fireEvent.click(selectGroupButton);

      await waitFor(() => {
        expect(screen.queryByText("videos selected")).not.toBeInTheDocument();
      });
      expect(selectGroupButton).toHaveAttribute("title", "Select group");
    });

    it("displays indeterminate dash icon when partially selected", async () => {
      vi.mocked(AppBackend.GetChannelVideosPaginated).mockResolvedValue({
        videos: mockVideos as any,
        total: 2,
      });

      render(<ChannelPage />);

      await screen.findByText("Elden Ring Ep 1");

      const selectGroupButton = screen.getByRole("button", {
        name: /Select all videos in/i,
      });

      // Initially no SVG line (dash)
      expect(selectGroupButton.querySelector("line")).toBeNull();

      // Select individual video 1 using its selection checkbox
      const videoCheckboxes = screen.getAllByRole("button", {
        name: "Select video",
      });
      fireEvent.click(videoCheckboxes[0]);

      // Bulk action bar shows 1 video selected
      expect(await screen.findByText("video selected")).toBeInTheDocument();

      // Group checkbox shows indeterminate line
      await waitFor(() => {
        expect(selectGroupButton.querySelector("line")).toBeInTheDocument();
      });
    });

    it("collapses and expands video group cards", async () => {
      vi.mocked(AppBackend.GetChannelVideosPaginated).mockResolvedValue({
        videos: mockVideos as any,
        total: 2,
      });

      render(<ChannelPage />);

      await screen.findByText("Elden Ring Ep 1");
      expect(screen.getByText("Elden Ring Ep 2")).toBeInTheDocument();

      const collapseButton = screen.getByRole("button", {
        name: /Collapse/i,
      });
      expect(collapseButton).toBeInTheDocument();

      // Collapse group
      fireEvent.click(collapseButton);

      // Videos are hidden, header remains
      expect(screen.queryByText("Elden Ring Ep 1")).not.toBeInTheDocument();
      expect(screen.queryByText("Elden Ring Ep 2")).not.toBeInTheDocument();
      expect(screen.getByText("4,000 views")).toBeInTheDocument();

      // Expand group
      const expandButton = screen.getByRole("button", {
        name: /Expand/i,
      });
      fireEvent.click(expandButton);

      // Videos are visible again
      expect(await screen.findByText("Elden Ring Ep 1")).toBeInTheDocument();
      expect(screen.getByText("Elden Ring Ep 2")).toBeInTheDocument();
    });
  });

  describe("ChannelPage dynamic Group By selector & Privacy/Status filters", () => {
    const mockVideos = [
      {
        id: "vid-1",
        title: "Zelda - Part 1",
        description: "",
        publishedAt: "2026-10-21T10:00:00Z",
        thumbnailUrl: "https://example.com/thumb1.jpg",
        viewCount: 100,
        likeCount: 10,
        duration: "PT10M",
        privacy: "public",
        monetizationStatus: "monetized",
        gameTag: "Zelda",
        playlistTitle: "Zelda Series",
      },
      {
        id: "vid-2",
        title: "Metroid - Part 1",
        description: "",
        publishedAt: "2026-10-20T10:00:00Z",
        thumbnailUrl: "https://example.com/thumb2.jpg",
        viewCount: 200,
        likeCount: 20,
        duration: "PT15M",
        privacy: "unlisted",
        monetizationStatus: "limited",
        gameTag: "Metroid",
        playlistTitle: "Metroid Series",
      },
      {
        id: "vid-3",
        title: "Untagged - 2026-10-19",
        description: "",
        publishedAt: "2026-10-19T10:00:00Z",
        thumbnailUrl: "https://example.com/thumb3.jpg",
        viewCount: 300,
        likeCount: 30,
        duration: "PT20M",
        privacy: "private",
        monetizationStatus: "demonetized",
        gameTag: "",
        playlistTitle: "",
      },
    ];

    beforeEach(() => {
      localStorage.clear();
      vi.mocked(AppBackend.GetChannelVideosPaginated).mockResolvedValue({
        videos: mockVideos as any,
        total: 3,
      });
    });

    it("filters videos by privacy when Filter by privacy select changes", async () => {
      render(<ChannelPage />);

      await screen.findByText(/Zelda/);
      expect(screen.getByText(/Metroid/)).toBeInTheDocument();
      expect(screen.getByText(/Untagged/)).toBeInTheDocument();

      const privacySelect = screen.getByLabelText("Filter by privacy");
      fireEvent.change(privacySelect, { target: { value: "unlisted" } });

      await waitFor(() => {
        expect(screen.getByText(/Metroid/)).toBeInTheDocument();
        expect(screen.queryByText(/Zelda/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Untagged/)).not.toBeInTheDocument();
      });

      fireEvent.change(privacySelect, { target: { value: "private" } });

      await waitFor(() => {
        expect(screen.getByText(/Untagged/)).toBeInTheDocument();
        expect(screen.queryByText(/Zelda/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Metroid/)).not.toBeInTheDocument();
      });
    });

    it("filters videos by monetization status when Filter by status select changes", async () => {
      render(<ChannelPage />);

      await screen.findByText(/Zelda/);

      const statusSelect = screen.getByLabelText("Filter by status");
      fireEvent.change(statusSelect, { target: { value: "limited" } });

      await waitFor(() => {
        expect(screen.getByText(/Metroid/)).toBeInTheDocument();
        expect(screen.queryByText(/Zelda/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Untagged/)).not.toBeInTheDocument();
      });

      fireEvent.change(statusSelect, { target: { value: "demonetized" } });

      await waitFor(() => {
        expect(screen.getByText(/Untagged/)).toBeInTheDocument();
        expect(screen.queryByText(/Zelda/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Metroid/)).not.toBeInTheDocument();
      });
    });

    it("switches grouping modes and renders corresponding group headers", async () => {
      render(<ChannelPage />);

      await screen.findByText(/Zelda/);

      const groupSelect = screen.getByLabelText("Group videos by");

      // Group by playlist
      fireEvent.change(groupSelect, { target: { value: "playlist" } });
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Select all videos in Zelda Series" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in Metroid Series" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in No Playlist" }),
        ).toBeInTheDocument();
      });

      // Group by game
      fireEvent.change(groupSelect, { target: { value: "game" } });
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Select all videos in Zelda" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in Metroid" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in Untagged" }),
        ).toBeInTheDocument();
      });

      // Group by privacy
      fireEvent.change(groupSelect, { target: { value: "privacy" } });
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Select all videos in Public" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in Unlisted" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in Private" }),
        ).toBeInTheDocument();
      });

      // Group by status
      fireEvent.change(groupSelect, { target: { value: "status" } });
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Select all videos in Monetized" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in Limited" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Select all videos in Demonetized" }),
        ).toBeInTheDocument();
      });

      // Group by none
      fireEvent.change(groupSelect, { target: { value: "none" } });
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /Select all videos in/i }),
        ).toBeNull();
        expect(screen.getByText(/Zelda/)).toBeInTheDocument();
        expect(screen.getByText(/Metroid/)).toBeInTheDocument();
        expect(screen.getByText(/Untagged/)).toBeInTheDocument();
      });
    });
  });

  describe("Player View collapsible video list sidebar", () => {
    const mockVideos = [
      {
        id: "vid-pl-1",
        title: "Player Test Ep 1",
        description: "Test description",
        publishedAt: "2026-10-20T10:00:00Z",
        thumbnailUrl: "https://example.com/thumb1.jpg",
        viewCount: 100,
        likeCount: 10,
        duration: "PT10M",
        privacy: "public",
      },
    ];

    beforeEach(() => {
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
      localStorage.clear();
      vi.mocked(AppBackend.GetChannelVideosPaginated).mockResolvedValue({
        videos: mockVideos as any,
        total: 1,
      });
    });

    it("collapses and expands video list sidebar and persists state to localStorage", async () => {
      render(<ChannelPage />);

      const videoCard = await screen.findByText("Player Test Ep 1");
      fireEvent.click(videoCard);

      // Verify player view rendered
      const collapseBtn = await screen.findByRole("button", {
        name: "Collapse video list",
      });
      const backBtn = screen.getByRole("button", {
        name: "Back to Grid",
      });
      expect(collapseBtn).toBeInTheDocument();
      expect(backBtn).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText("Search videos…")).toHaveLength(2);

      // Click collapse
      fireEvent.click(collapseBtn);

      expect(localStorage.getItem("channel_player_list_collapsed")).toBe("true");
      expect(
        screen.getByRole("button", { name: "Expand video list" }),
      ).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText("Search videos…")).toHaveLength(1);

      // Click expand
      const expandBtn = screen.getByRole("button", {
        name: "Expand video list",
      });
      fireEvent.click(expandBtn);

      expect(localStorage.getItem("channel_player_list_collapsed")).toBe("false");
      expect(
        screen.getByRole("button", { name: "Collapse video list" }),
      ).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText("Search videos…")).toHaveLength(2);
    });

    it("navigates back to grid when Back to Grid is clicked", async () => {
      render(<ChannelPage />);

      const videoCard = await screen.findByText("Player Test Ep 1");
      fireEvent.click(videoCard);

      const backBtn = await screen.findByRole("button", {
        name: "Back to Grid",
      });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Collapse video list" }),
        ).toBeNull();
      });
    });
  });
});

