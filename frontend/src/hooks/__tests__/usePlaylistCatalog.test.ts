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
      assignments: [{ videoId: "yt-1", episode: 1 }],
    });
    expect(result.current.applySuccess).toBe(true);
  });
});
