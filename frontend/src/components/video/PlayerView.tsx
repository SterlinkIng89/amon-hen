import React from "react";
import { VideoFile } from "../../types";
import VideoListItem from "./VideoListItem";
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
  onTagSaved,
  onAddToQueue,
}: PlayerViewProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-[310px] flex flex-col border-r border-border-subtle bg-surface shrink-0 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between p-3 border-b border-border-subtle shrink-0">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{sortedVideos.length} videos</span>
          {selectedPaths.length > 0 && (
            <span className="text-[10px] text-accent/80 font-medium">Ctrl+click to select more</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-1.5" ref={listRef}>
          {sortedVideos.map((video, i) => (
            <VideoListItem
              key={video.path}
              video={video}
              index={i}
              selected={i === selectedIndex && selectedPaths.length === 0}
              multiSelected={selectedPaths.includes(video.path)}
              scrollRoot={listRoot}
              onClick={(e) => onVideoClick(i, e)}
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
