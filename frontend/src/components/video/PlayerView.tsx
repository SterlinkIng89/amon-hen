import React from "react";
import { VideoFile } from "../../types";
import VideoPill from "./VideoPill";
import InlinePlayer from "./InlinePlayer";
import { QueueItem } from "../youtube/UploadQueue";

interface PlayerViewProps {
  sortedVideos: VideoFile[];
  selectedVideo: VideoFile | null;
  selectedIndex: number;
  streamPort: number;
  listRef: React.RefObject<HTMLDivElement>;
  listRoot: HTMLElement | null;
  selectedPaths: string[];
  onGoTo: (index: number) => void;
  onVideoClick: (sortedIdx: number, e: React.MouseEvent) => void;
  onUploadTarget: (video: VideoFile) => void;
  onTagSaved?: () => void;
  onFilesDeleted?: () => void;
  onAddToQueue: (item: QueueItem) => void;
}

export default function PlayerView({
  sortedVideos,
  selectedVideo,
  selectedIndex,
  streamPort,
  listRef,
  listRoot,
  selectedPaths,
  onGoTo,
  onVideoClick,
  onUploadTarget,
  onTagSaved,
  onFilesDeleted,
  onAddToQueue,
}: PlayerViewProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-[360px] flex flex-col border-r border-border-subtle bg-surface shrink-0 z-10">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent/10 rounded-lg text-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
            </div>
            <span className="text-xs font-bold text-text-primary uppercase tracking-widest">Library</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-elevated rounded-full text-[10px] font-bold text-text-secondary border border-border-subtle">
              {sortedVideos.length}
            </span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-2.5 custom-scrollbar" ref={listRef}>
          {sortedVideos.map((video, i) => (
            <VideoPill
              key={video.path}
              video={video}
              selected={i === selectedIndex && selectedPaths.length === 0}
              multiSelected={selectedPaths.includes(video.path)}
              viewMode="list"
              compact={true}
              onClick={(e) => onVideoClick(i, e)}
              onUpload={() => onUploadTarget(video)}
            />
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col bg-base overflow-hidden relative">
        {selectedVideo ? (
          <InlinePlayer
            video={selectedVideo}
            streamPort={streamPort}
            onPrev={selectedIndex > 0 ? () => onGoTo(selectedIndex - 1) : null}
            onNext={selectedIndex < sortedVideos.length - 1 ? () => onGoTo(selectedIndex + 1) : null}
            onAddToQueue={onAddToQueue}
            onTagSaved={onTagSaved}
            onDelete={onFilesDeleted}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-lg font-medium text-text-muted">Select a video</p>
          </div>
        )}
      </main>
    </div>
  );
}
