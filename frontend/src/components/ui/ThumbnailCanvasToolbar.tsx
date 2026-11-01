import React from "react";

export interface ThumbnailCanvasToolbarProps {
  readonly hasBaseImage: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly snapEnabled: boolean;
  readonly showGrid: boolean;
  readonly showSafeZone: boolean;
  readonly onCenterArtwork: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onToggleSnap: () => void;
  readonly onToggleGrid: () => void;
  readonly onToggleSafeZone: () => void;
}

export default function ThumbnailCanvasToolbar({
  hasBaseImage,
  canUndo,
  canRedo,
  snapEnabled,
  showGrid,
  showSafeZone,
  onCenterArtwork,
  onUndo,
  onRedo,
  onToggleSnap,
  onToggleGrid,
  onToggleSafeZone,
}: ThumbnailCanvasToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-1.5 text-xs select-none flex-wrap">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Center artwork"
          title="Center the background artwork (offset 50%, 50%)"
          disabled={!hasBaseImage}
          onClick={onCenterArtwork}
          className="btn btn-secondary btn-xs text-[11px] font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="22" y1="12" x2="18" y2="12" />
            <line x1="6" y1="12" x2="2" y2="12" />
            <line x1="12" y1="6" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="18" />
          </svg>
          <span>Center art</span>
        </button>

        <button
          type="button"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
          className="btn btn-secondary btn-xs text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>Undo</span>
        </button>

        <button
          type="button"
          aria-label="Redo"
          title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={onRedo}
          className="btn btn-secondary btn-xs text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Redo</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Toggle magnetic grid snap"
          title="Toggle magnetic grid snap (or hold Alt while dragging)"
          onClick={onToggleSnap}
          className={`btn btn-xs text-[11px] font-medium transition-colors cursor-pointer ${
            snapEnabled
              ? "btn-secondary text-accent border border-accent/40 bg-accent/15"
              : "btn-secondary text-text-muted hover:text-white"
          }`}
        >
          Snap: {snapEnabled ? "On" : "Off"}
        </button>
        <button
          type="button"
          aria-label="Show or hide 3x3 alignment grid"
          title="Show or hide 3x3 alignment grid"
          onClick={onToggleGrid}
          className={`btn btn-xs text-[11px] font-medium transition-colors cursor-pointer ${
            showGrid
              ? "btn-secondary text-accent border border-accent/40 bg-accent/15"
              : "btn-secondary text-text-muted hover:text-white"
          }`}
        >
          Grid: {showGrid ? "On" : "Off"}
        </button>
        <button
          type="button"
          aria-label="Toggle YouTube timestamp safe zone overlay"
          title="Toggle YouTube timestamp safe zone (bottom-right 14% area)"
          onClick={onToggleSafeZone}
          className={`btn btn-xs text-[11px] font-medium transition-colors cursor-pointer ${
            showSafeZone
              ? "btn-secondary text-accent border border-accent/40 bg-accent/15"
              : "btn-secondary text-text-muted hover:text-white"
          }`}
        >
          Safe zone: {showSafeZone ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}
