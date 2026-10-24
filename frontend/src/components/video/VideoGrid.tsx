import React, { useState, useEffect, useMemo } from "react";
import {
  VideoFile,
  VideoGroup,
  GameProfile,
  SortMode,
  LibraryGroupMode,
  CardDensity,
  CARD_DENSITY_CLASSES,
} from "../../types";
import VideoPill from "./VideoPill";
import { useAppStore } from "../../store/useAppStore";
import { formatSize } from "../../utils/videoUtils";
import { LoadConfig } from "../../../wailsjs/go/backend/App";


interface VideoGridProps {
  folders: string[];
  activeFolders: string[];
  groups: VideoGroup[];
  allVideos: VideoFile[]; // unfiltered, for stats
  sortedVideos: VideoFile[]; // already sorted by Dashboard
  sortMode: SortMode;
  groupMode?: LibraryGroupMode;
  readonly cardDensity?: CardDensity;
  selectedPaths: string[];
  onOpenVideo: (sortedIdx: number, e: React.MouseEvent) => void;
  onSelectToggle?: (sortedIdx: number) => void;
  readonly onSelectGroup?: (paths: string[], select: boolean) => void;
  onUploadTarget: (video: VideoFile) => void;
  readonly onQuickQueue?: (video: VideoFile) => void;
  readonly onOpenInExplorer?: (video: VideoFile) => void;
}

