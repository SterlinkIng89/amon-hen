import { TagPlaylistConfig, TagThumbnailConfig } from "../types";

export function parseTagThumbnailConfig(raw?: any): TagThumbnailConfig | undefined {
  if (!raw) return undefined;
  const isCustomized = Boolean(
    raw.enabled ||
    raw.custom_image_path ||
    raw.steam_asset_type ||
    (raw.source_type && raw.source_type === "custom")
  );
  const sourceType =
    raw.source_type === "custom" || raw.source_type === "steam"
      ? raw.source_type
      : "steam";
  const assetType =
    raw.steam_asset_type === "hero" ||
    raw.steam_asset_type === "header" ||
    raw.steam_asset_type === "poster"
      ? raw.steam_asset_type
      : undefined;

  return {
    enabled: isCustomized,
    source_type: sourceType,
    steam_asset_type: assetType,
    custom_image_path: raw.custom_image_path,
    episode_position: raw.episode_position || "bottom-right",
    episode_format: raw.episode_format || "pad2",
    font_color: raw.font_color,
  };
}

export function parseTagPlaylistConfig(
  raw?: any,
  legacyVod?: string,
): TagPlaylistConfig {
  let vod = "";
  let clip = "";
  if (raw?.vod_playlist_id && raw.vod_playlist_id !== "none") {
    vod = raw.vod_playlist_id;
  } else if (legacyVod && legacyVod !== "none") {
    vod = legacyVod;
  }
  if (raw?.clip_playlist_id && raw.clip_playlist_id !== "none") {
    clip = raw.clip_playlist_id;
  }
  return {
    vod_playlist_id: vod,
    clip_playlist_id: clip,
    thumbnail_config: parseTagThumbnailConfig(raw?.thumbnail_config),
  };
}

export function parseTagPlaylistConfigs(
  rawConfigs: Record<string, any> = {},
  legacyPlaylists: Record<string, string> = {},
): Record<string, TagPlaylistConfig> {
  const result: Record<string, TagPlaylistConfig> = {};
  const allKeys = new Set([
    ...Object.keys(rawConfigs),
    ...Object.keys(legacyPlaylists),
  ]);
  for (const key of allKeys) {
    result[key] = parseTagPlaylistConfig(rawConfigs[key], legacyPlaylists[key]);
  }
  return result;
}
