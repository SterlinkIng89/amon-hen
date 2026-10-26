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
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [decodingImage, setDecodingImage] = useState(false);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);

  // Fetch Steam assets whenever tag changes
  useEffect(() => {
    if (!tag) {
      setSteamAssets(null);
      setFetchingMetadata(false);
      setBaseImage(null);
      setLogoImage(null);
      return;
    }
    let isCancelled = false;
    setFetchingMetadata(true);
    setBaseImage(null);
    setLogoImage(null);

    GetSteamAppID(tag)
      .then((appId) => {
        if (isCancelled) return null;
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
        if (!isCancelled) {
          setSteamAssets(null);
        }
      })
      .finally(() => {
        if (!isCancelled) setFetchingMetadata(false);
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
    setBaseImage(null);
    if (!resolvedImageUrl) {
      setDecodingImage(false);
      return;
    }

    let isCancelled = false;
    setDecodingImage(true);

    const loadImageElement = (url: string): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });

    (async () => {
      let img = await loadImageElement(resolvedImageUrl);
      const headerUrl = steamAssets?.headerUrl;
      const canFallbackToHeader =
        config?.source_type !== "custom" &&
        Boolean(headerUrl) &&
        headerUrl !== resolvedImageUrl;

      if (!img && canFallbackToHeader && headerUrl) {
        img = await loadImageElement(headerUrl);
      }

      if (!isCancelled) {
        setBaseImage(img);
        setDecodingImage(false);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [resolvedImageUrl, tag, config?.source_type, steamAssets?.headerUrl]);

  // Preload logo image element for canvas
  const logoUrl = steamAssets?.logoUrl;
  useEffect(() => {
    setLogoImage(null);
    if (!logoUrl) {
      return;
    }
    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!isCancelled) setLogoImage(img);
    };
    img.onerror = () => {
      if (!isCancelled) setLogoImage(null);
    };
    img.src = logoUrl;
    return () => {
      isCancelled = true;
    };
  }, [logoUrl]);

  return {
    steamAssets,
    loadingAssets: fetchingMetadata || decodingImage,
    baseImage,
    logoImage,
    gameTitle: steamAssets?.title || tag || "",
  };
}
