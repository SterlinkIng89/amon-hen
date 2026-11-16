import { useRef, useCallback, useEffect, useMemo } from "react";
import {
  TagThumbnailConfig,
  BatchItem,
  BatchItemStatus,
  ThumbnailBatchJob,
} from "../types";
import { useThumbnailAssets } from "./useThumbnailAssets";
import { renderTagThumbnailDataUrl } from "../utils/thumbnailRender";
import {
  SaveCustomThumbnail,
  GetCustomThumbnail,
  UpdateYouTubeThumbnailForEpisode,
} from "../../wailsjs/go/backend/App";
import { notifyCustomThumbChanged } from "./useThumbnailQueue";
import { useAppStore } from "../store/useAppStore";

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

interface ThumbnailBatchCallbacks {
  readonly onVideoUpdated?: (videoId: string, newThumbUrl: string, thumbnailEpisode?: number) => void;
  readonly onCompleted?: () => void;
}

const callbackRegistry = new Map<string, ThumbnailBatchCallbacks>();
let ephemeralCounter = 0;

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

function mergeBatchItems(
  prev: readonly BatchItem[],
  inputItems: readonly BatchThumbnailInputItem[]
): { readonly next: BatchItem[]; readonly changed: boolean } {
  const prevMap = new Map(prev.map((p) => [p.videoId, p]));
  let changed = prev.length !== inputItems.length;

  const next = inputItems.map((item) => {
    const existing = prevMap.get(item.videoId);
    const inputTs = item.thumbnailUpdatedAt ?? 0;
    const existingTs = existing?.thumbnailUpdatedAt ?? 0;
    const latestUpdatedAt = Math.max(inputTs, existingTs);
    const resolvedUpdatedAt = latestUpdatedAt > 0 ? latestUpdatedAt : undefined;
    const thumbnailEpisode = item.thumbnailEpisode ?? existing?.thumbnailEpisode;
    const status = existing ? existing.status : "pending";

    if (
      !existing ||
      existing.episode !== item.episode ||
      existing.cacheKey !== item.cacheKey ||
      existing.localFile !== item.localFile ||
      existing.thumbnailUpdatedAt !== resolvedUpdatedAt ||
      existing.thumbnailEpisode !== thumbnailEpisode ||
      existing.status !== status
    ) {
      changed = true;
    }

    return {
      ...(existing || {}),
      videoId: item.videoId,
      episode: item.episode,
      cacheKey: item.cacheKey,
      localFile: item.localFile,
      thumbnailUpdatedAt: resolvedUpdatedAt,
      thumbnailEpisode,
      status,
    };
  });

  return { next, changed };
}

function updateStoredItemStatus(
  batchKey: string,
  videoId: string,
  status: BatchItemStatus,
  error?: string,
  thumbnailUpdatedAt?: number,
  thumbnailEpisode?: number
): void {
  useAppStore.getState().setThumbnailBatch(batchKey, (prev) => {
    const base: ThumbnailBatchJob = prev ?? {
      items: [],
      running: true,
      runId: 0,
      cancelRequested: false,
    };
    return {
      ...base,
      items: base.items.map((item) =>
        item.videoId === videoId
          ? {
              ...item,
              status,
              error,
              ...(thumbnailUpdatedAt !== undefined ? { thumbnailUpdatedAt } : {}),
              ...(thumbnailEpisode !== undefined ? { thumbnailEpisode } : {}),
            }
          : item
      ),
    };
  });
}

