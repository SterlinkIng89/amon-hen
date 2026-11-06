import { useState, useEffect, useCallback } from "react";
import { GetSteamAppID } from "../../wailsjs/go/backend/App";
import { clearTagThumbnailAssetCache } from "../utils/generateTagThumbnail";

export interface SteamAppBinding {
  readonly appId: string | null;
  readonly isLoading: boolean;
  readonly setBound: (appId: string | null) => void;
}

const normalizeAppId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed && trimmed !== "NOT_FOUND" && trimmed !== "0" ? trimmed : null;
};

/**
 * Resolves the Steam AppID bound to a tag and exposes a setter that also
 * invalidates the shared thumbnail asset cache so stale artwork is not reused.
 */
export function useSteamAppBinding(tag: string): SteamAppBinding {
  const [appId, setAppId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(tag));

  useEffect(() => {
    const trimmed = tag.trim();
    if (!trimmed) {
      setAppId(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    GetSteamAppID(trimmed)
      .then((id) => {
        if (active) setAppId(normalizeAppId(id));
      })
      .catch(() => {
        if (active) setAppId(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tag]);

  const setBound = useCallback((next: string | null) => {
    setAppId(next);
    clearTagThumbnailAssetCache();
  }, []);

  return { appId, isLoading, setBound };
}
