import React from "react";
import { VideoFile } from "../types";
import VideoListItem from "./video/VideoListItem";
import InlinePlayer from "./video/InlinePlayer";

interface PlayerViewProps {
  sortedVideos: VideoFile[];
  selectedVideo: VideoFile | null;
  selectedIndex: number;
  streamPort: number;
  listRef: React.RefObject<HTMLDivElement>;
  listRoot: HTMLElement | null;
  onGoTo: (index: number) => void;
  onUploadTarget: (video: VideoFile) => void;
}

export default function PlayerView({
  sortedVideos,
  selectedVideo,
  selectedIndex,
  streamPort,
  listRef,
  listRoot,
  onGoTo,
  onUploadTarget,
}: PlayerViewProps) {
  return (
    <div className="split-layout">
      <aside className="split-left">
        <div className="split-left-header">
          <span className="split-count">{sortedVideos.length} videos</span>
        </div>
        <div className="video-list" ref={listRef}>
          {sortedVideos.map((video, i) => (
            <VideoListItem
              key={video.path}
              video={video}
              index={i}
              selected={i === selectedIndex}
              scrollRoot={listRoot}
              onClick={() => onGoTo(i)}
            />
          ))}
        </div>
      </aside>
      <main className="split-right">
        {selectedVideo ? (
          <InlinePlayer
            video={selectedVideo}
            streamPort={streamPort}
            onPrev={selectedIndex > 0 ? () => onGoTo(selectedIndex - 1) : null}
            onNext={
              selectedIndex < sortedVideos.length - 1
                ? () => onGoTo(selectedIndex + 1)
                : null
            }
            onUpload={() => onUploadTarget(selectedVideo)}
          />
        ) : (
          <div className="player-placeholder">
            <p className="placeholder-title">Select a video</p>
          </div>
        )}
      </main>
    </div>
  );
}