async function runThumbnailBatchQueue(args: {
  readonly batchKey: string;
  readonly targetVideoIds: readonly string[];
  readonly fallbackItems: readonly BatchItem[];
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage: HTMLImageElement | null;
  readonly gameTitle: string;
  readonly effectiveConfig: TagThumbnailConfig;
}): Promise<void> {
  const {
    batchKey,
    targetVideoIds,
    fallbackItems,
    baseImage,
    logoImage,
    gameTitle,
    effectiveConfig,
  } = args;

  const existingJob = useAppStore.getState().thumbnailBatches[batchKey];
  if (existingJob?.running || targetVideoIds.length === 0) return;

  const baseItems =
    existingJob?.items && existingJob.items.length > 0
      ? existingJob.items
      : fallbackItems;
  const currentRunId = (existingJob?.runId ?? 0) + 1;

  useAppStore.getState().setThumbnailBatch(batchKey, {
    items: baseItems,
    running: true,
    runId: currentRunId,
    cancelRequested: false,
  });

  let quotaExceeded = false;

  for (let i = 0; i < targetVideoIds.length; i++) {
    const videoId = targetVideoIds[i];
    const latestJob = useAppStore.getState().thumbnailBatches[batchKey];

    if (!latestJob || latestJob.runId !== currentRunId) {
      return;
    }

    if (latestJob.cancelRequested || quotaExceeded) {
      updateStoredItemStatus(batchKey, videoId, "skipped");
      continue;
    }

    const item = latestJob.items.find((b) => b.videoId === videoId);
    if (!item) {
      continue;
    }

    updateStoredItemStatus(batchKey, videoId, "rendering");

    try {
      const dataUrl = renderTagThumbnailDataUrl({
        baseImage,
        logoImage,
        gameTitle,
        episodeNumber: item.episode,
        config: effectiveConfig,
      });

      const afterRenderJob = useAppStore.getState().thumbnailBatches[batchKey];
      if (!afterRenderJob || afterRenderJob.runId !== currentRunId) {
        return;
      }

      updateStoredItemStatus(batchKey, videoId, "uploading");

      const savedPath = await persistAndNotifyThumbnail(item.cacheKey, dataUrl);
      if (useAppStore.getState().thumbnailBatches[batchKey]?.runId !== currentRunId) {
        return;
      }

      if (item.localFile) {
        await persistAndNotifyThumbnail(item.localFile, dataUrl).catch(() => {});
        if (useAppStore.getState().thumbnailBatches[batchKey]?.runId !== currentRunId) {
          return;
        }
      }

      const ytKey = `yt:${item.videoId}`;
      if (item.cacheKey !== ytKey) {
        await persistAndNotifyThumbnail(ytKey, dataUrl).catch(() => {});
        if (useAppStore.getState().thumbnailBatches[batchKey]?.runId !== currentRunId) {
          return;
        }
      }

      const newThumbUrl = await UpdateYouTubeThumbnailForEpisode(
        item.videoId,
        savedPath,
        item.episode
      );
      if (useAppStore.getState().thumbnailBatches[batchKey]?.runId !== currentRunId) {
        return;
      }

      updateStoredItemStatus(
        batchKey,
        videoId,
        "done",
        undefined,
        Math.floor(Date.now() / 1000),
        item.episode
      );
      callbackRegistry.get(batchKey)?.onVideoUpdated?.(
        item.videoId,
        newThumbUrl,
        item.episode
      );
    } catch (err: unknown) {
      if (useAppStore.getState().thumbnailBatches[batchKey]?.runId !== currentRunId) {
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      updateStoredItemStatus(batchKey, videoId, "failed", msg);

      if (msg.toLowerCase().includes("quota")) {
        quotaExceeded = true;
      }
    }
  }

  const finalJob = useAppStore.getState().thumbnailBatches[batchKey];
  if (finalJob && finalJob.runId === currentRunId) {
    useAppStore.getState().setThumbnailBatch(batchKey, {
      ...finalJob,
      running: false,
    });
    callbackRegistry.get(batchKey)?.onCompleted?.();
  }
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
  const ephemeralKeyRef = useRef<string>("");
  if (!ephemeralKeyRef.current) {
    ephemeralKeyRef.current = `ephemeral-thumb-${++ephemeralCounter}`;
  }

  const normalizedPlaylistId = playlistId?.trim() ?? "";
  const batchKey = normalizedPlaylistId.length > 0 ? normalizedPlaylistId : ephemeralKeyRef.current;

  const { thumbnailBatches } = useAppStore();
  const job = thumbnailBatches[batchKey];
  const running = job?.running ?? false;

  const batchItems = useMemo<readonly BatchItem[]>(() => {
    if (job?.items && job.items.length > 0) {
      return job.items;
    }
    return inputItems.map(toPendingBatchItem);
  }, [job?.items, inputItems]);

  // Keep latest callbacks registered for the active batchKey while mounted
  useEffect(() => {
    const entry: ThumbnailBatchCallbacks = { onVideoUpdated, onCompleted };
    callbackRegistry.set(batchKey, entry);
    return () => {
      if (callbackRegistry.get(batchKey) === entry) {
        callbackRegistry.delete(batchKey);
      }
    };
  }, [batchKey, onVideoUpdated, onCompleted]);

  // Sync inputItems into store when idle and non-empty
  useEffect(() => {
    if (inputItems.length === 0) return;
    const currentJob = useAppStore.getState().thumbnailBatches[batchKey];
    if (currentJob?.running) return;

    const prevItems = currentJob?.items ?? [];
    const { next, changed } = mergeBatchItems(prevItems, inputItems);
    if (!currentJob || changed) {
      useAppStore.getState().setThumbnailBatch(batchKey, {
        items: next,
        running: false,
        runId: currentJob?.runId ?? 0,
        cancelRequested: false,
      });
    }
  }, [batchKey, inputItems, running]);

  const { baseImage, logoImage, gameTitle, loadingAssets } = useThumbnailAssets(
    tag,
    effectiveConfig
  );

  const isAssetsReady = !loadingAssets && Boolean(baseImage);

  const processQueue = useCallback(
    async (targetVideoIds: readonly string[]) => {
      if (running || !isAssetsReady || targetVideoIds.length === 0) return;
      await runThumbnailBatchQueue({
        batchKey,
        targetVideoIds,
        fallbackItems: batchItems,
        baseImage,
        logoImage,
        gameTitle,
        effectiveConfig,
      });
    },
    [
      batchKey,
      running,
      isAssetsReady,
      batchItems,
      baseImage,
      logoImage,
      gameTitle,
      effectiveConfig,
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
    useAppStore.getState().setThumbnailBatch(batchKey, (prev) => {
      if (!prev) {
        return { items: [], running: false, runId: 0, cancelRequested: true };
      }
      return { ...prev, cancelRequested: true };
    });
  }, [batchKey]);

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
