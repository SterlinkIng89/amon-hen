import React from "react";
import { VideoFile, VideoGroup } from "../../types";
import VideoCard from "./VideoCard";

interface VideoGridProps {
  folders: string[];
  activeFolders: string[];
  groups: VideoGroup[];
  sortedVideos: VideoFile[];
  selectedPaths: string[];
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenVideo: (sortedIdx: number, e: React.MouseEvent) => void;
  onUploadTarget: (video: VideoFile) => void;
}

export default function VideoGrid({
  folders,
  activeFolders,
  groups,
  sortedVideos,
  selectedPaths,
  onToggleFolder,
  onRemoveFolder,
  onOpenVideo,
  onUploadTarget,
}: VideoGridProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      {/* Folder Filters */}
      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border-b border-border-subtle shrink-0">
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
                  {f.split(/\\|\//).pop()}
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
        </div>
      )}

      {groups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-sm">
          {folders.length === 0 ? (
            <>
              <p>No folders added.</p>
              <p className="text-[12px] text-text-muted mt-1">Click "Add Folder" to begin.</p>
            </>
          ) : (
            <p>No videos found in active folders.</p>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 pb-10">
          {groups.map(group => (
            <section key={group.dateKey} className="mb-8 last:mb-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-bold text-text-primary text-base tracking-wide">{group.label}</span>
                <span className="text-xs text-text-muted font-medium bg-elevated px-2 py-0.5 rounded-sm">
                  {group.videos.length} video{group.videos.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {group.videos.map(video => {
                  const sortedIdx = sortedVideos.findIndex(v => v.path === video.path);
                  const selected = selectedPaths.includes(video.path);
                  return (
                    <VideoCard
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
      )}
    </div>
  );
}
