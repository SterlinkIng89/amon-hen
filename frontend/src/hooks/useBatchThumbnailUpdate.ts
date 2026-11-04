import { useState, useRef, useCallback, useEffect } from "react";
import { TagThumbnailConfig, BatchItem, BatchItemStatus } from "../types";
import { useThumbnailAssets } from "./useThumbnailAssets";
import { renderTagThumbnailDataUrl } from "../utils/thumbnailRender";
import {
  SaveCustomThumbnail,
  GetCustomThumbnail,
  UpdateYouTubeThumbnailForEpisode,
} from "../../wailsjs/go/backend/App";
import { notifyCustomThumbChanged } from "./useThumbnailQueue";

export interface BatchThumbnailInputItem {
  readonly videoId: string;
  readonly episode: number;
  readonly cacheKey: string;
  readonly localFile?: string;
  readonly thumbnailUpdatedAt?: number;
  readonly thumbnailEpisode?: number;
}

export interface UseBatchThumbnailUpdateArgs {
  readonly playlistId?: string;
  readonly tag: string;
  readonly config?: TagThumbnailConfig;
  readonly items: readonly BatchThumbnailInputItem[];
  readonly onVideoUpdated?: (videoId: string, newThumbUrl: string, thumbnailEpisode?: number) => void;
  readonly onCompleted?: () => void;
}

export interface UseBatchThumbnailUpdateResult {
  readonly items: readonly BatchItem[];
  readonly running: boolean;
  readonly isAssetsReady: boolean;
  readonly estimatedQuota: number;
  readonly start: () => Promise<void>;
  readonly startSelected: (videoIds: readonly string[]) => Promise<void>;
  readonly startUnsynced: (maxCount?: number) => Promise<void>;
  readonly updateSingle: (videoId: string) => Promise<void>;
  readonly retryFailed: () => Promise<void>;
  readonly cancel: () => void;
}

const DEFAULT_BATCH_CONFIG: TagThumbnailConfig = {
  enabled: true,
  source_type: "steam",
  steam_asset_type: "header",
  episode_position: "bottom-left",
  episode_format: "pad2",
};

async function persistAndNotifyThumbnail(key: string, dataUrl: string): Promise<string> {
  const savedPath = await SaveCustomThumbnail(key, dataUrl);
  try {
    const url = await GetCustomThumbnail(key);
    notifyCustomThumbChanged(key, url || null);
  } catch {
    notifyCustomThumbChanged(key, savedPath);
  }
  return savedPath;
}

function toPendingBatchItem(item: BatchThumbnailInputItem): BatchItem {
  return {
    videoId: item.videoId,
    episode: item.episode,
    cacheKey: item.cacheKey,
    localFile: item.localFile,
    thumbnailUpdatedAt: item.thumbnailUpdatedAt,
    thumbnailEpisode: item.thumbnailEpisode,
    status: "pending",
  };
}

