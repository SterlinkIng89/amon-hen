import {
  BatchItem,
  BatchProgress,
  DescriptionBatchJob,
  ThumbnailBatchJob,
} from "../types";
import type { PlaylistBatchStatus } from "../components/youtube/catalog/PlaylistCatalogRow";

export function summarizeThumbnailBatchItems(
  items: readonly BatchItem[]
): BatchProgress {
  let current = 0;
  let successCount = 0;
  let failCount = 0;
  let total = 0;

  for (const item of items) {
    if (!item) continue;
    total++;
    if (item.status !== "pending") {
      current++;
      if (item.status === "done") successCount++;
      else if (item.status === "failed") failCount++;
    }
  }

  return { current, total, successCount, failCount };
}

export function getPlaylistBatchStatus(
  thumbJob?: ThumbnailBatchJob,
  descJob?: DescriptionBatchJob
): PlaylistBatchStatus | undefined {
  if (thumbJob && thumbJob.items.length > 0) {
    const summary = summarizeThumbnailBatchItems(thumbJob.items);
    if (thumbJob.running) {
      return { running: true, isDone: false, ...summary };
    }
    if (summary.current > 0) {
      return { running: false, isDone: true, ...summary };
    }
  }

  if (descJob && descJob.progress.total > 0) {
    const isDone =
      !descJob.running && descJob.progress.current >= descJob.progress.total;
    if (descJob.running || isDone) {
      return { running: descJob.running, isDone, ...descJob.progress };
    }
  }

  return undefined;
}
