import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePlaylistCatalog } from "../usePlaylistCatalog";
import * as AppBindings from "../../../wailsjs/go/backend/App";
import { backend } from "../../../wailsjs/go/models";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  ListCatalogPlaylists: vi.fn(),
  GetPlaylistCatalogDraft: vi.fn(),
  ApplyPlaylistCatalog: vi.fn(),
}));

describe("usePlaylistCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads playlists on initialization", async () => {
    const mockPlaylists = [
      { playlistId: "pl-1", title: "Control Playthrough", videoCount: 5, linked: false, tag: "" },
    ];
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue(mockPlaylists as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.loadPlaylists();
    });

    expect(result.current.isLoadingPlaylists).toBe(false);
    expect(result.current.playlists).toEqual(mockPlaylists);
    expect(result.current.loadError).toBeNull();
  });

  it("selects a playlist and initializes draft edit state", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValueOnce([]);
    const mockDraft = {
      playlistId: "pl-1",
      title: "Control",
      videoCount: 2,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: false,
      steamAppId: "870780",
      needsSync: true,
      videos: [
        { videoId: "yt-1", title: "Control Ep 1", existingEpisode: 0, episode: 1, conflict: false },
        { videoId: "yt-2", title: "Control Ep 2", existingEpisode: 0, episode: 2, conflict: false },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(mockDraft as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-1");
    });

    expect(result.current.selectedPlaylistId).toBe("pl-1");
    expect(result.current.draft).toEqual(mockDraft);
    expect(result.current.editedTag).toBe("control");
    expect(result.current.editedEpisodes).toEqual({
      "yt-1": 1,
      "yt-2": 2,
    });
    expect(result.current.canApply).toBe(true);
  });

  it("allows editing tag and episode numbers and flags duplicates", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValueOnce([]);
    const mockDraft = {
      playlistId: "pl-1",
      title: "Control",
      videoCount: 2,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: false,
      steamAppId: "870780",
      needsSync: true,
      videos: [
        { videoId: "yt-1", title: "Control Ep 1", existingEpisode: 0, episode: 1, conflict: false },
        { videoId: "yt-2", title: "Control Ep 2", existingEpisode: 0, episode: 2, conflict: false },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(mockDraft as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-1");
    });

    act(() => {
      result.current.setEditedTag("control_remaster");
    });
    expect(result.current.editedTag).toBe("control_remaster");

    // Introduce duplicate episode
    act(() => {
      result.current.setEpisode("yt-2", 1);
    });
    expect(result.current.hasConflicts).toBe(true);
    expect(result.current.canApply).toBe(false);

    // Fix conflict
    act(() => {
      result.current.setEpisode("yt-2", 2);
    });
    expect(result.current.hasConflicts).toBe(false);
    expect(result.current.canApply).toBe(true);
  });

  it("applies catalog draft successfully and refreshes list", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-1",
      title: "Control",
      videoCount: 1,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: false,
      steamAppId: "870780",
      needsSync: true,
      videos: [
        { videoId: "yt-1", title: "Control Ep 1", existingEpisode: 0, episode: 1, conflict: false },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(mockDraft as any);
    vi.mocked(AppBindings.ApplyPlaylistCatalog).mockResolvedValueOnce();

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-1");
    });

    let success = false;
    await act(async () => {
      success = await result.current.applyCatalog();
    });

    expect(success).toBe(true);
    expect(AppBindings.ApplyPlaylistCatalog).toHaveBeenCalledWith({
      playlistId: "pl-1",
      tag: "control",
      kind: "vod",
      updateLocal: true,
      assignments: [{ videoId: "yt-1", episode: 1 }],
    });
    expect(result.current.applySuccess).toBe(true);
  });

  it("forwards updateLocal: false when explicitly passed to applyCatalog", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-1",
      title: "Control",
      videoCount: 1,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: false,
      steamAppId: "870780",
      needsSync: true,
      videos: [
        { videoId: "yt-1", title: "Control Ep 1", existingEpisode: 0, episode: 1, conflict: false },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(mockDraft as any);
    vi.mocked(AppBindings.ApplyPlaylistCatalog).mockResolvedValueOnce();

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-1");
    });

    let success = false;
    await act(async () => {
      success = await result.current.applyCatalog(false);
    });

    expect(success).toBe(true);
    expect(AppBindings.ApplyPlaylistCatalog).toHaveBeenCalledWith({
      playlistId: "pl-1",
      tag: "control",
      kind: "vod",
      updateLocal: false,
      assignments: [{ videoId: "yt-1", episode: 1 }],
    });
  });

  it("numbers episodes by date and position tie-breaker", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValueOnce([]);
    const mockDraft = {
      playlistId: "pl-2",
      title: "Series",
      videoCount: 3,
      kind: "vod",
      tag: "series",
      tagConfidence: "high",
      linked: false,
      steamAppId: "",
      needsSync: false,
      videos: [
        { videoId: "v-later", title: "Later", publishedAt: "2026-03-01T10:00:00Z", position: 0, episode: 0, existingEpisode: 0, conflict: false },
        { videoId: "v-earlier", title: "Earlier", publishedAt: "2026-01-01T10:00:00Z", position: 1, episode: 0, existingEpisode: 0, conflict: false },
        { videoId: "v-mid", title: "Mid", publishedAt: "2026-02-01T10:00:00Z", position: 2, episode: 0, existingEpisode: 0, conflict: false },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(mockDraft as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-2");
    });

    act(() => {
      result.current.autoNumberByDate();
    });

    expect(result.current.editedEpisodes).toEqual({
      "v-earlier": 1,
      "v-mid": 2,
      "v-later": 3,
    });
  });

  it("updates video thumbnail in draft and reloads draft from backend", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValueOnce([]);
    const initialDraft = {
      playlistId: "pl-sync",
      title: "Sync Test",
      videoCount: 1,
      kind: "vod",
      tag: "sync",
      videos: [
        { videoId: "yt-sync-1", title: "Video 1", episode: 1, thumbnailUrl: "old.jpg", thumbnailUpdatedAt: 0 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(initialDraft as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-sync");
    });

    expect(result.current.draft?.videos[0].thumbnailUpdatedAt).toBe(0);

    // Call updateVideoThumbnail directly
    act(() => {
      result.current.updateVideoThumbnail("yt-sync-1", "new.jpg", 1750000000);
    });

    expect(result.current.draft?.videos[0].thumbnailUrl).toBe("new.jpg");
    expect(result.current.draft?.videos[0].thumbnailUpdatedAt).toBe(1750000000);

    // Call reloadDraft
    const refreshedDraft = {
      ...initialDraft,
      videos: [
        { videoId: "yt-sync-1", title: "Video 1", episode: 1, thumbnailUrl: "refreshed.jpg", thumbnailUpdatedAt: 1750000100 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(refreshedDraft as any);

    await act(async () => {
      await result.current.reloadDraft();
    });

    expect(result.current.draft?.videos[0].thumbnailUrl).toBe("refreshed.jpg");
    expect(result.current.draft?.videos[0].thumbnailUpdatedAt).toBe(1750000100);
  });

  it("updates video description in draft state", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValueOnce([]);
    const initialDraft = {
      playlistId: "pl-desc-sync",
      title: "Sync Playlist",
      videoCount: 1,
      kind: "vod",
      tag: "sync",
      tagConfidence: "high",
      linked: false,
      videos: [
        { videoId: "yt-desc-1", title: "Video 1", description: "Old description", episode: 1 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(initialDraft as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-desc-sync");
    });

    expect(result.current.draft?.videos[0].description).toBe("Old description");

    act(() => {
      result.current.updateVideoDescription("yt-desc-1", "New description applied");
    });

    expect(result.current.draft?.videos[0].description).toBe("New description applied");
  });

  it("updates playlist template preview and hasCustomTemplate in playlists and active draft", async () => {
    const mockPlaylists = [
      {
        playlistId: "pl-hades",
        title: "Hades Playlist",
        thumbnailUrl: "old-thumb.jpg",
        videoCount: 5,
        kind: "vod",
        tag: "Hades",
        tagConfidence: "known",
        linked: true,
        hasCustomTemplate: false,
      },
      {
        playlistId: "pl-other",
        title: "Other Playlist",
        thumbnailUrl: "other.jpg",
        videoCount: 2,
        kind: "vod",
        tag: "Other",
        tagConfidence: "known",
        linked: false,
        hasCustomTemplate: false,
      },
    ];
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue(mockPlaylists as any);
    const mockDraft = {
      ...mockPlaylists[0],
      videos: [],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(mockDraft as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.loadPlaylists();
      await result.current.selectPlaylist("pl-hades");
    });

    expect(result.current.playlists[0].hasCustomTemplate).toBe(false);
    expect(result.current.draft?.hasCustomTemplate).toBe(false);

    act(() => {
      result.current.updatePlaylistTemplatePreview("Hades", "data:image/jpeg;base64,newpreview");
    });

    expect(result.current.playlists[0].thumbnailUrl).toBe("data:image/jpeg;base64,newpreview");
    expect(result.current.playlists[0].hasCustomTemplate).toBe(true);
    expect(result.current.playlists[1].hasCustomTemplate).toBe(false);
    expect(result.current.draft?.thumbnailUrl).toBe("data:image/jpeg;base64,newpreview");
    expect(result.current.draft?.hasCustomTemplate).toBe(true);
  });

  it("discards stale async response when switching playlists rapidly", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);

    let resolveFirst: (val: any) => void = () => {};
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond: (val: any) => void = () => {};
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockImplementation((plId: string) => {
      if (plId === "pl-slow") return firstPromise as any;
      if (plId === "pl-fast") return secondPromise as any;
      return Promise.resolve({} as any);
    });

    const { result } = renderHook(() => usePlaylistCatalog());

    // Start slow playlist
    act(() => {
      void result.current.selectPlaylist("pl-slow");
    });
    expect(result.current.selectedPlaylistId).toBe("pl-slow");
    expect(result.current.isLoadingDraft).toBe(true);
    expect(result.current.draft).toBeNull();

    // Quickly switch to fast playlist
    act(() => {
      void result.current.selectPlaylist("pl-fast");
    });
    expect(result.current.selectedPlaylistId).toBe("pl-fast");
    expect(result.current.isLoadingDraft).toBe(true);

    // Fast playlist resolves first
    await act(async () => {
      resolveSecond({
        playlistId: "pl-fast",
        title: "Fast Game",
        tag: "FastGame",
        videos: [{ videoId: "v-fast", title: "Fast Ep 1", episode: 1 }],
      });
      await secondPromise;
    });

    expect(result.current.selectedPlaylistId).toBe("pl-fast");
    expect(result.current.draft?.playlistId).toBe("pl-fast");
    expect(result.current.editedTag).toBe("FastGame");
    expect(result.current.isLoadingDraft).toBe(false);

    // Now slow playlist finishes late -> MUST BE DISCARDED
    await act(async () => {
      resolveFirst({
        playlistId: "pl-slow",
        title: "Slow Game",
        tag: "SlowGame",
        videos: [{ videoId: "v-slow", title: "Slow Ep 1", episode: 1 }],
      });
      await firstPromise;
    });

    // Verify it was NOT overwritten by the slow playlist
    expect(result.current.selectedPlaylistId).toBe("pl-fast");
    expect(result.current.draft?.playlistId).toBe("pl-fast");
    expect(result.current.editedTag).toBe("FastGame");
    expect(result.current.draft?.title).toBe("Fast Game");
  });

  it("synchronizes editedTag and new episodes on reloadDraft", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const initialDraft = {
      playlistId: "pl-1",
      title: "Game One",
      tag: "GameOne",
      videos: [{ videoId: "v-1", title: "Ep 1", episode: 1 }],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(initialDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-1");
    });

    expect(result.current.editedTag).toBe("GameOne");

    const refreshedDraft = {
      playlistId: "pl-1",
      title: "Game One",
      tag: "GameOneUpdated",
      videos: [
        { videoId: "v-1", title: "Ep 1", episode: 1 },
        { videoId: "v-2", title: "Ep 2", episode: 2 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(refreshedDraft)
    );

    await act(async () => {
      await result.current.reloadDraft();
    });

    expect(result.current.draft?.tag).toBe("GameOneUpdated");
    expect(result.current.editedEpisodes["v-2"]).toBe(2);
  });

  it("does not silently fall back unassigned episodes to 1 and blocks canApply", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-zero",
      title: "Zero Episodes",
      tag: "zero",
      videos: [
        { videoId: "v-unassigned-1", title: "Video Unassigned 1", episode: 0, existingEpisode: 0 },
        { videoId: "v-unassigned-2", title: "Video Unassigned 2", episode: 0, existingEpisode: 0 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(mockDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-zero");
    });

    expect(result.current.editedEpisodes["v-unassigned-1"]).toBe(0);
    expect(result.current.editedEpisodes["v-unassigned-2"]).toBe(0);
    expect(result.current.hasConflicts).toBe(true);
    expect(result.current.canApply).toBe(false);
  });

  it("synchronizes single video from parsed titleEpisode and updates mismatchCount", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-sync-single",
      title: "Sync Single",
      tag: "sync",
      videos: [
        { videoId: "v-1", title: "Game Ep 05", episode: 0, existingEpisode: 0, titleEpisode: 5 },
        { videoId: "v-2", title: "Game Ep 06", episode: 0, existingEpisode: 0, titleEpisode: 6 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(mockDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-sync-single");
    });

    expect(result.current.mismatchCount).toBe(2);

    act(() => {
      result.current.syncVideoFromTitle("v-1");
    });

    expect(result.current.editedEpisodes["v-1"]).toBe(5);
    expect(result.current.editedEpisodes["v-2"]).toBe(0);
    expect(result.current.mismatchCount).toBe(1);
  });

  it("bulk synchronizes all videos with titleEpisode > 0 via syncAllFromTitle", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-sync-all",
      title: "Sync All",
      tag: "sync",
      videos: [
        { videoId: "v-1", title: "Game Ep 10", episode: 1, existingEpisode: 1, titleEpisode: 10 },
        { videoId: "v-2", title: "Game Ep 11", episode: 2, existingEpisode: 2, titleEpisode: 11 },
        { videoId: "v-no-ep", title: "Game Special Stream", episode: 99, existingEpisode: 99, titleEpisode: 0 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(mockDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-sync-all");
    });

    expect(result.current.mismatchCount).toBe(2);

    act(() => {
      result.current.syncAllFromTitle();
    });

    expect(result.current.editedEpisodes["v-1"]).toBe(10);
    expect(result.current.editedEpisodes["v-2"]).toBe(11);
    expect(result.current.editedEpisodes["v-no-ep"]).toBe(99);
    expect(result.current.mismatchCount).toBe(0);
  });

  it("reactively detects chronology inversions, populates chronologyIssueIds, and blocks canApply", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-chrono",
      title: "Chrono Test",
      tag: "chrono",
      videos: [
        { videoId: "v-1", title: "Part 1", publishedAt: "2026-01-01T10:00:00Z", position: 0, episode: 3 },
        { videoId: "v-2", title: "Part 2", publishedAt: "2026-01-02T10:00:00Z", position: 1, episode: 2 },
        { videoId: "v-3", title: "Part 3", publishedAt: "2026-01-03T10:00:00Z", position: 2, episode: 1 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(mockDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-chrono");
    });

    expect(result.current.hasConflicts).toBe(false);
    expect(result.current.hasChronologyErrors).toBe(true);
    expect(result.current.chronologyIssueIds.has("v-1")).toBe(true);
    expect(result.current.chronologyIssueIds.has("v-2")).toBe(true);
    expect(result.current.chronologyIssueIds.has("v-3")).toBe(true);
    expect(result.current.canApply).toBe(false);

    // Fix chronology inversion
    act(() => {
      result.current.setEpisode("v-1", 1);
      result.current.setEpisode("v-2", 2);
      result.current.setEpisode("v-3", 3);
    });

    expect(result.current.hasChronologyErrors).toBe(false);
    expect(result.current.chronologyIssueIds.size).toBe(0);
    expect(result.current.canApply).toBe(true);
  });

  it("does not flag chronology errors for multiple episodes on the same calendar day", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-same-day",
      title: "Same Day Episodes Test",
      tag: "sameday",
      videos: [
        { videoId: "v-4", title: "Death Stranding 26/10/26 - 4", publishedAt: "2026-10-27T22:44:32Z", sortDate: "2026-10-26", position: 0, episode: 4 },
        { videoId: "v-2", title: "Death Stranding 26/10/26 - 2", publishedAt: "2026-10-28T05:47:57Z", sortDate: "2026-10-26", position: 1, episode: 2 },
        { videoId: "v-3", title: "Death Stranding 26/10/26 - 3", publishedAt: "2026-10-28T02:07:27Z", sortDate: "2026-10-26", position: 2, episode: 3 },
        { videoId: "v-1", title: "Death Stranding 26/10/26 - 1", publishedAt: "2026-10-28T05:47:58Z", sortDate: "2026-10-26", position: 3, episode: 1 },
        { videoId: "v-5", title: "Death Stranding 26/10/26 - 5", publishedAt: "2026-10-28T04:18:41Z", sortDate: "2026-10-26", position: 4, episode: 5 },
        { videoId: "v-6", title: "Death Stranding 27/10/26 - 6", publishedAt: "2026-10-28T22:19:49Z", sortDate: "2026-10-27", position: 5, episode: 6 },
        { videoId: "v-8", title: "Death Stranding 28/10/26 - 8", publishedAt: "2026-10-29T03:53:04Z", sortDate: "2026-10-28", position: 6, episode: 8 },
        { videoId: "v-7", title: "Death Stranding 28/10/26 - 7", publishedAt: "2026-10-29T03:56:39Z", sortDate: "2026-10-28", position: 7, episode: 7 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(mockDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-same-day");
    });

    // Zero chronology errors because all episodes across different days ascend (1..5 on day 1 < 6 on day 2 < 7..8 on day 3)
    expect(result.current.hasChronologyErrors).toBe(false);
    expect(result.current.chronologyIssueIds.size).toBe(0);
    expect(result.current.canApply).toBe(true);
  });

  it("autoNumberByDate orders by sortDate prefix over publishedAt", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-sort-date",
      title: "Sort Date Test",
      tag: "sortdate",
      videos: [
        {
          videoId: "v-late-upload",
          title: "Stream 2026-01-01",
          publishedAt: "2026-05-01T00:00:00Z",
          sortDate: "2026-01-01",
          position: 0,
          episode: 0,
        },
        {
          videoId: "v-early-upload",
          title: "Stream 2026-02-01",
          publishedAt: "2026-02-01T00:00:00Z",
          sortDate: "2026-02-01",
          position: 1,
          episode: 0,
        },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(mockDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-sort-date");
    });

    act(() => {
      result.current.autoNumberByDate();
    });

    expect(result.current.editedEpisodes["v-late-upload"]).toBe(1);
    expect(result.current.editedEpisodes["v-early-upload"]).toBe(2);
    expect(result.current.hasChronologyErrors).toBe(false);
  });

  it("reorderDuplicate resolves duplicate episodes and shifts subsequent episodes", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([]);
    const mockDraft = {
      playlistId: "pl-p3r",
      title: "Persona 3 Reload",
      tag: "p3r",
      videos: [
        { videoId: "v25", title: "P3R - 25", sortDate: "2026-08-09", episode: 25 },
        { videoId: "v26a", title: "P3R - 26 A", sortDate: "2026-08-10", episode: 26 },
        { videoId: "v26b", title: "P3R - 26 B", sortDate: "2026-08-11", episode: 26 },
        { videoId: "v27", title: "P3R - 27", sortDate: "2026-08-12", episode: 27 },
        { videoId: "v28", title: "P3R - 28", sortDate: "2026-08-13", episode: 28 },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(
      backend.PlaylistCatalogDraft.createFrom(mockDraft)
    );

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-p3r");
    });

    expect(result.current.hasConflicts).toBe(true);

    act(() => {
      result.current.reorderDuplicate(26, ["v26a", "v26b"]);
    });

    expect(result.current.editedEpisodes).toEqual({
      v25: 25,
      v26a: 26,
      v26b: 27,
      v27: 28,
      v28: 29,
    });
    expect(result.current.hasConflicts).toBe(false);
    expect(result.current.canApply).toBe(true);
  });
});



