import { useState, useRef, useCallback, useEffect } from "react";
import { TagThumbnailConfig, BatchItem, BatchItemStatus } from "../types";
import { useThumbnailAssets } from "./useThumbnailAssets";
import { renderTagThumbnailDataUrl } from "../utils/thumbnailRender";
import {
  SaveCustomThumbnail,
  UpdateYouTubeThumbnail,
} from "../../wailsjs/go/backend/App";

export interface BatchThumbnailInputItem {
  readonly videoId: string;
  readonly episode: number;
  readonly cacheKey: string;
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
  readonly estimatedQuota: number;
  readonly start: () => Promise<void>;
  readonly retryFailed: () => Promise<void>;
  readonly cancel: () => void;
}

export function useBatchThumbnailUpdate({
  tag,
  config,
  items: inputItems,
  onVideoUpdated,
  onCompleted,
}: UseBatchThumbnailUpdateArgs): UseBatchThumbnailUpdateResult {
  const effectiveConfig: TagThumbnailConfig = config ?? {
    enabled: true,
    source_type: "steam",
    steam_asset_type: "header",
    episode_position: "bottom-right",
    episode_format: "pad2",
  };

  const [batchItems, setBatchItems] = useState<BatchItem[]>(() =>
    inputItems.map((item) => ({
      videoId: item.videoId,
      episode: item.episode,
      cacheKey: item.cacheKey,
      status: "pending",
    }))
  );

  const [running, setRunning] = useState(false);
  const cancelRequestedRef = useRef(false);

  // Sync batchItems when inputItems change if not currently running
  useEffect(() => {
    if (!running) {
      setBatchItems(
        inputItems.map((item) => ({
          videoId: item.videoId,
          episode: item.episode,
          cacheKey: item.cacheKey,
          status: "pending",
        }))
      );
    }
  }, [inputItems, running]);

  const { baseImage, logoImage, gameTitle, loadingAssets } = useThumbnailAssets(
    tag,
    effectiveConfig
  );

  const updateItemStatus = (
    index: number,
    status: BatchItemStatus,
    error?: string
  ) => {
    setBatchItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status, error };
      return next;
    });
  };

  const processQueue = useCallback(
    async (targetIndices: number[]) => {
      if (running || loadingAssets || targetIndices.length === 0) return;

      setRunning(true);
      cancelRequestedRef.current = false;

      let quotaExceeded = false;

      for (let i = 0; i < targetIndices.length; i++) {
        const itemIdx = targetIndices[i];

        if (cancelRequestedRef.current || quotaExceeded) {
          updateItemStatus(itemIdx, "skipped");
          continue;
        }

        const item = batchItems[itemIdx];
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
          const savedPath = await SaveCustomThumbnail(item.cacheKey, dataUrl);
          const newThumbUrl = await UpdateYouTubeThumbnail(item.videoId, savedPath);

          updateItemStatus(itemIdx, "done");
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
    [batchItems, baseImage, logoImage, gameTitle, effectiveConfig, loadingAssets, onVideoUpdated, onCompleted, running]
  );

  const start = useCallback(async () => {
    const allIndices = batchItems.map((_, idx) => idx);
    await processQueue(allIndices);
  }, [batchItems, processQueue]);

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
    estimatedQuota: batchItems.length * 50,
    start,
    retryFailed,
    cancel,
  };
}
