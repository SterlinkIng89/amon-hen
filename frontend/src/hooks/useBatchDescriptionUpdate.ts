import { useRef, useCallback, useEffect, useMemo } from "react";
import {
  BatchItemStatus,
  BatchDescriptionInputItem,
  BatchDescriptionItem,
  BatchProgress,
  DescriptionBatchJob,
} from "../types/index";
import { UpdateYouTubeVideoMetadata } from "../../wailsjs/go/backend/App";
import { useAppStore } from "../store/useAppStore";

export type {
  BatchDescriptionInputItem,
  BatchDescriptionItem,
  BatchProgress,
};

export interface UseBatchDescriptionUpdateArgs {
  readonly playlistId?: string;
  readonly targetDescription: string;
  readonly items: readonly BatchDescriptionInputItem[];
  readonly onVideoUpdated?: (videoId: string, newDescription: string) => void;
  readonly onCompleted?: () => void;
}

export interface UseBatchDescriptionUpdateResult {
  readonly items: readonly BatchDescriptionItem[];
  readonly running: boolean;
  readonly isDone: boolean;
  readonly syncedCount: number;
  readonly unsyncedCount: number;
  readonly estimatedQuota: number;
  readonly progress: BatchProgress;
  readonly storedTargetDescription?: string;
  readonly start: () => Promise<void>;
  readonly startSelected: (videoIds: readonly string[]) => Promise<void>;
  readonly startUnsynced: (maxCount?: number) => Promise<void>;
  readonly retryFailed: () => Promise<void>;
  readonly cancel: () => void;
}

const EMPTY_PROGRESS: BatchProgress = {
  current: 0,
  total: 0,
  successCount: 0,
  failCount: 0,
};

interface DescriptionBatchCallbacks {
  readonly onVideoUpdated?: (videoId: string, newDescription: string) => void;
  readonly onCompleted?: () => void;
}

const callbackRegistry = new Map<string, DescriptionBatchCallbacks>();
let ephemeralCounter = 0;

function toPendingItem(item: BatchDescriptionInputItem): BatchDescriptionItem {
  return {
    ...item,
    status: "pending",
  };
}

function mergeDescriptionItems(
  prev: readonly BatchDescriptionItem[],
  inputItems: readonly BatchDescriptionInputItem[]
): { readonly next: BatchDescriptionItem[]; readonly changed: boolean } {
  const prevMap = new Map(prev.map((p) => [p.videoId, p]));
  let hasChanges = prev.length !== inputItems.length;

  const next = inputItems.map((item) => {
    const existing = prevMap.get(item.videoId);
    if (
      !existing ||
      existing.title !== item.title ||
      existing.currentDescription !== item.currentDescription
    ) {
      hasChanges = true;
    }
    return {
      ...item,
      status: existing ? existing.status : "pending",
      error: existing?.error,
    };
  });

  return { next, changed: hasChanges };
}

function updateStoredDescriptionItemStatus(
  batchKey: string,
  videoId: string,
  status: BatchItemStatus,
  error?: string
): void {
  useAppStore.getState().setDescriptionBatch(batchKey, (prev) => {
    const base: DescriptionBatchJob = prev ?? {
      items: [],
      running: true,
      runId: 0,
      cancelRequested: false,
      progress: EMPTY_PROGRESS,
    };
    return {
      ...base,
      items: base.items.map((item) =>
        item.videoId === videoId ? { ...item, status, error } : item
      ),
    };
  });
}

function updateStoredDescriptionProgress(
  batchKey: string,
  progress: BatchProgress
): void {
  useAppStore.getState().setDescriptionBatch(batchKey, (prev) => ({
    items: prev?.items ?? [],
    running: prev?.running ?? false,
    runId: prev?.runId ?? 0,
    cancelRequested: prev?.cancelRequested ?? false,
    targetDescription: prev?.targetDescription,
    progress,
  }));
}

async function runDescriptionBatchQueue(args: {
  readonly batchKey: string;
  readonly targetVideoIds: readonly string[];
  readonly targetDescription: string;
  readonly fallbackItems: readonly BatchDescriptionItem[];
}): Promise<void> {
  const { batchKey, targetVideoIds, targetDescription, fallbackItems } = args;
  const normalizedTarget = targetDescription.trim();
  const existingJob = useAppStore.getState().descriptionBatches[batchKey];

  if (existingJob?.running || targetVideoIds.length === 0 || !normalizedTarget) {
    return;
  }

  const baseItems =
    existingJob?.items && existingJob.items.length > 0
      ? existingJob.items
      : fallbackItems;
  const currentRunId = (existingJob?.runId ?? 0) + 1;

  let successCount = 0;
  let failCount = 0;

  useAppStore.getState().setDescriptionBatch(batchKey, {
    items: baseItems,
    running: true,
    runId: currentRunId,
    cancelRequested: false,
    progress: {
      current: 0,
      total: targetVideoIds.length,
      successCount: 0,
      failCount: 0,
    },
    targetDescription,
  });

  let quotaExceeded = false;

  for (let i = 0; i < targetVideoIds.length; i++) {
    const videoId = targetVideoIds[i];
    const latestJob = useAppStore.getState().descriptionBatches[batchKey];

    if (!latestJob || latestJob.runId !== currentRunId) {
      return;
    }

    if (latestJob.cancelRequested || quotaExceeded) {
      updateStoredDescriptionItemStatus(batchKey, videoId, "skipped");
      continue;
    }

    updateStoredDescriptionItemStatus(batchKey, videoId, "uploading");

    try {
      await UpdateYouTubeVideoMetadata(videoId, "", targetDescription, "");

      if (useAppStore.getState().descriptionBatches[batchKey]?.runId !== currentRunId) {
        return;
      }

      successCount++;
      updateStoredDescriptionItemStatus(batchKey, videoId, "done");
      callbackRegistry.get(batchKey)?.onVideoUpdated?.(videoId, targetDescription);
    } catch (err: unknown) {
      if (useAppStore.getState().descriptionBatches[batchKey]?.runId !== currentRunId) {
        return;
      }

      failCount++;
      const msg = err instanceof Error ? err.message : String(err);
      updateStoredDescriptionItemStatus(batchKey, videoId, "failed", msg);

      if (msg.toLowerCase().includes("quota")) {
        quotaExceeded = true;
      }
    }

    updateStoredDescriptionProgress(batchKey, {
      current: i + 1,
      total: targetVideoIds.length,
      successCount,
      failCount,
    });
  }

  const finalJob = useAppStore.getState().descriptionBatches[batchKey];
  if (finalJob && finalJob.runId === currentRunId) {
    useAppStore.getState().setDescriptionBatch(batchKey, {
      ...finalJob,
      running: false,
    });
    callbackRegistry.get(batchKey)?.onCompleted?.();
  }
}

