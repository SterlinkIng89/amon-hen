import React, { useState } from "react";
import { VideoFile, VideoGroup } from "../../types";
import VideoPill from "./VideoPill";
import StatsBar from "./StatsBar";

type SortMode = "date" | "name" | "size";

interface VideoGridProps {
  folders: string[];
  activeFolders: string[];
  groups: VideoGroup[];
  allVideos: VideoFile[];       // unfiltered, for stats
  sortedVideos: VideoFile[];    // already sorted by Dashboard
  selectedPaths: string[];
  searchQuery: string;
  sortMode: SortMode;
  onSearchChange: (q: string) => void;
  onSortChange: (m: SortMode) => void;
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenVideo: (sortedIdx: number, e: React.MouseEvent) => void;
  onUploadTarget: (video: VideoFile) => void;
  filterUploaded: boolean;
  onToggleFilterUploaded: () => void;
}

/** Returns a human-readable label for a folder path. */
function folderLabel(f: string): string {
  const normalized = f.replace(/[/\\]+$/, "");
  if (/^[a-zA-Z]:$/.test(normalized)) return normalized + "\\";
  const parts = normalized.split(/[/\\]/);
  const last = parts[parts.length - 1];
  return last || normalized;
}

const SORT_LABELS: Record<SortMode, string> = {
  date: "Date",
  name: "Name",
  size: "Size",
};

export default function VideoGrid({
  folders,
  activeFolders,
  groups,
  allVideos,
  sortedVideos,
  selectedPaths,
  searchQuery,
  sortMode,
  onSearchChange,
  onSortChange,
  onToggleFolder,
  onRemoveFolder,
  onOpenVideo,
  onUploadTarget,
  filterUploaded,
  onToggleFilterUploaded,
}: VideoGridProps) {
  const showFilterBar = folders.length > 0;
  const [sortOpen, setSortOpen] = useState(false);

  // When sort is not date, flatten into a single list (no grouping by day)
  const useGroups = sortMode === "date";

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      {/* Filter bar */}
      {showFilterBar && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border-b border-border-subtle shrink-0">
          {/* Search input */}
          <div className="relative flex items-center shrink-0">
            <svg className="absolute left-2.5 text-text-muted pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              id="video-search"
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search videos..."
              className="h-6 pl-7 pr-6 text-xs bg-elevated border border-border-subtle rounded-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent transition-colors w-[180px] focus:w-[240px] duration-200"
            />
            {searchQuery && (
              <button
                className="absolute right-1.5 text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                onClick={() => onSearchChange("")}
                title="Clear search"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-border-subtle mx-0.5" />

          <span className="text-xs font-semibold text-text-secondary mr-1">Folders:</span>
          {folders.map(f => {
            const active = activeFolders.includes(f);
            return (
              <div key={f} className={`flex items-center border rounded-sm overflow-hidden transition-all text-xs font-medium h-6 ${active ? "bg-accent-dim border-border-accent text-accent" : "bg-elevated border-border-subtle text-text-secondary"}`}>
                <button className="flex items-center gap-1.5 px-2.5 h-full bg-transparent border-none text-inherit cursor-pointer hover:bg-black/10" onClick={() => onToggleFolder(f)}>
                  {active && (
                    <svg className="text-accent shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                    </svg>
                  )}
                  {folderLabel(f)}
                </button>
                <button
                  className={`flex items-center justify-center w-6 h-full bg-transparent border-none border-l cursor-pointer transition-colors hover:bg-red-500/10 hover:text-red-400 ${active ? "border-border-accent/40" : "border-border-subtle"}`}
                  onClick={e => { e.stopPropagation(); onRemoveFolder(f); }}
                  title="Remove folder"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            );
          })}

          <div className="w-px h-4 bg-border-subtle mx-0.5" />

          {/* Uploaded filter chip */}
          <button
            onClick={onToggleFilterUploaded}
            className={`flex items-center gap-1.5 px-2.5 h-6 border rounded-sm text-xs font-medium transition-all cursor-pointer ${
              filterUploaded
                ? "bg-red-500/10 border-red-500/40 text-red-400"
                : "bg-elevated border-border-subtle text-text-secondary hover:border-border-medium"
            }`}
            title={filterUploaded ? "Showing only not-uploaded videos" : "Show only videos not yet uploaded"}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
            </svg>
            {filterUploaded ? "Not uploaded only" : "All videos"}
          </button>

          {/* Sort selector */}
          <div className="relative ml-auto">
            <button
              onClick={() => setSortOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 h-6 border rounded-sm text-xs font-medium bg-elevated border-border-subtle text-text-secondary hover:border-border-medium transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/>
              </svg>
              Sort: {SORT_LABELS[sortMode]}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className={`transition-transform ${sortOpen ? "rotate-180" : ""}`}>
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-card border border-border-medium rounded-md shadow-xl z-50 min-w-[110px] overflow-hidden animate-fadeIn">
                  {(["date", "name", "size"] as SortMode[]).map(m => (
                    <button
                      key={m}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-accent/10 ${sortMode === m ? "text-accent bg-accent/5" : "text-text-primary"}`}
                      onClick={() => { onSortChange(m); setSortOpen(false); }}
                    >
                      {SORT_LABELS[m]}
                      {sortMode === m && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="inline ml-1.5 text-accent">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {allVideos.length > 0 && <StatsBar videos={allVideos} />}

      {/* Search results count */}
      {searchQuery && sortedVideos.length > 0 && (
        <div className="px-4 py-1.5 text-[11px] text-text-muted bg-base border-b border-border-subtle shrink-0">
          {sortedVideos.length} result{sortedVideos.length !== 1 ? "s" : ""} for <span className="text-text-primary font-semibold">"{searchQuery}"</span>
        </div>
      )}

      {sortedVideos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-sm">
          {folders.length === 0 ? (
            <>
              <p>No folders added.</p>
              <p className="text-[12px] text-text-muted mt-1">Click "Add Folder" to begin.</p>
            </>
          ) : searchQuery ? (
            <p>No results for "{searchQuery}"</p>
          ) : filterUploaded ? (
            <p>All videos in this folder are already uploaded.</p>
          ) : (
            <p>No videos found in active folders.</p>
          )}
        </div>
      ) : useGroups ? (
        /* Date-grouped layout */
        <div className="flex-1 overflow-y-auto p-5 pb-10">
          {groups.map(group => (
            <section key={group.dateKey} className="mb-8 last:mb-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-bold text-text-primary text-base">{group.label}</span>
                <span className="text-xs text-text-muted font-medium bg-elevated px-2 py-0.5 rounded-sm">
                  {group.videos.length} video{group.videos.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(213px,1fr))] gap-5">
                {group.videos.map(video => {
                  const sortedIdx = sortedVideos.findIndex(v => v.path === video.path);
                  const selected = selectedPaths.includes(video.path);
                  return (
                    <VideoPill
                      key={video.path}
                      video={video}
                      selected={selected}
                      onClick={(e) => onOpenVideo(sortedIdx, e)}
                      onUpload={() => onUploadTarget(video)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* Flat layout for name/size sort */
        <div className="flex-1 overflow-y-auto p-5 pb-10">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(213px,1fr))] gap-5">
            {sortedVideos.map((video, sortedIdx) => {
              const selected = selectedPaths.includes(video.path);
              return (
                <VideoPill
                  key={video.path}
                  video={video}
                  selected={selected}
                  onClick={(e) => onOpenVideo(sortedIdx, e)}
                  onUpload={() => onUploadTarget(video)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
