import { useState, useEffect } from "react";
import {
  getCachedCustomThumb,
  setCachedCustomThumb,
  subscribeCustomThumb,
  enqueueCustomThumb,
} from "./useThumbnailQueue";
import { GetCustomThumbnail } from "../../wailsjs/go/backend/App";

export function useCustomThumbnail(
  localPath: string,
  enabled: boolean,
  fallbackKey?: string,
): string | null {
  const [customThumb, setCustomThumb] = useState<string | null>(() => {
    if (localPath) {
      const cached = getCachedCustomThumb(localPath);
      if (cached !== undefined) return cached;
    }
    if (fallbackKey) {
      const cachedFallback = getCachedCustomThumb(fallbackKey);
      if (cachedFallback !== undefined) return cachedFallback;
    }
    return null;
  });

  useEffect(() => {
    if (!enabled) return;
    if (!localPath && !fallbackKey) return;

    let active = true;

    async function resolveKey(key: string): Promise<string | null> {
      const cached = getCachedCustomThumb(key);
      if (cached !== undefined) return cached;
      try {
        const url = await enqueueCustomThumb(() => GetCustomThumbnail(key));
        const finalUrl = url || null;
        setCachedCustomThumb(key, finalUrl);
        return finalUrl;
      } catch {
        setCachedCustomThumb(key, null);
        return null;
      }
    }

    async function loadThumb() {
      if (localPath) {
        const primary = await resolveKey(localPath);
        if (primary) {
          if (active) setCustomThumb(primary);
          return;
        }
      }

      if (fallbackKey) {
        const fallback = await resolveKey(fallbackKey);
        if (active) setCustomThumb(fallback);
      } else if (active) {
        setCustomThumb(null);
      }
    }

    void loadThumb();

    return () => {
      active = false;
    };
  }, [enabled, localPath, fallbackKey]);

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    if (localPath) {
      unsubscribers.push(
        subscribeCustomThumb(localPath, (newUrl) => {
          if (newUrl !== null) {
            setCustomThumb(newUrl);
          } else if (fallbackKey) {
            const fbCached = getCachedCustomThumb(fallbackKey);
            setCustomThumb(fbCached ?? null);
          } else {
            setCustomThumb(null);
          }
        })
      );
    }

    if (fallbackKey) {
      unsubscribers.push(
        subscribeCustomThumb(fallbackKey, (newUrl) => {
          // Only update if primary localPath does not have a positive hit
          const primary = localPath ? getCachedCustomThumb(localPath) : null;
          if (!primary) {
            setCustomThumb(newUrl);
          }
        })
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [localPath, fallbackKey]);

  return customThumb;
}
