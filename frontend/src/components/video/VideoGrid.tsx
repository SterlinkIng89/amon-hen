import React from "react";
import { VideoFile, VideoGroup } from "../../types";
import VideoCard from "./VideoCard";

interface VideoGridProps {
  folders: string[];
  activeFolders: string[];
  groups: VideoGroup[];
  sortedVideos: VideoFile[];
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenVideo: (sortedIdx: number) => void;
  onUploadTarget: (video: VideoFile) => void;
}

export default function VideoGrid({
  folders,
  activeFolders,
  groups,
  sortedVideos,
  onToggleFolder,
  onRemoveFolder,
  onOpenVideo,
  onUploadTarget,
}: VideoGridProps) {
  return (
    <div className="grid-view">
      {/* Folder Filters */}
      {folders.length > 0 && (
        <div className="folder-filter-bar">
          <span className="folder-filter-label">Library:</span>
          {folders.map(f => {
            const active = activeFolders.includes(f);
            return (
              <div key={f} className={`folder-chip ${active ? "active" : ""}`}>
                <button className="folder-chip-btn" onClick={() => onToggleFolder(f)}>
                  {active && (
                    <svg className="folder-chip-check" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                    </svg>
                  )}
                  {f.split(/\\|\//).pop()}
                </button>
                <button
                  className="folder-chip-remove"
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
        <div className="empty-state">
          {folders.length === 0 ? (
            <>
              <p>No folders added.</p>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Click "Add Folder" to begin.</p>
            </>
          ) : (
            <p>No videos found in active folders.</p>
          )}
        </div>
      ) : (
        <div className="grid-content">
          {groups.map(group => (
            <section key={group.dateKey} className="day-group">
              <div className="day-header">
                <span className="day-label">{group.label}</span>
                <span className="day-count">
                  {group.videos.length} video{group.videos.length !== 1 ? "s" : ""}
                </span>
                <div className="day-line" />
              </div>
              <div className="video-grid">
                {group.videos.map(video => {
                  const sortedIdx = sortedVideos.findIndex(v => v.path === video.path);
                  return (
                    <VideoCard
                      key={video.path}
                      video={video}
                      onClick={() => onOpenVideo(sortedIdx)}
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
