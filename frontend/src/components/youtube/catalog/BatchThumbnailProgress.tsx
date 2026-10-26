import { FC, useMemo } from "react";
import { BatchItem } from "../../../types";

export interface BatchThumbnailProgressProps {
  readonly isProcessing: boolean;
  readonly isDone: boolean;
  readonly isAssetsReady?: boolean;
  readonly items: readonly BatchItem[];
  readonly selectedVideoIds?: ReadonlySet<string>;
  readonly progress: {
    readonly current: number;
    readonly total: number;
    readonly successCount: number;
    readonly failCount: number;
  };
  readonly quotaEstimate: number;
  readonly onStart: () => void;
  readonly onStartSelected?: () => void;
  readonly onStartUnsynced?: (maxCount?: number) => void;
  readonly onCancel: () => void;
  readonly onRetryFailed: () => void;
}

function getBatchItemStatusDetails(item: BatchItem): { readonly text: string; readonly className: string } {
  switch (item.status) {
    case "done":
      return { text: "Done", className: "text-emerald-400" };
    case "failed":
      return { text: item.error || "Failed", className: "text-red-400" };
    case "rendering":
      return { text: "Rendering...", className: "text-accent" };
    case "uploading":
      return { text: "Uploading...", className: "text-accent" };
    case "skipped":
      return { text: "Skipped", className: "text-text-muted" };
    default:
      return { text: "Pending", className: "text-text-muted" };
  }
}

export const BatchThumbnailProgress: FC<BatchThumbnailProgressProps> = ({
  isProcessing,
  isDone,
  isAssetsReady = true,
  items,
  selectedVideoIds,
  progress,
  quotaEstimate,
  onStart,
  onStartSelected,
  onStartUnsynced,
  onCancel,
  onRetryFailed,
}) => {
  const currentProgress = progress ?? { current: 0, total: 0, successCount: 0, failCount: 0 };
  const percent =
    currentProgress.total > 0
      ? Math.round((currentProgress.current / currentProgress.total) * 100)
      : 0;

  const syncedCount = useMemo(
    () =>
      items.filter(
        (i) => (i.thumbnailUpdatedAt ?? 0) > 0 || i.status === "done"
      ).length,
    [items]
  );
  const unsyncedCount = items.length - syncedCount;
  const selectedCount = selectedVideoIds ? selectedVideoIds.size : 0;

  const effectiveQuota = useMemo(() => {
    if (selectedCount > 0) return selectedCount * 50;
    if (onStartUnsynced && unsyncedCount > 0) return unsyncedCount * 50;
    return quotaEstimate > 0 ? quotaEstimate : items.length * 50;
  }, [selectedCount, onStartUnsynced, unsyncedCount, quotaEstimate, items.length]);

  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
      {/* Header and Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-text-primary shrink-0">
            YouTube Thumbnail Batch
          </h4>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded whitespace-nowrap bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Synced: <span className="tabular-nums font-semibold">{syncedCount}</span>/{items.length}
            </span>
            {unsyncedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded whitespace-nowrap bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Needs thumb: <span className="tabular-nums font-semibold">{unsyncedCount}</span>
              </span>
            )}
            {selectedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded whitespace-nowrap bg-accent/10 text-accent border border-accent/20">
                Selected: <span className="tabular-nums font-semibold">{selectedCount}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
          <p className="text-[11px] text-text-secondary">
            Estimated quota: <span className="font-mono text-text-primary font-medium">{effectiveQuota} units</span> (50 units per video)
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isProcessing && (
            <>
              {/* Selected videos batch button */}
              {selectedCount > 0 && onStartSelected && (
                <button
                  type="button"
                  onClick={onStartSelected}
                  disabled={!isAssetsReady}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  title={`Update custom thumbnails for ${selectedCount} selected videos`}
                >
                  <span>Update selected</span>
                  <span className="font-mono text-[10px] opacity-80">({selectedCount})</span>
                </button>
              )}

              {/* Unsynced videos batch button */}
              {unsyncedCount > 0 && onStartUnsynced && (
                <>
                  <button
                    type="button"
                    onClick={() => onStartUnsynced()}
                    disabled={!isAssetsReady}
                    className={`btn btn-sm flex items-center gap-1.5 ${
                      selectedCount > 0 ? "btn-secondary" : "btn-primary"
                    }`}
                    title={`Update thumbnails for ${unsyncedCount} unsynced videos`}
                  >
                    <span>Update unsynced</span>
                    <span className="font-mono text-[10px] opacity-80">({unsyncedCount})</span>
                  </button>

                  {unsyncedCount > 50 && (
                    <button
                      type="button"
                      onClick={() => onStartUnsynced(50)}
                      disabled={!isAssetsReady}
                      className="btn btn-secondary btn-sm flex items-center gap-1.5"
                      title="Update next 50 unsynced videos to stay within daily API quota (2,500 units)"
                    >
                      <span>Update next 50</span>
                      <span className="font-mono text-[10px] opacity-80">(2,500 units)</span>
                    </button>
                  )}
                </>
              )}

              {/* Fallback Update All / Re-sync All Button */}
              {(!onStartUnsynced || unsyncedCount === 0 || selectedCount > 0) && (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={items.length === 0 || !isAssetsReady}
                  className={`btn btn-sm ${
                    selectedCount > 0 || (onStartUnsynced && unsyncedCount > 0)
                      ? "btn-ghost text-text-secondary hover:text-text-primary"
                      : "btn-primary"
                  }`}
                  title={
                    unsyncedCount === 0
                      ? `Re-sync thumbnails for all ${items.length} videos`
                      : `Update thumbnails for all ${items.length} videos`
                  }
                >
                  {unsyncedCount === 0 ? `Re-sync all (${items.length})` : `Update all (${items.length})`}
                </button>
              )}

              {isDone && currentProgress.failCount > 0 && (
                <button
                  type="button"
                  onClick={onRetryFailed}
                  className="btn btn-secondary btn-sm"
                >
                  Retry failed
                </button>
              )}
            </>
          )}

          {isProcessing && (
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-danger btn-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>

      {/* Asset readiness alert */}
      {!isAssetsReady && !isProcessing && (
        <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span>Thumbnail artwork assets are loading or incomplete. Updates are disabled until assets are ready.</span>
        </div>
      )}

      {/* Progress Bar and Statistics */}
      {(isProcessing || isDone) && (
        <div className="space-y-2 pt-1">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>
              {currentProgress.current} / {currentProgress.total} processed
            </span>
            {isDone ? (
              <span className={currentProgress.failCount > 0 ? "text-amber-400" : "text-emerald-400"}>
                {currentProgress.successCount} succeeded, {currentProgress.failCount} failed
              </span>
            ) : (
              <span className="font-mono text-accent">{percent}%</span>
            )}
          </div>
          <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                currentProgress.failCount > 0 && isDone ? "bg-amber-500" : "bg-accent"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Item list details when active */}
      {(isProcessing || isDone) && items.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1.5 pt-2 border-t border-border-subtle/50 text-[11px] custom-scrollbar">
          {items.map((item) => {
            const statusDetails = getBatchItemStatusDetails(item);
            return (
              <div key={item.videoId} className="flex items-center justify-between py-0.5">
                <span className="truncate max-w-[240px] text-text-secondary font-mono">
                  Ep {item.episode} ({item.videoId})
                </span>
                <span className={`font-medium ${statusDetails.className}`}>
                  {statusDetails.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
