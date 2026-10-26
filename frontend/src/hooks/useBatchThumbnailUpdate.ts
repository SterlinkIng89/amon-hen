import { useState, useRef, useCallback, useEffect } from "react";
import { TagThumbnailConfig, BatchItem, BatchItemStatus } from "../types";
import { useThumbnailAssets } from "./useThumbnailAssets";
import { renderTagThumbnailDataUrl } from "../utils/thumbnailRender";
import {
  SaveCustomThumbnail,
  GetCustomThumbnail,
  UpdateYouTubeThumbnail,
} from "../../wailsjs/go/backend/App";
import { notifyCustomThumbChanged } from "./useThumbnailQueue";

export interface BatchThumbnailInputItem {
  readonly videoId: string;
  readonly episode: number;
  readonly cacheKey: string;
  readonly localFile?: string;
  readonly thumbnailUpdatedAt?: number;
}

export interface UseBatchThumbnailUpdateArgs {
  readonly tag: string;
  readonly config?: TagThumbnailConfig;
  readonly items: readonly BatchThumbnailInputItem[];
  readonly onVideoUpdated?: (videoId: string, newThumbUrl: string) => void;
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

export function useBatchThumbnailUpdate({
  tag,
  config,
  items: inputItems,
  onVideoUpdated,
  onCompleted,
}: UseBatchThumbnailUpdateArgs): UseBatchThumbnailUpdateResult {
  const effectiveConfig: TagThumbnailConfig = config ?? DEFAULT_BATCH_CONFIG;

  const [batchItems, setBatchItems] = useState<BatchItem[]>(() =>
    inputItems.map((item) => ({
      videoId: item.videoId,
      episode: item.episode,
      cacheKey: item.cacheKey,
      localFile: item.localFile,
      thumbnailUpdatedAt: item.thumbnailUpdatedAt,
      status: "pending",
    }))
  );

  const [running, setRunning] = useState(false);
  const cancelRequestedRef = useRef(false);

  const batchItemsRef = useRef(batchItems);
  useEffect(() => {
    batchItemsRef.current = batchItems;
  }, [batchItems]);

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

          const status = existing ? existing.status : "pending";
          return {
            ...(existing || {}),
            videoId: item.videoId,
            episode: item.episode,
            cacheKey: item.cacheKey,
            localFile: item.localFile,
            thumbnailUpdatedAt: latestUpdatedAt > 0 ? latestUpdatedAt : undefined,
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

  const updateItemStatus = (
    index: number,
    status: BatchItemStatus,
    error?: string,
    thumbnailUpdatedAt?: number
  ) => {
    setBatchItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        status,
        error,
        ...(thumbnailUpdatedAt !== undefined ? { thumbnailUpdatedAt } : {}),
      };
      return next;
    });
  };

  const processQueue = useCallback(
    async (targetIndices: number[]) => {
      if (running || !isAssetsReady || targetIndices.length === 0) return;

      setRunning(true);
      cancelRequestedRef.current = false;

      let quotaExceeded = false;

      for (let i = 0; i < targetIndices.length; i++) {
        const itemIdx = targetIndices[i];

        if (cancelRequestedRef.current || quotaExceeded) {
          updateItemStatus(itemIdx, "skipped");
          continue;
        }

        const item = batchItemsRef.current[itemIdx] ?? batchItems[itemIdx];
        updateItemStatus(itemIdx, "rendering");

        try {
          const dataUrl = renderTagThumbnailDataUrl({
            baseImage,
            logoImage,
            gameTitle,
            episodeNumber: item.episode,
            config: effectiveConfig,
          });

          updateItemStatus(itemIdx, "uploading");

          const savedPath = await persistAndNotifyThumbnail(item.cacheKey, dataUrl);

          if (item.localFile) {
            await persistAndNotifyThumbnail(item.localFile, dataUrl).catch(() => {});
          }

          const ytKey = `yt:${item.videoId}`;
          if (item.cacheKey !== ytKey) {
            await persistAndNotifyThumbnail(ytKey, dataUrl).catch(() => {});
          }

          const newThumbUrl = await UpdateYouTubeThumbnail(item.videoId, savedPath);

          updateItemStatus(
            itemIdx,
            "done",
            undefined,
            Math.floor(Date.now() / 1000)
          );
          onVideoUpdated?.(item.videoId, newThumbUrl);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          updateItemStatus(itemIdx, "failed", msg);

          if (msg.toLowerCase().includes("quota")) {
            quotaExceeded = true;
          }
        }
      }

      setRunning(false);
      onCompleted?.();
    },
    [batchItems, baseImage, logoImage, gameTitle, effectiveConfig, isAssetsReady, onVideoUpdated, onCompleted, running]
  );

  const start = useCallback(async () => {
    const allIndices = batchItems.map((_, idx) => idx);
    await processQueue(allIndices);
  }, [batchItems, processQueue]);

  const startSelected = useCallback(
    async (videoIds: readonly string[]) => {
      const selectedSet = new Set(videoIds);
      const selectedIndices = batchItems
        .map((item, idx) => (selectedSet.has(item.videoId) ? idx : -1))
        .filter((idx) => idx !== -1);
      await processQueue(selectedIndices);
    },
    [batchItems, processQueue]
  );

  const startUnsynced = useCallback(
    async (maxCount?: number) => {
      let unsyncedIndices = batchItems
        .map((item, idx) =>
          (!item.thumbnailUpdatedAt || item.thumbnailUpdatedAt <= 0) && item.status !== "done" ? idx : -1
        )
        .filter((idx) => idx !== -1);

      if (typeof maxCount === "number" && maxCount > 0) {
        unsyncedIndices = unsyncedIndices.slice(0, maxCount);
      }

      await processQueue(unsyncedIndices);
    },
    [batchItems, processQueue]
  );

  const updateSingle = useCallback(
    async (videoId: string) => {
      const targetIdx = batchItems.findIndex((item) => item.videoId === videoId);
      if (targetIdx !== -1) {
        await processQueue([targetIdx]);
      }
    },
    [batchItems, processQueue]
  );

  const retryFailed = useCallback(async () => {
    const failedIndices = batchItems
      .map((item, idx) => (item.status === "failed" ? idx : -1))
      .filter((idx) => idx !== -1);
    await processQueue(failedIndices);
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
