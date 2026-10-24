import { ElementLayout, TagPlaylistConfig, TagThumbnailConfig } from "../types";

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

  const clampNum = (val: unknown, min: number, max: number, def: number): number => {
    const num = typeof val === "number" ? val : typeof val === "string" ? parseFloat(val) : NaN;
    return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : def;
  };

  const rawFraming = raw.image_framing;
  let framing: TagThumbnailConfig["image_framing"];
  if (rawFraming && typeof rawFraming === "object") {
    framing = {
      offset_x: clampNum(rawFraming.offset_x, 0, 1, 0.5),
      offset_y: clampNum(rawFraming.offset_y, 0, 1, 0.5),
      zoom: clampNum(rawFraming.zoom, 1, 3, 1),
    };
  }

  const parseLayout = (l: unknown): ElementLayout | undefined => {
    if (!l || typeof l !== "object") return undefined;
    const obj = l as Record<string, unknown>;
    return {
      x: clampNum(obj.x, 0, 1, 0.5),
      y: clampNum(obj.y, 0, 1, 0.5),
      scale: clampNum(obj.scale, 0.25, 3, 1),
    };
  };

  const episodeLayout = parseLayout(raw.episode_layout);

  let logo: TagThumbnailConfig["logo"];
  if (raw.logo && typeof raw.logo === "object") {
    const layout = parseLayout(raw.logo);
    if (layout) {
      logo = {
        ...layout,
        enabled: Boolean(raw.logo.enabled),
      };
    }
  }

  let title: TagThumbnailConfig["title"];
  if (raw.title && typeof raw.title === "object") {
    const layout = parseLayout(raw.title);
    if (layout) {
      title = {
        ...layout,
        enabled: Boolean(raw.title.enabled),
        text_override: typeof raw.title.text_override === "string" ? raw.title.text_override : undefined,
        color: typeof raw.title.color === "string" ? raw.title.color : undefined,
      };
    }
  }

  return {
    enabled: isCustomized,
    source_type: sourceType,
    steam_asset_type: assetType,
    custom_image_path: raw.custom_image_path,
    episode_position: raw.episode_position || "bottom-left",
    episode_format: raw.episode_format || "pad2",
    font_color: raw.font_color,
    image_framing: framing,
    episode_layout: episodeLayout,
    logo,
    title,
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