export function useBatchThumbnailUpdate({
  playlistId,
  tag,
  config,
  items: inputItems,
  onVideoUpdated,
  onCompleted,
}: UseBatchThumbnailUpdateArgs): UseBatchThumbnailUpdateResult {
  const effectiveConfig: TagThumbnailConfig = config ?? DEFAULT_BATCH_CONFIG;

  const [batchItems, setBatchItems] = useState<BatchItem[]>(() =>
    inputItems.map(toPendingBatchItem)
  );

  const [running, setRunning] = useState(false);
  const cancelRequestedRef = useRef(false);
  const runIdRef = useRef(0);

  const batchItemsRef = useRef(batchItems);
  useEffect(() => {
    batchItemsRef.current = batchItems;
  }, [batchItems]);

  const prevTagRef = useRef(tag);
  const prevPlaylistIdRef = useRef(playlistId);

  useEffect(() => {
    const tagChanged = prevTagRef.current !== tag;
    const playlistChanged = prevPlaylistIdRef.current !== playlistId;

    if (tagChanged || playlistChanged) {
      prevTagRef.current = tag;
      prevPlaylistIdRef.current = playlistId;

      runIdRef.current++;
      cancelRequestedRef.current = true;
      setRunning(false);

      setBatchItems(inputItems.map(toPendingBatchItem));
    }
  }, [tag, playlistId, inputItems]);

  // Clean up on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      runIdRef.current++;
      cancelRequestedRef.current = true;
    };
  }, []);

  // Sync batchItems when inputItems change if not currently running
  useEffect(() => {
    if (!running) {
      setBatchItems((prev) => {
        const prevMap = new Map(prev.map((p) => [p.videoId, p]));
        return inputItems.map((item) => {
          const existing = prevMap.get(item.videoId);
          const inputTs = item.thumbnailUpdatedAt ?? 0;
          const existingTs = existing?.thumbnailUpdatedAt ?? 0;
          const latestUpdatedAt = Math.max(inputTs, existingTs);
          const thumbnailEpisode = item.thumbnailEpisode ?? existing?.thumbnailEpisode;

          const status = existing ? existing.status : "pending";
          return {
            ...(existing || {}),
            videoId: item.videoId,
            episode: item.episode,
            cacheKey: item.cacheKey,
            localFile: item.localFile,
            thumbnailUpdatedAt: latestUpdatedAt > 0 ? latestUpdatedAt : undefined,
            thumbnailEpisode,
            status,
          };
        });
      });
    }
  }, [inputItems, running]);

  const { baseImage, logoImage, gameTitle, loadingAssets } = useThumbnailAssets(
    tag,
    effectiveConfig
  );

  const isAssetsReady = !loadingAssets && Boolean(baseImage);

  const updateItemStatus = useCallback(
    (
      videoId: string,
      status: BatchItemStatus,
      error?: string,
      thumbnailUpdatedAt?: number,
      thumbnailEpisode?: number
    ) => {
      setBatchItems((prev) =>
        prev.map((item) =>
          item.videoId === videoId
            ? {
                ...item,
                status,
                error,
                ...(thumbnailUpdatedAt !== undefined ? { thumbnailUpdatedAt } : {}),
                ...(thumbnailEpisode !== undefined ? { thumbnailEpisode } : {}),
              }
            : item
        )
      );
    },
    []
  );

  const processQueue = useCallback(
    async (targetVideoIds: readonly string[]) => {
      if (running || !isAssetsReady || targetVideoIds.length === 0) return;

      const currentRunId = ++runIdRef.current;
      setRunning(true);
      cancelRequestedRef.current = false;

      let quotaExceeded = false;

      for (let i = 0; i < targetVideoIds.length; i++) {
        const videoId = targetVideoIds[i];

        if (runIdRef.current !== currentRunId) {
          return;
        }

        if (cancelRequestedRef.current || quotaExceeded) {
          updateItemStatus(videoId, "skipped");
          continue;
        }

        const item = batchItemsRef.current.find((b) => b.videoId === videoId);
        if (!item) {
          continue;
        }

        updateItemStatus(videoId, "rendering");

        try {
          const dataUrl = renderTagThumbnailDataUrl({
            baseImage,
            logoImage,
            gameTitle,
            episodeNumber: item.episode,
            config: effectiveConfig,
          });

          if (runIdRef.current !== currentRunId) {
            return;
          }

          updateItemStatus(videoId, "uploading");

          const savedPath = await persistAndNotifyThumbnail(item.cacheKey, dataUrl);
          if (runIdRef.current !== currentRunId) {
            return;
          }

          if (item.localFile) {
            await persistAndNotifyThumbnail(item.localFile, dataUrl).catch(() => {});
            if (runIdRef.current !== currentRunId) {
              return;
            }
          }

          const ytKey = `yt:${item.videoId}`;
          if (item.cacheKey !== ytKey) {
            await persistAndNotifyThumbnail(ytKey, dataUrl).catch(() => {});
            if (runIdRef.current !== currentRunId) {
              return;
            }
          }

          const newThumbUrl = await UpdateYouTubeThumbnailForEpisode(
            item.videoId,
            savedPath,
            item.episode
          );
          if (runIdRef.current !== currentRunId) {
            return;
          }

          updateItemStatus(
            videoId,
            "done",
            undefined,
            Math.floor(Date.now() / 1000),
            item.episode
          );
          onVideoUpdated?.(item.videoId, newThumbUrl, item.episode);
        } catch (err: unknown) {
          if (runIdRef.current !== currentRunId) {
            return;
          }

          const msg = err instanceof Error ? err.message : String(err);
          updateItemStatus(videoId, "failed", msg);

          if (msg.toLowerCase().includes("quota")) {
            quotaExceeded = true;
          }
        }
      }

      if (runIdRef.current === currentRunId) {
        setRunning(false);
        onCompleted?.();
      }
    },
    [
      running,
      isAssetsReady,
      updateItemStatus,
      baseImage,
      logoImage,
      gameTitle,
      effectiveConfig,
      onVideoUpdated,
      onCompleted,
    ]
  );

  const start = useCallback(async () => {
    const allVideoIds = batchItems.map((item) => item.videoId);
    await processQueue(allVideoIds);
  }, [batchItems, processQueue]);

  const startSelected = useCallback(
    async (videoIds: readonly string[]) => {
      const selectedSet = new Set(videoIds);
      const targetVideoIds = batchItems
        .filter((item) => selectedSet.has(item.videoId))
        .map((item) => item.videoId);
      await processQueue(targetVideoIds);
    },
    [batchItems, processQueue]
  );

  const startUnsynced = useCallback(
    async (maxCount?: number) => {
      let unsyncedItems = batchItems.filter(
        (item) =>
          (!item.thumbnailUpdatedAt || item.thumbnailUpdatedAt <= 0) &&
          item.status !== "done"
      );

      if (typeof maxCount === "number" && maxCount > 0) {
        unsyncedItems = unsyncedItems.slice(0, maxCount);
      }

      await processQueue(unsyncedItems.map((item) => item.videoId));
    },
    [batchItems, processQueue]
  );

  const updateSingle = useCallback(
    async (videoId: string) => {
      const itemExists = batchItems.some((item) => item.videoId === videoId);
      if (itemExists) {
        await processQueue([videoId]);
      }
    },
    [batchItems, processQueue]
  );

  const retryFailed = useCallback(async () => {
    const failedVideoIds = batchItems
      .filter((item) => item.status === "failed")
      .map((item) => item.videoId);
    await processQueue(failedVideoIds);
  }, [batchItems, processQueue]);

  const cancel = useCallback(() => {
    cancelRequestedRef.current = true;
  }, []);

  return {
    items: batchItems,
    running,
    isAssetsReady,
    estimatedQuota: batchItems.length * 50,
    start,
    startSelected,
    startUnsynced,
    updateSingle,
    retryFailed,
    cancel,
  };
}
