import { TagThumbnailConfig, SteamGameArtwork } from "../types";
import {
  GetCustomThumbnail,
  SaveCustomThumbnail,
  GetSteamAppID,
  GetSteamGameAssets,
  GetTagPlaylistConfig,
} from "../../wailsjs/go/backend/App";
import { parseTagThumbnailConfig } from "./tagConfigParser";
import { resolveThumbnailImageUrl } from "./thumbnailGenerator";
import { renderTagThumbnailDataUrl } from "./thumbnailRender";
import { notifyCustomThumbChanged } from "../hooks/useThumbnailQueue";

export interface GenerateTagThumbnailParams {
  readonly videoPath: string;
  readonly tag: string;
  readonly episodeNumber?: number;
  readonly config?: TagThumbnailConfig;
  readonly overwrite?: boolean;
}

export interface TagAssetCacheItem {
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage: HTMLImageElement | null;
  readonly gameTitle: string;
}

const assetCache = new Map<string, Promise<TagAssetCacheItem>>();

export function clearTagThumbnailAssetCache(): void {
  assetCache.clear();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(img);
      }
    }, 300);

    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(null);
      }
    };
    img.src = src;
  });
}

export async function getTagThumbnailAssets(
  tag: string,
  config?: TagThumbnailConfig,
): Promise<TagAssetCacheItem> {
  const cleanTag = tag.trim();
  if (!cleanTag) {
    return { baseImage: null, logoImage: null, gameTitle: "" };
  }

  const effectiveConfig: TagThumbnailConfig = config ?? {
    enabled: true,
    source_type: "steam",
    steam_asset_type: "header",
    episode_position: "bottom-right",
    episode_format: "pad2",
  };

  const cacheKey = `${cleanTag.toLowerCase()}_${effectiveConfig.source_type}_${effectiveConfig.steam_asset_type || "header"}_${effectiveConfig.custom_image_path || ""}`;
  const cached = assetCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<TagAssetCacheItem> => {
    let steamAssets: SteamGameArtwork | null = null;
    let gameTitle = cleanTag;

    if (effectiveConfig.source_type !== "custom") {
      try {
        const appId = await GetSteamAppID(cleanTag);
        if (appId && appId !== "NOT_FOUND") {
          const assets = await GetSteamGameAssets(appId);
          if (assets) {
            steamAssets = assets;
            if (assets.title) gameTitle = assets.title;
          }
        }
      } catch (err) {
        console.error("Failed to fetch Steam assets for tag:", cleanTag, err);
      }
    }

    const resolvedImageUrl = resolveThumbnailImageUrl(
      effectiveConfig.source_type ?? "steam",
      effectiveConfig.custom_image_path,
      effectiveConfig.steam_asset_type ?? "header",
      steamAssets,
    );

    const baseImage = await loadImage(resolvedImageUrl);
    const logoUrl = steamAssets?.logoUrl;
    const logoImage = logoUrl ? await loadImage(logoUrl) : null;

    return { baseImage, logoImage, gameTitle };
  })();

  assetCache.set(cacheKey, promise);
  return promise;
}

export async function generateAndSaveTagThumbnail({
  videoPath,
  tag,
  episodeNumber = 1,
  config,
  overwrite = false,
}: GenerateTagThumbnailParams): Promise<string | null> {
  const cleanTag = tag.trim();
  if (!videoPath || !cleanTag) {
    return null;
  }

  if (!overwrite) {
    try {
      const existing = await GetCustomThumbnail(videoPath);
      if (existing) {
        return existing;
      }
    } catch {
      // Continue to generation
    }
  }

  let effectiveConfig = config;
  if (!effectiveConfig) {
    try {
      const rawCfg = await GetTagPlaylistConfig(cleanTag);
      effectiveConfig = parseTagThumbnailConfig(rawCfg?.thumbnail_config);
    } catch {
      // fallback
    }
  }

  if (!effectiveConfig) {
    effectiveConfig = {
      enabled: true,
      source_type: "steam",
      steam_asset_type: "header",
      episode_position: "bottom-right",
      episode_format: "pad2",
    };
  }

  if (effectiveConfig.enabled === false) {
    return null;
  }

  const { baseImage, logoImage, gameTitle } = await getTagThumbnailAssets(
    cleanTag,
    effectiveConfig,
  );

  const ep =
    typeof episodeNumber === "number" && episodeNumber > 0 ? episodeNumber : 0;
  const dataUrl = renderTagThumbnailDataUrl({
    baseImage,
    logoImage,
    gameTitle,
    episodeNumber: ep,
    config: effectiveConfig,
  });

  const savedPath = await SaveCustomThumbnail(videoPath, dataUrl);
  let finalUrl: string | null = null;
  try {
    finalUrl = await GetCustomThumbnail(videoPath);
    notifyCustomThumbChanged(videoPath, finalUrl || null);
  } catch {
    notifyCustomThumbChanged(videoPath, savedPath);
  }

  return finalUrl || savedPath;
}
