import React, { useState, useEffect } from "react";
import { VideoFile, VideoGroup, GameProfile } from "../../types";
import VideoPill from "./VideoPill";
import { useAppStore } from "../../store/useAppStore";
import { formatSize } from "../../utils/videoUtils";
import { LoadConfig } from "../../../wailsjs/go/backend/App";

type SortMode = "date" | "name" | "size";

interface VideoGridProps {
  folders: string[];
  activeFolders: string[];
  groups: VideoGroup[];
  allVideos: VideoFile[];       // unfiltered, for stats
  sortedVideos: VideoFile[];    // already sorted by Dashboard
  sortMode: SortMode;
  selectedPaths: string[];
  onOpenVideo: (sortedIdx: number, e: React.MouseEvent) => void;
  onUploadTarget: (video: VideoFile) => void;
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

/** Empty state illustration + message */
function EmptyState({ hasFolders }: { hasFolders: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16 px-8 select-none">
      {/* Illustration */}
      <div className="relative">
        {/* Glow behind icon */}
        <div className="absolute inset-0 rounded-full blur-2xl opacity-20 bg-accent scale-150" />
        <div className="relative w-24 h-24 rounded-2xl bg-elevated border border-border-subtle flex items-center justify-center shadow-xl">
          {hasFolders ? (
            /* Search/filter empty: magnifying glass */
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" strokeWidth="1" className="opacity-40" />
            </svg>
          ) : (
            /* No folders: folder with plus */
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          )}
        </div>
      </div>

      {/* Text */}
      <div className="text-center flex flex-col gap-1.5 max-w-xs">
        <p className="text-text-primary font-semibold text-base">
          {hasFolders ? "No videos found" : "No folders added"}
        </p>
        <p className="text-text-muted text-sm leading-relaxed">
          {hasFolders
            ? "Try adjusting your search or filters to find what you're looking for."
            : "Add a folder to start managing and uploading your videos."}
        </p>
      </div>

      {/* Decorative dots */}
      <div className="flex items-center gap-1.5 opacity-30">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-text-muted"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Date group section header — pill label + video count + group size */
function GroupHeader({ group }: { group: VideoGroup }) {
  const groupSize = group.videos.reduce((acc, v) => acc + v.size, 0);

  return (
    <div className="flex items-center gap-3 mb-4">
      {/* Date pill */}
      <div className="flex items-center gap-2 bg-elevated border border-border-subtle rounded-full px-3 py-0.5 shrink-0">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="font-bold text-text-primary text-[13px]">{group.label}</span>
      </div>

      {/* Count badge */}
      <span className="text-xs text-text-muted font-semibold bg-elevated/80 border border-border-subtle px-2 py-0.5 rounded-full shrink-0">
        {group.videos.length} video{group.videos.length !== 1 ? "s" : ""}
      </span>

      {/* Group size badge */}
      <span className="text-xs text-text-muted font-medium bg-elevated/50 border border-border-subtle px-2 py-0.5 rounded-full shrink-0">
        {formatSize(groupSize)}
      </span>

      {/* Gradient divider */}
      <div
        className="flex-1 h-px shrink-0"
        style={{
          background: "linear-gradient(to right, rgba(255,255,255,0.07) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}

export default function VideoGrid({
  folders,
  activeFolders,
  groups,
  allVideos,
  sortedVideos,
  sortMode,
  selectedPaths,
  onOpenVideo,
  onUploadTarget,
}: VideoGridProps) {
  // Only use date-grouped layout when sorting by date
  const useGroups = sortMode === "date" && groups.length > 0;
  const { queue } = useAppStore();

  const getUploadProgress = (path: string): number | undefined => {
    const item = queue.find(q => q.videoPath === path && q.status === "uploading");
    return item ? item.progress : undefined;
  };

  const [gameProfiles, setGameProfiles] = useState<Record<string, GameProfile>>({});
  useEffect(() => {
    LoadConfig().then(cfg => {
      setGameProfiles(cfg.game_profiles || {});
    }).catch(() => {});
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base relative">
      {sortedVideos.length === 0 ? (
        <EmptyState hasFolders={folders.length > 0} />
      ) : useGroups ? (
        /* Date-grouped layout */
        <div className="flex-1 overflow-y-auto p-5 pb-10">
          {groups.map(group => (
            <section key={group.dateKey} className="mb-8 last:mb-0">
              <GroupHeader group={group} />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(213px,1fr))] gap-5">
                {group.videos.map(video => {
                  const sortedIdx = sortedVideos.findIndex(v => v.path === video.path);
                  const isSelected = selectedPaths.includes(video.path);
                  return (
                    <VideoPill
                      key={video.path}
                      video={video}
                      selected={isSelected}
                      multiSelected={isSelected}
                      onClick={(e) => onOpenVideo(sortedIdx, e)}
                      onUpload={() => onUploadTarget(video)}
                      uploadProgress={getUploadProgress(video.path)}
                      gameProfiles={gameProfiles}
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
            {sortedVideos.map((video, idx) => {
              const isSelected = selectedPaths.includes(video.path);
              return (
                <VideoPill
                  key={video.path}
                  video={video}
                  selected={isSelected}
                  multiSelected={isSelected}
                  onClick={(e) => onOpenVideo(idx, e)}
                  onUpload={() => onUploadTarget(video)}
                  uploadProgress={getUploadProgress(video.path)}
                  gameProfiles={gameProfiles}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
