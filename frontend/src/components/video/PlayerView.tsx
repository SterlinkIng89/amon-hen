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

const STORAGE_LIST_COLLAPSED_KEY = "player_list_collapsed";

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
  const { queue, setView } = useAppStore();
  const [isListCollapsed, setIsListCollapsed] = React.useState<boolean>(
    () => localStorage.getItem(STORAGE_LIST_COLLAPSED_KEY) === "true",
  );

  React.useEffect(() => {
    localStorage.setItem(STORAGE_LIST_COLLAPSED_KEY, String(isListCollapsed));
  }, [isListCollapsed]);

  const [gameProfiles, setGameProfiles] = React.useState<
    Record<string, GameProfile>
  >({});

  React.useEffect(() => {
    import("../../../wailsjs/go/backend/App").then(({ LoadConfig }) => {
      LoadConfig()
        .then((cfg: any) => {
          setGameProfiles(cfg.game_profiles || {});
        })
        .catch(() => {});
    });
  }, []);

  const uploadingProgressMap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of queue) {
      if (item.status === "uploading") {
        map.set(item.videoPath, item.progress);
      }
    }
    return map;
  }, [queue]);

  const queuedPathsSet = React.useMemo(
    () =>
      new Set(
        queue
          .filter((item) => item.status === "pending")
          .map((item) => item.videoPath),
      ),
    [queue],
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside
        className={`${
          isListCollapsed
            ? "w-12 items-center py-3"
            : "w-[300px] xl:w-[340px] 2xl:w-[360px]"
        } flex flex-col border-r border-border-subtle bg-surface shrink-0 z-10 transition-all duration-200`}
      >
        {isListCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setView("grid")}
              className="p-2 text-text-muted hover:text-text-main hover:bg-surface-elevated rounded transition-colors"
              title="Back to Grid"
              aria-label="Back to Grid"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsListCollapsed(false)}
              className="p-2 text-text-muted hover:text-text-main hover:bg-surface-elevated rounded transition-colors"
              title="Expand video list"
              aria-label="Expand video list"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
              <button
                type="button"
                onClick={() => setView("grid")}
                className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors px-2 py-1 rounded hover:bg-surface-elevated"
                title="Back to Grid"
                aria-label="Back to Grid"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back to Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setIsListCollapsed(true)}
                className="p-1.5 text-text-muted hover:text-text-main hover:bg-surface-elevated rounded transition-colors"
                title="Collapse video list"
                aria-label="Collapse video list"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-2.5 custom-scrollbar"
              ref={listRef}
            >
              {sortedVideos.map((video, idx) => {
                return (
                  <VideoPill
                    key={video.path}
                    video={video}
                    selected={Boolean(
                      selectedVideo &&
                      video.path === selectedVideo.path &&
                      selectedPaths.length === 0,
                    )}
                    multiSelected={selectedPaths.includes(video.path)}
                    viewMode="list"
                    compact={true}
                    onClick={(e) => onVideoClick(idx, e)}
                    onUpload={() => onUploadTarget(video)}
                    uploadProgress={uploadingProgressMap.get(video.path)}
                    gameProfiles={gameProfiles}
                    isQueued={queuedPathsSet.has(video.path)}
                  />
                );
              })}
            </div>
          </>
        )}
      </aside>
      <main className="flex-1 flex flex-col bg-base overflow-hidden relative">
        {selectedVideo ? (
          (() => {
            const currentFilteredIdx = sortedVideos.findIndex(
              (v) => v.path === selectedVideo.path,
            );

            const handlePrev = () => {
              if (currentFilteredIdx > 0) {
                const prevVideo = sortedVideos[currentFilteredIdx - 1];
                const sortedIdx = allVideos.findIndex(
                  (v) => v.path === prevVideo.path,
                );
                if (sortedIdx !== -1) onGoTo(sortedIdx);
              }
            };

            const handleNext = () => {
              if (
                currentFilteredIdx >= 0 &&
                currentFilteredIdx < sortedVideos.length - 1
              ) {
                const nextVideo = sortedVideos[currentFilteredIdx + 1];
                const sortedIdx = allVideos.findIndex(
                  (v) => v.path === nextVideo.path,
                );
                if (sortedIdx !== -1) onGoTo(sortedIdx);
              }
            };

            return (
              <InlinePlayer
                video={selectedVideo}
                streamPort={streamPort}
                selectedPaths={selectedPaths}
                onPrev={currentFilteredIdx > 0 ? handlePrev : null}
                onNext={
                  currentFilteredIdx >= 0 &&
                  currentFilteredIdx < sortedVideos.length - 1
                    ? handleNext
                    : null
                }
                onAddToQueue={onAddToQueue}
                onTagSaved={onTagSaved}
                onDelete={onFilesDeleted}
              />
            );
          })()
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-lg font-medium text-text-muted">
              Select a video
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
