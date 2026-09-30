import React from "react";

interface Props {
  isOpen: boolean;
  playlistName: string;
  duplicateCount: number;
  totalCount: number;
  onAddAll: () => void;
  onAddNewOnly?: () => void;
  onCancel: () => void;
}

export default function DuplicateWarningDialog({
  isOpen,
  playlistName,
  duplicateCount,
  totalCount,
  onAddAll,
  onAddNewOnly,
  onCancel,
}: Props) {
  if (!isOpen) return null;

  const isSingle = totalCount === 1;
  const allDuplicates = duplicateCount === totalCount;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-elevated border border-border-medium text-text-primary rounded-2xl p-8 max-w-[460px] w-full shadow-2xl animate-scaleIn">
        <h2 className="text-xl font-bold mb-3 tracking-tight">Already added</h2>

        <p className="text-text-muted text-[15px] leading-relaxed mb-8">
          {isSingle ? (
            <>
              This video is already in your{" "}
              <span className="text-text-primary font-semibold">
                '{playlistName}'
              </span>{" "}
              playlist.
            </>
          ) : (
            <>
              <span className="text-accent font-bold text-lg">
                {duplicateCount}
              </span>{" "}
              of the selected videos are already in your{" "}
              <span className="text-text-primary font-semibold">
                '{playlistName}'
              </span>{" "}
              playlist.
            </>
          )}
        </p>

        <div className="flex items-center justify-end gap-3 flex-wrap">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>

          <div className="flex-1" />

          <button
            onClick={onAddAll}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-text-primary bg-white/10 hover:bg-white/20 transition-colors"
          >
            Add all {totalCount > 1 ? `(${totalCount})` : "anyway"}
          </button>

          {!allDuplicates && onAddNewOnly && (
            <button
              onClick={onAddNewOnly}
              className="btn btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg hover:shadow-accent/20 transition-all active:scale-95"
            >
              Add only new ({totalCount - duplicateCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
