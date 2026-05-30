import React from "react";
import { VideoFile } from "../../types";
import { formatSize } from "../../utils/videoUtils";

type SortMode = "date" | "name" | "size";

interface LibrarySubHeaderProps {
  folders: string[];
  activeFolders: string[];
  allVideos: VideoFile[];
  searchQuery: string;
  sortMode: SortMode;
  onSearchChange: (q: string) => void;
  onSortChange: (m: SortMode) => void;
  onToggleFolder: (path: string) => void;
  onOpenFolderSettings: (path: string) => void;
  filterUploaded: boolean;
  onToggleFilterUploaded: () => void;
}

function folderLabel(f: string): string {
  const normalized = f.replace(/[/\\]+$/, "");
  if (/^[a-zA-Z]:$/.test(normalized)) return normalized + "\\";
  const parts = normalized.split(/[/\\]/);
  const last = parts[parts.length - 1];
  return last || normalized;
}

export default function LibrarySubHeader({
  folders,
  activeFolders,
  allVideos,
  searchQuery,
  sortMode,
  onSearchChange,
  onSortChange,
  onToggleFolder,
  onOpenFolderSettings,
  filterUploaded,
  onToggleFilterUploaded,
}: LibrarySubHeaderProps) {
  if (folders.length === 0) return null;

  const totalSize = allVideos.reduce((acc, v) => acc + v.size, 0);
  const uploadedCount = allVideos.filter(v => v.youtubeId).length;
  const pendingCount = allVideos.length - uploadedCount;
  const uploadPct = allVideos.length > 0 ? Math.round((uploadedCount / allVideos.length) * 100) : 0;

  return (
    <div className="flex flex-col border-b border-border-subtle bg-surface/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
      {/* Top Row: Filters & Sort */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Folders */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted">Folders:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {folders.map(f => {
                const active = activeFolders.includes(f);
                return (
                  <div key={f} className={`flex items-center border rounded-lg overflow-hidden transition-all text-xs font-bold h-7 ${active ? "bg-accent text-white shadow-sm border-accent" : "bg-elevated/50 border-border-subtle text-text-secondary hover:text-text-primary"}`}>
                    <button className="flex items-center gap-1.5 px-3 h-full bg-transparent border-none text-inherit cursor-pointer transition-colors" onClick={() => onToggleFolder(f)}>
                      {active && (
                        <svg className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {folderLabel(f)}
                    </button>
                    <button
                      className={`flex items-center justify-center w-7 h-full bg-transparent border-none border-l cursor-pointer transition-colors ${active ? "border-white/20 hover:bg-black/20" : "border-border-subtle hover:bg-border-subtle"}`}
                      onClick={e => { e.stopPropagation(); onOpenFolderSettings(f); }}
                      title="Folder Settings"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                    </button>
                    {active && (
                      <button
                        className="flex items-center justify-center w-7 h-full bg-transparent border-none border-l cursor-pointer transition-colors hover:bg-black/20 border-white/20"
                        onClick={e => { e.stopPropagation(); onToggleFolder(f); }}
                        title="Remove filter"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-4 w-px bg-border-subtle" />

          {/* Search Bar */}
          <div className="relative group">
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" 
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search videos..."
              className="bg-elevated/30 border border-border-subtle rounded-xl pl-9 pr-4 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all w-[240px] placeholder:text-text-muted"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-border-subtle" />

          {/* Uploaded filter chip */}
          <button
            onClick={onToggleFilterUploaded}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterUploaded
                ? "bg-red-500 text-white shadow-sm border-red-500"
                : "bg-elevated/50 border-border-subtle text-text-secondary hover:text-text-primary hover:bg-elevated"
            }`}
            title={filterUploaded ? "Showing only not-uploaded videos" : "Show only videos not yet uploaded"}
          >
            {filterUploaded && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            Hide Uploaded
          </button>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-text-muted">Sort by:</span>
          <select
            className="bg-elevated/50 border border-border-subtle rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:border-accent transition-colors cursor-pointer"
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as SortMode)}
          >
            <option value="date">Date</option>
            <option value="name">A-Z Name</option>
            <option value="size">Size</option>
          </select>
        </div>
      </div>

      {/* Bottom Row: Stats */}
      {allVideos.length > 0 && (
        <div className="flex items-center gap-4 px-6 py-2 bg-elevated/30 border-t border-border-subtle text-xs text-text-secondary overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-text-primary">{allVideos.length}</span>
            <span>videos</span>
          </div>

          <div className="w-px h-3 bg-border-subtle shrink-0" />

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-text-primary">{formatSize(totalSize)}</span>
            <span>on disk</span>
          </div>

          <div className="w-px h-3 bg-border-subtle shrink-0" />

          <div className="flex items-center gap-2 shrink-0">
            <span>
              <span className="font-bold text-text-primary">{uploadedCount}</span>
              <span className="text-text-muted"> / {allVideos.length} uploaded</span>
            </span>
            <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden border border-border-subtle">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${uploadPct}%`,
                  background: uploadPct === 100 ? "var(--color-green-400, #4ade80)" : "var(--accent)",
                }}
              />
            </div>
            <span className="font-mono text-text-muted">{uploadPct}%</span>
          </div>

          {pendingCount > 0 && (
            <>
              <div className="w-px h-3 bg-border-subtle shrink-0" />
              <div className="flex items-center gap-1.5 shrink-0 text-amber-500 font-medium">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{pendingCount} pending</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
