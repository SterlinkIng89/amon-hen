import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePlaylistCatalog } from "../usePlaylistCatalog";
import * as AppBindings from "../../../wailsjs/go/backend/App";

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

  it("numbers episodes by playlist order and supports reverseEpisodes", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValueOnce([]);
    const mockDraft = {
      playlistId: "pl-3",
      title: "Reversed Series",
      videoCount: 3,
      kind: "vod",
      tag: "series",
      tagConfidence: "high",
      linked: false,
      steamAppId: "",
      needsSync: false,
      videos: [
        { videoId: "v-first", title: "Ep A", position: 0, episode: 10, existingEpisode: 0, conflict: false },
        { videoId: "v-second", title: "Ep B", position: 1, episode: 20, existingEpisode: 0, conflict: false },
        { videoId: "v-third", title: "Ep C", position: 2, episode: 30, existingEpisode: 0, conflict: false },
      ],
    };
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValueOnce(mockDraft as any);

    const { result } = renderHook(() => usePlaylistCatalog());

    await act(async () => {
      await result.current.selectPlaylist("pl-3");
    });

    act(() => {
      result.current.autoNumberByOrder();
    });

    expect(result.current.editedEpisodes).toEqual({
      "v-first": 1,
      "v-second": 2,
      "v-third": 3,
    });

    // Reverse the sequence
    act(() => {
      result.current.reverseEpisodes();
    });

    expect(result.current.editedEpisodes).toEqual({
      "v-first": 3,
      "v-second": 2,
      "v-third": 1,
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
});

