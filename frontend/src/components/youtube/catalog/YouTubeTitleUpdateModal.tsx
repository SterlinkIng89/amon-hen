import { FC, useEffect, useCallback, useState } from "react";
import { backend } from "../../../../wailsjs/go/models";
import { EventsOn } from "../../../../wailsjs/runtime/runtime";

export interface CatalogTitleProgress {
  readonly current: number;
  readonly total: number;
  readonly videoId: string;
  readonly title: string;
  readonly percentage: number;
}

export interface YouTubeTitleUpdateModalProps {
  readonly isOpen: boolean;
  readonly changes: readonly backend.CatalogTitleChange[];
  readonly isLoadingPreview: boolean;
  readonly isApplying: boolean;
  readonly result: backend.CatalogTitleUpdateResult | null;
  readonly error?: string | null;
  readonly progress?: CatalogTitleProgress | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export const YouTubeTitleUpdateModal: FC<YouTubeTitleUpdateModalProps> = ({
  isOpen,
  changes,
  isLoadingPreview,
  isApplying,
  result,
  error,
  progress: externalProgress,
  onConfirm,
  onClose,
}) => {
  const [internalProgress, setInternalProgress] = useState<CatalogTitleProgress | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setInternalProgress(null);
      return;
    }
    const unsub = EventsOn(
      "catalog:title-update-progress",
      (data: CatalogTitleProgress) => {
        setInternalProgress(data);
      }
    );
    return () => {
      unsub();
    };
  }, [isOpen]);

  const activeProgress = externalProgress ?? internalProgress;
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isApplying) {
        onClose();
      }
    },
    [isApplying, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const quotaCost = changes.length * 50;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="title-update-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-xl bg-surface border border-border-subtle rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="title-update-modal-title" className="text-sm font-semibold text-text-primary">
              Update YouTube video titles
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Synchronize video titles on YouTube to match renumbered episode numbers.
            </p>
          </div>
          {!isApplying && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Quota & Info Alert */}
        <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              {changes.length} video title{changes.length === 1 ? "" : "s"} will be updated via YouTube API.
            </span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-blue-200">
            ~{quotaCost} quota units
          </span>
        </div>

        {/* Live Progress Bar during Update */}
        {isApplying && (
          <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 flex flex-col gap-2.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-text-primary flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                {activeProgress
                  ? `Updating video ${activeProgress.current} of ${activeProgress.total}...`
                  : "Preparing title updates on YouTube..."}
              </span>
              <span className="font-mono text-blue-300 font-semibold text-xs">
                {activeProgress ? `${activeProgress.percentage}%` : "0%"}
              </span>
            </div>

            {/* Progress Bar Track */}
            <div className="w-full h-2 rounded-full bg-elevated overflow-hidden border border-border-subtle">
              <div
                role="progressbar"
                aria-valuenow={activeProgress?.percentage ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${Math.max(2, Math.min(100, activeProgress?.percentage ?? 0))}%` }}
              />
            </div>

            {activeProgress?.title && (
              <p className="text-[11px] text-text-muted truncate font-mono" title={activeProgress.title}>
                {activeProgress.title}
              </p>
            )}
          </div>
        )}

        {/* Result notification */}
        {result && (
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs flex flex-col gap-1">
            <p className="font-medium">
              Successfully updated {result.updated.length} title{result.updated.length === 1 ? "" : "s"} on YouTube.
            </p>
            {Object.keys(result.failed).length > 0 && (
              <p className="text-red-400">
                {Object.keys(result.failed).length} video{Object.keys(result.failed).length === 1 ? "" : "s"} failed to update.
              </p>
            )}
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="p-3 rounded-xl border border-border-fire bg-fire-dim text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Changes List */}
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
          {isLoadingPreview ? (
            <div className="py-8 text-center text-xs text-text-muted">
              Loading preview changes...
            </div>
          ) : changes.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              No title changes needed. All video titles already match their assigned episode.
            </div>
          ) : (
            changes.map((ch) => {
              const isCurrent = isApplying && activeProgress?.videoId === ch.videoId;
              const isDone = result?.updated.includes(ch.videoId);
              const isFailed = result?.failed[ch.videoId];

              return (
                <div
                  key={ch.videoId}
                  className={`p-3 rounded-xl border transition-colors flex flex-col gap-1.5 ${
                    isCurrent
                      ? "border-blue-500/60 bg-blue-500/15"
                      : isDone
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : isFailed
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-border-subtle bg-elevated/40"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-text-muted truncate">{ch.videoId}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrent && (
                        <span className="text-blue-300 font-medium text-[10px] animate-pulse">
                          Updating...
                        </span>
                      )}
                      {isDone && (
                        <span className="text-emerald-400 font-medium text-[10px]">
                          ✓ Updated
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-red-400 font-medium text-[10px]">
                          ✕ Failed
                        </span>
                      )}
                      <span className="text-red-400/80">Ep {ch.oldEpisode}</span>
                      <span className="text-text-muted">→</span>
                      <span className="text-emerald-400 font-semibold">Ep {ch.newEpisode}</span>
                    </div>
                  </div>
                  <div className="text-xs space-y-1">
                    <p className="text-text-muted line-through truncate text-[11px]" title={ch.oldTitle}>
                      {ch.oldTitle}
                    </p>
                    <p className="text-text-primary font-medium truncate" title={ch.newTitle}>
                      {ch.newTitle}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary bg-elevated/60 hover:bg-elevated transition-colors disabled:opacity-40"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && changes.length > 0 && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isApplying || isLoadingPreview}
              className="btn btn-primary btn-sm px-4 py-1.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isApplying
                ? activeProgress
                  ? `Updating (${activeProgress.current}/${activeProgress.total})...`
                  : "Updating on YouTube..."
                : `Update ${changes.length} titles`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
