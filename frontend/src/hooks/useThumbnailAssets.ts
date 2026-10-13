import { useState, useEffect, useMemo } from "react";
import { TagThumbnailConfig, SteamGameArtwork } from "../types";
import {
  GetSteamAppID,
  GetSteamGameAssets,
} from "../../wailsjs/go/backend/App";
import { resolveThumbnailImageUrl } from "../utils/thumbnailGenerator";

export interface ThumbnailAssetsResult {
  readonly steamAssets: SteamGameArtwork | null;
  readonly loadingAssets: boolean;
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage: HTMLImageElement | null;
  readonly gameTitle: string;
}

export function useThumbnailAssets(
  tag: string,
  config?: TagThumbnailConfig
): ThumbnailAssetsResult {
  const [steamAssets, setSteamAssets] = useState<SteamGameArtwork | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);

  // Fetch Steam assets whenever tag changes
  useEffect(() => {
    if (!tag) {
      setSteamAssets(null);
      return;
    }
    let isCancelled = false;
    setLoadingAssets(true);

    GetSteamAppID(tag)
      .then((appId) => {
        if (isCancelled) return;
        if (appId && appId !== "NOT_FOUND") {
          return GetSteamGameAssets(appId);
        }
        return null;
      })
      .then((assets) => {
        if (!isCancelled && assets) {
          setSteamAssets(assets);
        }
      })
      .catch((err) => {
        console.error("Failed to load Steam assets for tag:", tag, err);
      })
      .finally(() => {
        if (!isCancelled) setLoadingAssets(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [tag]);

  const resolvedImageUrl = useMemo(() => {
    return resolveThumbnailImageUrl(
      config?.source_type ?? "steam",
      config?.custom_image_path,
      config?.steam_asset_type ?? "header",
      steamAssets
    );
  }, [
    config?.source_type,
    config?.custom_image_path,
    config?.steam_asset_type,
    steamAssets,
  ]);

  // Preload base image element for canvas
  useEffect(() => {
    if (!resolvedImageUrl) {
      setBaseImage(null);
      return;
    }
    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = resolvedImageUrl;
    img.onload = () => {
      if (!isCancelled) setBaseImage(img);
    };
    img.onerror = () => {
      if (!isCancelled) setBaseImage(null);
    };
    return () => {
      isCancelled = true;
    };
  }, [resolvedImageUrl]);

  // Preload logo image element for canvas
  const logoUrl = steamAssets?.logoUrl;
  useEffect(() => {
    if (!logoUrl) {
      setLogoImage(null);
      return;
    }
    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoUrl;
    img.onload = () => {
      if (!isCancelled) setLogoImage(img);
    };
    img.onerror = () => {
      if (!isCancelled) setLogoImage(null);
    };
    return () => {
      isCancelled = true;
    };
  }, [logoUrl]);

  return {
    steamAssets,
    loadingAssets,
    baseImage,
    logoImage,
    gameTitle: steamAssets?.title || tag || "",
  };
}
