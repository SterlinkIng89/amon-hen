import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTagConfigs } from "../useTagConfigs";
import * as appBackend from "../../../wailsjs/go/backend/App";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetAllGameTags: vi.fn(),
  LoadConfig: vi.fn(),
}));

describe("useTagConfigs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads tags and configurations correctly", async () => {
    vi.mocked(appBackend.GetAllGameTags).mockResolvedValue(["Valorant", "Minecraft"]);
    vi.mocked(appBackend.LoadConfig).mockResolvedValue({
      tag_playlists: { Valorant: "pl-vod" },
      tag_playlist_configs: {
        Valorant: {
          vod_playlist_id: "pl-vod",
          clip_playlist_id: "pl-clip",
          thumbnail_config: {
            enabled: true,
            source_type: "steam",
            episode_position: "bottom-right",
            episode_format: "pad2",
          },
        },
      },
    } as any);

    const { result } = renderHook(() => useTagConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.allTags).toEqual(["Valorant", "Minecraft"]);
    expect(result.current.legacyPlaylists).toEqual({ Valorant: "pl-vod" });
    expect(result.current.configs["Valorant"]?.vod_playlist_id).toBe("pl-vod");
    expect(result.current.configs["Valorant"]?.clip_playlist_id).toBe("pl-clip");
    expect(result.current.configs["Valorant"]?.thumbnail_config?.enabled).toBe(true);
  });

  it("reloads data when reload is invoked", async () => {
    vi.mocked(appBackend.GetAllGameTags).mockResolvedValueOnce(["Game1"]);
    vi.mocked(appBackend.LoadConfig).mockResolvedValueOnce({
      tag_playlists: {},
      tag_playlist_configs: {},
    } as any);

    const { result } = renderHook(() => useTagConfigs());

    await waitFor(() => {
      expect(result.current.allTags).toEqual(["Game1"]);
    });

    vi.mocked(appBackend.GetAllGameTags).mockResolvedValueOnce(["Game1", "Game2"]);
    vi.mocked(appBackend.LoadConfig).mockResolvedValueOnce({
      tag_playlists: { Game2: "pl-2" },
      tag_playlist_configs: {},
    } as any);

    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.allTags).toEqual(["Game1", "Game2"]);
      expect(result.current.legacyPlaylists).toEqual({ Game2: "pl-2" });
    });
  });
});
