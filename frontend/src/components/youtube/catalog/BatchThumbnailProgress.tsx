import { FC } from "react";
import { BatchItem } from "../../../types";

interface BatchThumbnailProgressProps {
  readonly isProcessing: boolean;
  readonly isDone: boolean;
  readonly items: readonly BatchItem[];
  readonly progress: {
    readonly current: number;
    readonly total: number;
    readonly successCount: number;
    readonly failCount: number;
  };
  readonly quotaEstimate: number;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly onRetryFailed: () => void;
}

export const BatchThumbnailProgress: FC<BatchThumbnailProgressProps> = ({
  isProcessing,
  isDone,
  items,
  progress,
  quotaEstimate,
  onStart,
  onCancel,
  onRetryFailed,
}) => {
  const currentProgress = progress ?? { current: 0, total: 0, successCount: 0, failCount: 0 };
  const percent =
    currentProgress.total > 0
      ? Math.round((currentProgress.current / currentProgress.total) * 100)
      : 0;

  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-text-primary">YouTube Thumbnail Batch</h4>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Estimated quota cost: <span className="font-mono text-text-primary">{quotaEstimate} units</span> (50 units per video)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isProcessing && !isDone && (
            <button
              type="button"
              onClick={onStart}
              disabled={items.length === 0}
              className="btn btn-primary btn-sm"
            >
              Update all thumbnails on YouTube
            </button>
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

          {isDone && currentProgress.failCount > 0 && (
            <button
              type="button"
              onClick={onRetryFailed}
              className="btn btn-secondary btn-sm"
            >
              Retry failed
            </button>
          )}
        </div>
      </div>

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
          {items.map((item) => (
            <div key={item.videoId} className="flex items-center justify-between py-0.5">
              <span className="truncate max-w-[240px] text-text-secondary font-mono">
                Ep {item.episode} ({item.videoId})
              </span>
              <span
                className={`font-medium ${
                  item.status === "done"
                    ? "text-emerald-400"
                    : item.status === "failed"
                    ? "text-red-400"
                    : item.status === "uploading" || item.status === "rendering"
                    ? "text-accent"
                    : "text-text-muted"
                }`}
              >
                {item.status === "done"
                  ? "Done"
                  : item.status === "failed"
                  ? item.error || "Failed"
                  : item.status === "rendering"
                  ? "Rendering..."
                  : item.status === "uploading"
                  ? "Uploading..."
                  : item.status === "skipped"
                  ? "Skipped"
                  : "Pending"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