const SORT_LABELS: Record<SortMode, string> = {
  date: "Date",
  name: "Name",
  size: "Size",
  duration: "Duration",
  episode: "Episode",
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
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-muted"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line
                x1="8"
                y1="11"
                x2="14"
                y2="11"
                strokeWidth="1"
                className="opacity-40"
              />
            </svg>
          ) : (
            /* No folders: folder with plus */
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-muted"
            >
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
        {[0, 1, 2].map((i) => (
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

interface GroupHeaderProps {
  readonly group: VideoGroup;
  readonly allSelected: boolean;
  readonly partiallySelected: boolean;
  readonly collapsed: boolean;
  readonly onToggleSelectGroup: () => void;
  readonly onToggleCollapse: () => void;
}

/** Date group section header — checkbox + pill label + video count + group size + collapse toggle */
function GroupHeader({
  group,
  allSelected,
  partiallySelected,
  collapsed,
  onToggleSelectGroup,
  onToggleCollapse,
}: GroupHeaderProps) {
  const groupSize = group.videos.reduce((acc, v) => acc + v.size, 0);

  return (
    <div className="flex items-center gap-3 mb-4">
      {/* Group selection checkbox */}
      <button
        type="button"
        onClick={onToggleSelectGroup}
        aria-label={`Select all videos in ${group.label}`}
        title={allSelected ? "Deselect group" : "Select group"}
        className={`w-5 h-5 rounded border shadow-xs flex items-center justify-center transition-all cursor-pointer shrink-0 ${
          allSelected || partiallySelected
            ? "bg-accent border-accent text-white"
            : "bg-elevated border-border-subtle text-transparent hover:border-border-medium"
        }`}
      >
        {allSelected ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : partiallySelected ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ) : null}
      </button>

      {/* Date pill */}
      <div className="flex items-center gap-2 bg-elevated border border-border-subtle rounded-full px-3 py-0.5 shrink-0">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent shrink-0"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="font-bold text-text-primary text-[13px]">
          {group.label}
        </span>
      </div>

      {/* Count badge */}
      <span className="text-xs text-text-muted font-semibold bg-elevated/80 border border-border-subtle px-2 py-0.5 rounded-full shrink-0">
        {group.videos.length} video{group.videos.length !== 1 ? "s" : ""}
      </span>

      {/* Group size badge */}
      <span className="text-xs text-text-muted font-medium bg-elevated/50 border border-border-subtle px-2 py-0.5 rounded-full shrink-0">
        {formatSize(groupSize)}
      </span>

      {/* Collapse / Expand toggle button */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={
          collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`
        }
        title={collapsed ? "Expand group" : "Collapse group"}
        className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated/80 transition-colors cursor-pointer shrink-0"
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
          className={`transition-transform duration-200 ${
            collapsed ? "-rotate-90" : "rotate-0"
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Gradient divider */}
      <div
        className="flex-1 h-px shrink-0"
        style={{
          background:
            "linear-gradient(to right, rgba(255,255,255,0.07) 0%, transparent 100%)",
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
  groupMode: propGroupMode,
  cardDensity: propCardDensity,
  selectedPaths,
  onOpenVideo,
  onSelectToggle,
  onSelectGroup,
  onUploadTarget,
  onQuickQueue,
  onOpenInExplorer,
}: VideoGridProps) {
  const {
    queue,
    groupMode: storeGroupMode,
    cardDensity: storeCardDensity,
  } = useAppStore();
  const effectiveGroupMode = propGroupMode ?? storeGroupMode ?? "date";
  const effectiveCardDensity = propCardDensity ?? storeCardDensity ?? "default";
  const densityClass =
    CARD_DENSITY_CLASSES[effectiveCardDensity] ?? CARD_DENSITY_CLASSES.default;
  const useGroups = effectiveGroupMode !== "none" && groups.length > 0;
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});

  const handleToggleCollapse = (dateKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const uploadingProgressMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of queue) {
      if (item.status === "uploading") {
        map.set(item.videoPath, item.progress);
      }
    }
    return map;
  }, [queue]);

  const queuedPathsSet = useMemo(
    () =>
      new Set(
        queue
          .filter((item) => item.status === "pending")
          .map((item) => item.videoPath),
      ),
    [queue],
  );

  const sortedIdxMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedVideos.forEach((v, i) => map.set(v.path, i));
    return map;
  }, [sortedVideos]);

  const selectedPathsSet = useMemo(
    () => new Set(selectedPaths),
    [selectedPaths],
  );

  const [gameProfiles, setGameProfiles] = useState<Record<string, GameProfile>>(
    {},
  );
  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        setGameProfiles(cfg.game_profiles || {});
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base relative">
      {sortedVideos.length === 0 ? (
        <EmptyState hasFolders={folders.length > 0} />
      ) : useGroups ? (
        /* Date-grouped layout */
        <div className="flex-1 overflow-y-auto p-5 pb-10" data-scroll-layer>
          {groups.map((group) => {
            const groupPaths = group.videos.map((v) => v.path);
            const selectedCount = group.videos.reduce(
              (count, v) => (selectedPathsSet.has(v.path) ? count + 1 : count),
              0,
            );
            const allSelected =
              group.videos.length > 0 && selectedCount === group.videos.length;
            const partiallySelected =
              selectedCount > 0 && selectedCount < group.videos.length;
            const collapsed = Boolean(collapsedGroups[group.dateKey]);

            return (
              <section key={group.dateKey} className="mb-8 last:mb-0">
                <GroupHeader
                  group={group}
                  allSelected={allSelected}
                  partiallySelected={partiallySelected}
                  collapsed={collapsed}
                  onToggleSelectGroup={() =>
                    onSelectGroup?.(groupPaths, !allSelected)
                  }
                  onToggleCollapse={() => handleToggleCollapse(group.dateKey)}
                />
                {!collapsed && (
                  <div className={`grid ${densityClass}`}>
                    {group.videos.map((video) => {
                      const sortedIdx = sortedIdxMap.get(video.path) ?? -1;
                      const isSelected = selectedPathsSet.has(video.path);
                      return (
                        <VideoPill
                          key={video.path}
                          video={video}
                          selected={isSelected}
                          multiSelected={isSelected}
                          onClick={(e) => onOpenVideo(sortedIdx, e)}
                          onSelectToggle={
                            onSelectToggle
                              ? () => onSelectToggle(sortedIdx)
                              : undefined
                          }
                          onUpload={() => onUploadTarget(video)}
                          onQuickQueue={
                            onQuickQueue ? () => onQuickQueue(video) : undefined
                          }
                          onOpenInExplorer={
                            onOpenInExplorer
                              ? () => onOpenInExplorer(video)
                              : undefined
                          }
                          uploadProgress={uploadingProgressMap.get(video.path)}
                          gameProfiles={gameProfiles}
                          isQueued={queuedPathsSet.has(video.path)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* Flat layout for name/size sort */
        <div className="flex-1 overflow-y-auto p-5 pb-10" data-scroll-layer>
          <div className={`grid ${densityClass}`}>
            {sortedVideos.map((video, idx) => {
              const isSelected = selectedPathsSet.has(video.path);
              return (
                <VideoPill
                  key={video.path}
                  video={video}
                  selected={isSelected}
                  multiSelected={isSelected}
                  onClick={(e) => onOpenVideo(idx, e)}
                  onSelectToggle={
                    onSelectToggle ? () => onSelectToggle(idx) : undefined
                  }
                  onUpload={() => onUploadTarget(video)}
                  onQuickQueue={
                    onQuickQueue ? () => onQuickQueue(video) : undefined
                  }
                  onOpenInExplorer={
                    onOpenInExplorer
                      ? () => onOpenInExplorer(video)
                      : undefined
                  }
                  uploadProgress={uploadingProgressMap.get(video.path)}
                  gameProfiles={gameProfiles}
                  isQueued={queuedPathsSet.has(video.path)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
