import React, { useState } from "react";
import { VideoFile, VideoGroup } from "../../types";
import VideoPill from "./VideoPill";
import StatsBar from "./StatsBar";

type SortMode = "date" | "name" | "size";

interface VideoGridProps {
  folders: string[];
  activeFolders: string[];
  groups: VideoGroup[];
  allVideos: VideoFile[];       // unfiltered, for stats
  sortedVideos: VideoFile[];    // already sorted by Dashboard
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

export default function VideoGrid({
  folders,
  activeFolders,
  groups,
  allVideos,
  sortedVideos,
  selectedPaths,
  onOpenVideo,
  onUploadTarget,
}: VideoGridProps) {
  const useGroups = groups.length > 0; // If Dashboard groups it, we use it

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base relative">
      {sortedVideos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-sm">
          {folders.length === 0 ? (
            <>
              <p>No folders added.</p>
              <p className="text-[12px] text-text-muted mt-1">Click "Add Folder" to begin.</p>
            </>
          ) : (
            <p>No videos found matching the current filters.</p>
          )}
        </div>
      ) : useGroups ? (
        /* Date-grouped layout */
        <div className="flex-1 overflow-y-auto p-5 pb-10">
          {groups.map(group => (
            <section key={group.dateKey} className="mb-8 last:mb-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-bold text-text-primary text-base">{group.label}</span>
                <span className="text-xs text-text-muted font-medium bg-elevated px-2 py-0.5 rounded-sm">
                  {group.videos.length} video{group.videos.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(213px,1fr))] gap-5">
                {group.videos.map(video => {
                  const absoluteIdx = allVideos.findIndex(v => v.path === video.path);
                  const selected = selectedPaths.includes(video.path);
                  return (
                    <VideoPill
                      key={video.path}
                      video={video}
                      selected={selected}
                      onClick={(e) => onOpenVideo(absoluteIdx, e)}
                      onUpload={() => onUploadTarget(video)}
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
            {sortedVideos.map((video) => {
              const absoluteIdx = allVideos.findIndex(v => v.path === video.path);
              const selected = selectedPaths.includes(video.path);
              return (
                <VideoPill
                  key={video.path}
                  video={video}
                  selected={selected}
                  onClick={(e) => onOpenVideo(absoluteIdx, e)}
                  onUpload={() => onUploadTarget(video)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