export function useBatchDescriptionUpdate({
  playlistId,
  targetDescription,
  items: inputItems,
  onVideoUpdated,
  onCompleted,
}: UseBatchDescriptionUpdateArgs): UseBatchDescriptionUpdateResult {
  const ephemeralKeyRef = useRef<string>("");
  if (!ephemeralKeyRef.current) {
    ephemeralKeyRef.current = `ephemeral-desc-${++ephemeralCounter}`;
  }

  const normalizedPlaylistId = playlistId?.trim() ?? "";
  const batchKey = normalizedPlaylistId.length > 0 ? normalizedPlaylistId : ephemeralKeyRef.current;

  const { descriptionBatches } = useAppStore();
  const job = descriptionBatches[batchKey];
  const running = job?.running ?? false;
  const progress = job?.progress ?? EMPTY_PROGRESS;

  const batchItems = useMemo<readonly BatchDescriptionItem[]>(() => {
    if (job?.items && job.items.length > 0) {
      return job.items;
    }
    return inputItems.map(toPendingItem);
  }, [job?.items, inputItems]);

  useEffect(() => {
    const entry: DescriptionBatchCallbacks = { onVideoUpdated, onCompleted };
    callbackRegistry.set(batchKey, entry);
    return () => {
      if (callbackRegistry.get(batchKey) === entry) {
        callbackRegistry.delete(batchKey);
      }
    };
  }, [batchKey, onVideoUpdated, onCompleted]);

  useEffect(() => {
    if (inputItems.length === 0) return;
    const currentJob = useAppStore.getState().descriptionBatches[batchKey];
    if (currentJob?.running) return;

    const prevItems = currentJob?.items ?? [];
    const { next, changed } = mergeDescriptionItems(prevItems, inputItems);
    if (!currentJob || changed) {
      useAppStore.getState().setDescriptionBatch(batchKey, {
        items: next,
        running: false,
        runId: currentJob?.runId ?? 0,
        cancelRequested: false,
        progress: currentJob?.progress ?? EMPTY_PROGRESS,
        targetDescription: currentJob?.targetDescription,
      });
    }
  }, [batchKey, inputItems, running]);

  const safeTarget = typeof targetDescription === "string" ? targetDescription : "";
  const normalizedTarget = safeTarget.trim();

  const { syncedCount, unsyncedCount } = useMemo(() => {
    let synced = 0;
    let unsynced = 0;
    for (const item of batchItems) {
      const isItemSynced =
        (item.currentDescription.trim() === normalizedTarget && normalizedTarget.length > 0) ||
        item.status === "done";
      if (isItemSynced) {
        synced++;
      } else {
        unsynced++;
      }
    }
    return { syncedCount: synced, unsyncedCount: unsynced };
  }, [batchItems, normalizedTarget]);

  const estimatedQuota = unsyncedCount * 50;

  const processQueue = useCallback(
    async (targetVideoIds: readonly string[]) => {
      if (running || targetVideoIds.length === 0 || !normalizedTarget) return;
      await runDescriptionBatchQueue({
        batchKey,
        targetVideoIds,
        targetDescription,
        fallbackItems: batchItems,
      });
    },
    [batchKey, running, normalizedTarget, targetDescription, batchItems]
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
      let targetItems = batchItems.filter(
        (item) =>
          item.currentDescription.trim() !== normalizedTarget &&
          item.status !== "done"
      );

      if (typeof maxCount === "number" && maxCount > 0) {
        targetItems = targetItems.slice(0, maxCount);
      }

      await processQueue(targetItems.map((item) => item.videoId));
    },
    [batchItems, normalizedTarget, processQueue]
  );

  const retryFailed = useCallback(async () => {
    const failedVideoIds = batchItems
      .filter((item) => item.status === "failed")
      .map((item) => item.videoId);
    await processQueue(failedVideoIds);
  }, [batchItems, processQueue]);

  const cancel = useCallback(() => {
    useAppStore.getState().setDescriptionBatch(batchKey, (prev) => {
      if (!prev) {
        return {
          items: [],
          running: false,
          runId: 0,
          cancelRequested: true,
          progress: EMPTY_PROGRESS,
        };
      }
      return { ...prev, cancelRequested: true };
    });
  }, [batchKey]);

  const isDone = !running && progress.total > 0 && progress.current >= progress.total;

  return {
    items: batchItems,
    running,
    isDone,
    syncedCount,
    unsyncedCount,
    estimatedQuota,
    progress,
    storedTargetDescription: job?.targetDescription,
    start,
    startSelected,
    startUnsynced,
    retryFailed,
    cancel,
  };
}
