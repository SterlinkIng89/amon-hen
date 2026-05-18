import React from "react";
import { VideoFile } from "../../types";
import VideoPill from "./VideoPill";
import InlinePlayer from "./InlinePlayer";
import { QueueItem } from "../youtube/UploadQueue";

interface PlayerViewProps {
  sortedVideos: VideoFile[];
  allVideos: VideoFile[];
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
  allVideos,
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-2.5 custom-scrollbar" ref={listRef}>
          {sortedVideos.map((video) => {
            const absoluteIdx = allVideos.findIndex(v => v.path === video.path);
            return (
              <VideoPill
                key={video.path}
                video={video}
                selected={absoluteIdx === selectedIndex && selectedPaths.length === 0}
                multiSelected={selectedPaths.includes(video.path)}
                viewMode="list"
                compact={true}
                onClick={(e) => onVideoClick(absoluteIdx, e)}
                onUpload={() => onUploadTarget(video)}
              />
            );
          })}
        </div>
      </aside>
      <main className="flex-1 flex flex-col bg-base overflow-hidden relative">
        {selectedVideo ? (() => {
          const currentFilteredIdx = sortedVideos.findIndex(v => v.path === selectedVideo.path);
          
          const handlePrev = () => {
            if (currentFilteredIdx > 0) {
              const prevVideo = sortedVideos[currentFilteredIdx - 1];
              const absIdx = allVideos.findIndex(v => v.path === prevVideo.path);
              onGoTo(absIdx);
            }
          };

          const handleNext = () => {
            if (currentFilteredIdx >= 0 && currentFilteredIdx < sortedVideos.length - 1) {
              const nextVideo = sortedVideos[currentFilteredIdx + 1];
              const absIdx = allVideos.findIndex(v => v.path === nextVideo.path);
              onGoTo(absIdx);
            }
          };

          return (
            <InlinePlayer
              video={selectedVideo}
              streamPort={streamPort}
              onPrev={currentFilteredIdx > 0 ? handlePrev : null}
              onNext={currentFilteredIdx >= 0 && currentFilteredIdx < sortedVideos.length - 1 ? handleNext : null}
              onAddToQueue={onAddToQueue}
              onTagSaved={onTagSaved}
              onDelete={onFilesDeleted}
            />
          );
        })() : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-lg font-medium text-text-muted">Select a video</p>
          </div>
        )}
      </main>
    </div>
  );
}
