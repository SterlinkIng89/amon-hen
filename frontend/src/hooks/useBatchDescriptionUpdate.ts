import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { BatchItemStatus } from "../types/index";
import { UpdateYouTubeVideoMetadata } from "../../wailsjs/go/backend/App";

export interface BatchDescriptionInputItem {
  readonly videoId: string;
  readonly title: string;
  readonly currentDescription: string;
}

export interface BatchDescriptionItem extends BatchDescriptionInputItem {
  readonly status: BatchItemStatus;
  readonly error?: string;
}

export interface BatchProgress {
  readonly current: number;
  readonly total: number;
  readonly successCount: number;
  readonly failCount: number;
}

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
  readonly start: () => Promise<void>;
  readonly startSelected: (videoIds: readonly string[]) => Promise<void>;
  readonly startUnsynced: (maxCount?: number) => Promise<void>;
  readonly retryFailed: () => Promise<void>;
  readonly cancel: () => void;
}

function toPendingItem(item: BatchDescriptionInputItem): BatchDescriptionItem {
  return {
    ...item,
    status: "pending",
  };
}

export function useBatchDescriptionUpdate({
  playlistId,
  targetDescription,
  items: inputItems,
  onVideoUpdated,
  onCompleted,
}: UseBatchDescriptionUpdateArgs): UseBatchDescriptionUpdateResult {
  const [batchItems, setBatchItems] = useState<BatchDescriptionItem[]>(() =>
    inputItems.map(toPendingItem)
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    successCount: 0,
    failCount: 0,
  });

  const cancelRequestedRef = useRef(false);
  const runIdRef = useRef(0);
  const batchItemsRef = useRef(batchItems);
  useEffect(() => {
    batchItemsRef.current = batchItems;
  }, [batchItems]);

  const prevPlaylistIdRef = useRef(playlistId);

  useEffect(() => {
    if (prevPlaylistIdRef.current !== playlistId) {
      prevPlaylistIdRef.current = playlistId;
      runIdRef.current++;
      cancelRequestedRef.current = true;
      setRunning(false);
      setBatchItems(inputItems.map(toPendingItem));
      setProgress({ current: 0, total: 0, successCount: 0, failCount: 0 });
    }
  }, [playlistId, inputItems]);

  useEffect(() => {
    return () => {
      runIdRef.current++;
      cancelRequestedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!running) {
      setBatchItems((prev) => {
        const prevMap = new Map(prev.map((p) => [p.videoId, p]));
        let hasChanges = false;
        if (prev.length !== inputItems.length) {
          hasChanges = true;
        }

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

        return hasChanges ? next : prev;
      });
    }
  }, [inputItems, running]);

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

  const updateItemStatus = useCallback(
    (videoId: string, status: BatchItemStatus, error?: string) => {
      setBatchItems((prev) =>
        prev.map((item) =>
          item.videoId === videoId ? { ...item, status, error } : item
        )
      );
    },
    []
  );

  const processQueue = useCallback(
    async (targetVideoIds: readonly string[]) => {
      if (running || targetVideoIds.length === 0 || !normalizedTarget) return;

      const currentRunId = ++runIdRef.current;
      setRunning(true);
      cancelRequestedRef.current = false;

      let successCount = 0;
      let failCount = 0;
      setProgress({
        current: 0,
        total: targetVideoIds.length,
        successCount: 0,
        failCount: 0,
      });

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

        updateItemStatus(videoId, "uploading");

        try {
          await UpdateYouTubeVideoMetadata(videoId, "", targetDescription, "");

          if (runIdRef.current !== currentRunId) {
            return;
          }

          successCount++;
          updateItemStatus(videoId, "done");
          onVideoUpdated?.(videoId, targetDescription);
        } catch (err: unknown) {
          if (runIdRef.current !== currentRunId) {
            return;
          }

          failCount++;
          const msg = err instanceof Error ? err.message : String(err);
          updateItemStatus(videoId, "failed", msg);

          if (msg.toLowerCase().includes("quota")) {
            quotaExceeded = true;
          }
        }

        setProgress({
          current: i + 1,
          total: targetVideoIds.length,
          successCount,
          failCount,
        });
      }

      if (runIdRef.current === currentRunId) {
        setRunning(false);
        onCompleted?.();
      }
    },
    [
      running,
      normalizedTarget,
      targetDescription,
      updateItemStatus,
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
    cancelRequestedRef.current = true;
  }, []);

  const isDone = progress.total > 0 && progress.current >= progress.total;

  return {
    items: batchItems,
    running,
    isDone,
    syncedCount,
    unsyncedCount,
    estimatedQuota,
    progress,
    start,
    startSelected,
    startUnsynced,
    retryFailed,
    cancel,
  };
}
