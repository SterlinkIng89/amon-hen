import { describe, it, expect } from "vitest";
import {
  parseTagThumbnailConfig,
  parseTagPlaylistConfig,
  parseTagPlaylistConfigs,
} from "../tagConfigParser";

describe("tagConfigParser", () => {
  it("returns undefined when raw thumbnail config is missing", () => {
    expect(parseTagThumbnailConfig(undefined)).toBeUndefined();
    expect(parseTagThumbnailConfig(null)).toBeUndefined();
  });

  it("parses customized thumbnail config with auto-enabled detection", () => {
    const raw = {
      source_type: "custom",
      custom_image_path: "C:/images/test.png",
      episode_position: "top-left",
      episode_format: "ep",
      font_color: "#ff0000",
    };
    const parsed = parseTagThumbnailConfig(raw);
    expect(parsed).toEqual({
      enabled: true,
      source_type: "custom",
      steam_asset_type: undefined,
      custom_image_path: "C:/images/test.png",
      episode_position: "top-left",
      episode_format: "ep",
      font_color: "#ff0000",
    });
  });

  it("parses single tag playlist config falling back to legacy vod", () => {
    const parsed = parseTagPlaylistConfig(
      { clip_playlist_id: "pl-clip" },
      "pl-legacy-vod",
    );
    expect(parsed.vod_playlist_id).toBe("pl-legacy-vod");
    expect(parsed.clip_playlist_id).toBe("pl-clip");
  });

  it("ignores 'none' playlist IDs", () => {
    const parsed = parseTagPlaylistConfig(
      { vod_playlist_id: "none", clip_playlist_id: "none" },
      "none",
    );
    expect(parsed.vod_playlist_id).toBe("");
    expect(parsed.clip_playlist_id).toBe("");
  });

  it("parses multiple tag playlist configs merged with legacy playlists", () => {
    const rawConfigs = {
      Valorant: { vod_playlist_id: "pl-v1", clip_playlist_id: "pl-v2" },
    };
    const legacy = {
      Minecraft: "pl-m1",
    };
    const all = parseTagPlaylistConfigs(rawConfigs, legacy);
    expect(all["Valorant"].vod_playlist_id).toBe("pl-v1");
    expect(all["Valorant"].clip_playlist_id).toBe("pl-v2");
    expect(all["Minecraft"].vod_playlist_id).toBe("pl-m1");
  });

  describe("image_framing parsing", () => {
    it("leaves image_framing undefined for legacy configs", () => {
      const parsed = parseTagThumbnailConfig({
        source_type: "steam",
        episode_position: "bottom-right",
      });
      expect(parsed?.image_framing).toBeUndefined();
    });

    it("parses and clamps valid image_framing", () => {
      const parsed = parseTagThumbnailConfig({
        enabled: true,
        source_type: "steam",
        image_framing: {
          offset_x: -0.2,
          offset_y: 1.5,
          zoom: 4,
        },
      });
      expect(parsed?.image_framing).toEqual({
        offset_x: 0,
        offset_y: 1,
        zoom: 3,
      });
    });

    it("ignores non-object or invalid image_framing", () => {
      const parsed = parseTagThumbnailConfig({
        enabled: true,
        source_type: "steam",
        image_framing: "invalid",
      });
      expect(parsed?.image_framing).toBeUndefined();
    });
  });
});
