import React from "react";
import { VideoFile, GameProfile } from "../../types";
import VideoPill from "./VideoPill";
import InlinePlayer from "./InlinePlayer";
import { QueueItem } from "../youtube/UploadQueue";
import { useAppStore } from "../../store/useAppStore";

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
 const { queue } = useAppStore();
 const [gameProfiles, setGameProfiles] = React.useState<Record<string, GameProfile>>({});

 React.useEffect(() => {
 import("../../../wailsjs/go/backend/App").then(({ LoadConfig }) => {
 LoadConfig().then((cfg: any) => {
 setGameProfiles(cfg.game_profiles || {});
 }).catch(() => {});
 });
 }, []);

 const getUploadProgress = (path: string): number | undefined => {
 const item = queue.find(q => q.videoPath === path && q.status === "uploading");
 return item ? item.progress : undefined;
 };
 return (
 <div className="flex-1 flex overflow-hidden">
 <aside className="w-[360px] flex flex-col border-r border-border-subtle bg-surface shrink-0 z-10">
 <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-2.5 custom-scrollbar" ref={listRef}>
 {sortedVideos.map((video, idx) => {
 return (
 <VideoPill
 key={video.path}
 video={video}
 selected={Boolean(selectedVideo && video.path === selectedVideo.path && selectedPaths.length === 0)}
 multiSelected={selectedPaths.includes(video.path)}
 viewMode="list"
 compact={true}
 onClick={(e) => onVideoClick(idx, e)}
 onUpload={() => onUploadTarget(video)}
 uploadProgress={getUploadProgress(video.path)}
 gameProfiles={gameProfiles}
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
 const sortedIdx = allVideos.findIndex(v => v.path === prevVideo.path);
 if (sortedIdx !== -1) onGoTo(sortedIdx);
 }
 };

 const handleNext = () => {
 if (currentFilteredIdx >= 0 && currentFilteredIdx < sortedVideos.length - 1) {
 const nextVideo = sortedVideos[currentFilteredIdx + 1];
 const sortedIdx = allVideos.findIndex(v => v.path === nextVideo.path);
 if (sortedIdx !== -1) onGoTo(sortedIdx);
 }
 };

 return (
 <InlinePlayer
 video={selectedVideo}
 streamPort={streamPort}
 selectedPaths={selectedPaths}
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
