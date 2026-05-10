import React from "react";
import { ViewMode } from "../../types";



interface AppHeaderProps {
  view: ViewMode;
  foldersCount: number;
  scanning: boolean;
  pendingCount: number;
  ytAuthed: boolean;
  onSetView: (view: ViewMode) => void;
  onRescan: () => void;
  onToggleQueue: () => void;
  onOpenSettings: () => void;
  onAddFolder: () => void;
}

export default function AppHeader({
  view,
  foldersCount,
  scanning,
  pendingCount,
  ytAuthed,
  onSetView,
  onRescan,
  onToggleQueue,
  onOpenSettings,
  onAddFolder,
}: AppHeaderProps) {
  const headerLeft = view === "player" ? (
    <button className="flex items-center gap-[7px] py-[5px] pr-3 pl-2 bg-elevated border border-border-subtle rounded-sm text-text-secondary text-xs font-medium font-sans cursor-pointer transition-colors hover:bg-card hover:text-text-primary hover:border-border-medium shrink-0" onClick={() => onSetView("grid")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
      <span className="leading-none">Library</span>
    </button>
  ) : (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-sm font-bold text-text-primary tracking-tight">Library</span>
    </div>
  );

  return (
    <header className="flex items-center justify-between px-4 h-header shrink-0 bg-surface border-b border-border-subtle gap-2.5 z-10">
      {headerLeft}
      <div className="flex items-center gap-[7px] flex-1 justify-end min-w-0">
        {foldersCount > 0 && !scanning && (
          <button className="btn btn-ghost" onClick={onRescan}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
            Rescan
          </button>
        )}
        <button className="btn btn-ghost relative" onClick={onToggleQueue}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
          Queue
          {pendingCount > 0 && <span className="bg-accent text-white text-[9px] font-bold py-[2px] px-[5px] rounded-sm ml-1 leading-none">{pendingCount}</span>}
        </button>
        <button className="btn btn-ghost relative" onClick={onOpenSettings}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
          {ytAuthed && <span className="absolute top-[5px] right-[5px] w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_4px_rgba(74,222,128,0.6)]" title="YouTube connected" />}
        </button>
        <button className="btn btn-primary" onClick={onAddFolder} disabled={scanning}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
          {scanning ? "Scanning..." : "Add Folder"}
        </button>
      </div>
    </header>
  );
}
