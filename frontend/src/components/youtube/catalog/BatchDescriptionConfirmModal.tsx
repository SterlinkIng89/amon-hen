import { FC, useEffect, useCallback } from "react";

export interface BatchDescriptionConfirmModalProps {
  readonly isOpen: boolean;
  readonly targetCount: number;
  readonly quotaUnits: number;
  readonly descriptionPreview: string;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly isUpdating?: boolean;
}

export const BatchDescriptionConfirmModal: FC<BatchDescriptionConfirmModalProps> = ({
  isOpen,
  targetCount,
  quotaUnits,
  descriptionPreview,
  onConfirm,
  onClose,
  isUpdating = false,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUpdating) {
        onClose();
      }
    },
    [isUpdating, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-desc-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-lg overflow-hidden shadow-sm flex flex-col">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16m-7 6h7"
              />
            </svg>
            <h3
              id="batch-desc-confirm-title"
              className="text-sm font-semibold text-text-primary"
            >
              Confirm Description Update
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="p-3.5 rounded-xl border border-accent/20 bg-accent/5 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-accent shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-xs space-y-1">
              <p className="font-medium text-text-primary">
                Are you sure you want to replace descriptions for{" "}
                <span className="font-semibold text-accent">
                  {targetCount} video{targetCount === 1 ? "" : "s"}
                </span>
                ?
              </p>
              <p className="text-text-secondary leading-relaxed">
                Existing YouTube descriptions will be completely replaced by the template below.
                Videos with identical descriptions will be skipped.
              </p>
              <p className="text-[11px] font-mono text-text-muted pt-1">
                Estimated YouTube API quota:{" "}
                <span className="font-semibold text-text-primary">{quotaUnits} units</span> (50
                units per video).
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>Replacement description preview:</span>
              <span className="font-mono">{descriptionPreview.length} / 5,000 chars</span>
            </div>
            <div className="max-h-44 overflow-y-auto font-mono text-xs text-text-secondary bg-elevated/50 p-3 rounded-lg border border-border-subtle whitespace-pre-wrap select-text">
              {descriptionPreview || (
                <span className="italic text-text-muted">Empty description</span>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-border-subtle bg-elevated/20 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isUpdating || targetCount === 0 || !descriptionPreview.trim()}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            <span>Apply & update YouTube</span>
            <span className="font-mono text-[10px] opacity-80">({targetCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
