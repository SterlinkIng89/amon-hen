import React, { useState, useEffect, useRef } from "react";
import { YTVideo, VideoFile, GameProfile } from "../../types";
import {
  formatSize,
  formatDuration,
  generateYouTubeTitle,
  getVideoTitleSegments,
} from "../../utils/videoUtils";
import { getTagColor } from "../../utils/tagColors";
import { useInView } from "../../hooks/useInView";
import { useCustomThumbnail } from "../../hooks/useCustomThumbnail";
import {
  enqueueThumb,
  enqueueDuration,
  enqueuePreview,
  getCachedThumb,
  setCachedThumb,
  getCachedDuration,
  setCachedDuration,
  getCachedPreview,
  setCachedPreview,
} from "../../hooks/useThumbnailQueue";
import {
  GetThumbnail,
  GetVideoPreview,
  GetVideoDuration,
} from "../../../wailsjs/go/backend/App";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import VideoStatusBadge from "../youtube/VideoStatusBadge";

export interface VideoPillProps {
  video: YTVideo | VideoFile;
  selected?: boolean;
  multiSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onUpload?: () => void;
  onUpdate?: () => void;
  viewMode?: "grid" | "list";
  compact?: boolean;
  uploadProgress?: number; // 0-100 while uploading, undefined otherwise
  uploadSpeed?: number; // bytes per second while uploading
  readOnlyThumbnail?: boolean;
  gameProfiles?: Record<string, GameProfile>;
  onThumbLoaded?: (url: string) => void;
  onSelectToggle?: (e: React.MouseEvent) => void;
  duplicateCount?: number;
  onDelete?: () => void;
  readonly isQueued?: boolean;
  readonly onQuickQueue?: () => void;
  readonly onOpenInExplorer?: () => void;
  readonly onEdit?: () => void;
}

function VideoPillComponent({
  video,
  selected,
  multiSelected,
  onClick,
  onUpload,
  onUpdate,
  viewMode = "grid",
  compact = false,
  uploadProgress,
  uploadSpeed,
  readOnlyThumbnail = false,
  gameProfiles = {},
  onThumbLoaded,
  onSelectToggle,
  duplicateCount,
  onDelete,
  isQueued = false,
  onQuickQueue,
  onOpenInExplorer,
  onEdit,
}: VideoPillProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const onUploadRef = useRef(onUpload);
  onUploadRef.current = onUpload;
  const onSelectToggleRef = useRef(onSelectToggle);
  onSelectToggleRef.current = onSelectToggle;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onThumbLoadedRef = useRef(onThumbLoaded);
  onThumbLoadedRef.current = onThumbLoaded;
  const onQuickQueueRef = useRef(onQuickQueue);
  onQuickQueueRef.current = onQuickQueue;
  const onOpenInExplorerRef = useRef(onOpenInExplorer);
  onOpenInExplorerRef.current = onOpenInExplorer;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;

  // Helper: Is it a YouTube video or a Local file?
  const isYT = "id" in video && !("path" in video);
  const isLocal = "path" in video;
  const localFile = isLocal ? (video as VideoFile) : null;
  const ytVideo = isYT ? (video as YTVideo) : null;
  const localPath = localFile ? localFile.path : "";
  const fallbackKey =
    localFile && localFile.youtubeId
      ? `${localFile.youtubeId}_${localFile.episode || 1}`
      : undefined;

  const customThumb = useCustomThumbnail(localPath, isLocal && inView, fallbackKey);

  // States for local files initialized immediately from memory cache if present
  const [thumb, setThumb] = useState<string>(() =>
    isLocal ? getCachedThumb(localPath) || "" : "",
  );
  const [sprite, setSprite] = useState<string>(() =>
    isLocal ? getCachedPreview(localPath) || "" : "",
  );
  const [bgPos, setBgPos] = useState("0% 0%");
  const [hovered, setHovered] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState<boolean>(() =>
    isLocal ? !!getCachedThumb(localPath) : false,
  );
  const [imgLoaded, setImgLoaded] = useState<boolean>(() =>
    isLocal ? !!getCachedThumb(localPath) : false,
  );
  const [localDuration, setLocalDuration] = useState<number | null>(() =>
    isLocal ? (getCachedDuration(localPath) ?? null) : null,
  );

  // Data normalization
  const activeProfile = isLocal
    ? gameProfiles[(video as VideoFile).game || ""]
    : undefined;
  const { fullTitle: title, segments: titleSegments } = getVideoTitleSegments(
    video,
    activeProfile,
  );
  const subtitle = isLocal ? video.name : "";
  const thumbnail = isYT ? video.thumbnailUrl : customThumb || thumb;
  const publishedAt = isYT
    ? new Date(video.publishedAt).toLocaleDateString()
    : "";
  const showQueuedBadge =
    isLocal && !video.youtubeId && isQueued && uploadProgress === undefined;

  // Duration normalization
  const parseYTDuration = (isoDuration: string) => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) return "0:00";
    const h = parseInt(matches[1] || "0");
    const m = parseInt(matches[2] || "0");
    const s = parseInt(matches[3] || "0");
    if (h > 0)
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const displayDuration = isYT
    ? parseYTDuration(video.duration)
    : localDuration !== null
      ? formatDuration(localDuration)
      : "";

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  // Primary thumbnail & duration loading when entering viewport
  useEffect(() => {
    if (isLocal && inView && localPath) {
      if (!thumb && !thumbLoaded) {
        enqueueThumb(() => GetThumbnail(localPath))
          .then((d) => {
            if (d) {
              setCachedThumb(localPath, d);
              setThumb(d);
              if (onThumbLoadedRef.current) onThumbLoadedRef.current(d);
            }
            setThumbLoaded(true);
          })
          .catch(() => {
            setThumbLoaded(true);
          });
      }
      if (localDuration === null) {
        enqueueDuration(() => GetVideoDuration(localPath))
          .then((s) => {
            if (s > 0) {
              setCachedDuration(localPath, s);
              setLocalDuration(s);
            }
          })
          .catch(() => {});
      }
    }
  }, [
    inView,
    isLocal,
    localPath,
    thumb,
    thumbLoaded,
    localDuration,
  ]);

  // Secondary preview sprite loading — ONLY triggered when user hovers over card
  useEffect(() => {
    if (isLocal && hovered && !sprite && localPath) {
      enqueuePreview(() => GetVideoPreview(localPath))
        .then((d) => {
          if (d) {
            setCachedPreview(localPath, d);
            setSprite(d);
          }
        })
        .catch(() => {});
    }
  }, [isLocal, hovered, sprite, localPath]);

  useEffect(() => {
    if (selected && ref.current && viewMode === "list") {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected, viewMode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sprite || !hovered) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const frame = Math.floor(pct * 25);
    const col = frame % 5;
    const row = Math.floor(frame / 5);
    setBgPos(`${(col / 4) * 100}% ${(row / 4) * 100}%`);
  };

  const isList = viewMode === "list";
  const thumbWidth = compact ? "120px" : "200px";
  const heightClass = isList
    ? compact
      ? "h-16 min-h-[64px]"
      : "h-28 min-h-[112px]"
    : "h-full";
  const thumbHeightClass = isList ? "h-full" : "aspect-video";

  const hasYouTubeId = Boolean(localFile?.youtubeId);
  const canQuickQueue = Boolean(
    isLocal && onQuickQueue && !hasYouTubeId && !isQueued && uploadProgress === undefined,
  );
  const canUpload = Boolean(isLocal && onUpload && !hasYouTubeId);
  const showQuickActions =
    (isLocal && (Boolean(onOpenInExplorer) || canQuickQueue || canUpload)) ||
    isYT;

  return (
    <div
      ref={ref}
      onClick={(e) => onClickRef.current?.(e)}
      onMouseEnter={() => {
        if (!readOnlyThumbnail) setHovered(true);
      }}
      onMouseLeave={() => {
        if (!readOnlyThumbnail) {
          setHovered(false);
          setBgPos("0% 0%");
        }
      }}
      className={`group flex select-none rounded-xl overflow-hidden transition-all duration-300 ${onClick ? "cursor-pointer" : "cursor-default"} shrink-0 ${
        isList ? "flex-row" : "flex-col"
      } ${heightClass} border ${
        multiSelected
          ? "bg-accent/10 border-accent/50"
          : selected
            ? "bg-accent/10 border-accent"
            : "bg-card border-transparent hover:border-accent/30 hover:bg-elevated"
      }`}
    >
      {/* Thumbnail Area */}
      <div
        className={`relative bg-black shrink-0 overflow-hidden ${isList ? "" : "w-full"} ${thumbHeightClass}`}
        style={{ width: isList ? thumbWidth : "100%" }}
        onMouseMove={handleMouseMove}
      >
        {/* Top-left Actions Overlay */}
        {(onSelectToggle || onDelete) && (
          <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 pointer-events-none">
            {/* Selection Checkbox */}
            {onSelectToggle && (
              <button
                type="button"
                className={`w-5 h-5 rounded border shadow-xs flex items-center justify-center transition-all pointer-events-auto cursor-pointer ${
                  multiSelected
                    ? "bg-accent border-accent text-white opacity-100"
                    : `bg-black/40 border-white/40 text-transparent hover:border-white/80 backdrop-blur-xs ${
                        hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectToggleRef.current?.(e);
                }}
                title={multiSelected ? "Deselect video" : "Select video"}
                aria-label={multiSelected ? "Deselect video" : "Select video"}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            )}

            {/* Delete button */}
            {onDelete && (
              <button
                type="button"
                className={`w-5 h-5 rounded border border-white/20 bg-black/50 backdrop-blur-xs text-white/80 hover:text-red-400 hover:bg-black/80 hover:border-red-500/50 flex items-center justify-center transition-all shadow-xs pointer-events-auto cursor-pointer ${
                  hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteRef.current?.();
                }}
                title={isLocal ? "Delete local file" : "Delete video from YouTube"}
                aria-label={isLocal ? "Delete local file" : "Delete video from YouTube"}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            )}
          </div>
        )}

        {isLocal && !thumbLoaded && !customThumb && (
          <div className="absolute inset-0 bg-elevated bg-[length:200%_100%] animate-shimmer bg-gradient-to-r from-elevated via-card to-elevated" />
        )}

        {isLocal && sprite && hovered ? (
          <div
            className="absolute inset-0 w-full h-full transition-opacity duration-300"
            style={{
              backgroundImage: `url(${sprite})`,
              backgroundSize: "500% 500%",
              backgroundPosition: bgPos,
            }}
          />
        ) : (
          <img
            key={thumbnail}
            src={thumbnail || "/placeholder-thumb.jpg"}
            alt={title}
            onLoad={() => setImgLoaded(true)}
            className={`w-full h-full object-cover transition-opacity duration-700 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Play Icon on Hover */}
        <div
          className={`absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px] transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}
        >
          <div className="w-12 h-12 bg-black/50 border border-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-lg">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="ml-0.5"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Duplicate Warning Badge */}
        {duplicateCount !== undefined && duplicateCount > 1 && (
          <div
            className="absolute top-2 right-2 bg-amber-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold z-20 flex items-center gap-1 border border-amber-400/40"
            title={`Duplicate video (${duplicateCount} occurrences in this playlist)`}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Duplicate ({duplicateCount}x)</span>
          </div>
        )}

        {/* Duration Badge */}
        {displayDuration && (
          <div
            className={`absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-white z-10 tabular-nums shadow-sm border border-white/10 ${isList && compact ? "scale-90" : ""}`}
          >
            {displayDuration}
          </div>
        )}

        {/* Action Buttons on Hover */}
        {showQuickActions && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20 pointer-events-none">
            {onOpenInExplorer && (
              <button
                type="button"
                className={`bg-black/60 text-white border border-white/20 rounded-lg p-1.5 transition-all hover:bg-accent hover:border-accent pointer-events-auto cursor-pointer ${
                  hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                title="Show in Explorer"
                aria-label="Show in Explorer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenInExplorerRef.current?.();
                }}
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
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            )}

            {canQuickQueue && (
              <button
                type="button"
                className={`bg-black/60 text-white border border-white/20 rounded-lg p-1.5 transition-all hover:bg-accent hover:border-accent pointer-events-auto cursor-pointer ${
                  hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                title="Add to upload queue"
                aria-label="Add to upload queue"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickQueueRef.current?.();
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}

            {canUpload && (
              <button
                type="button"
                className={`bg-black/60 text-white border border-white/20 rounded-lg p-1.5 transition-all hover:bg-accent hover:border-accent pointer-events-auto cursor-pointer ${
                  hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                title="Upload to YouTube"
                aria-label="Upload to YouTube"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUploadRef.current?.();
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
            )}

            {ytVideo && onEdit && (
              <button
                type="button"
                className={`bg-black/60 text-white border border-white/20 rounded-lg p-1.5 transition-all hover:bg-accent hover:border-accent pointer-events-auto cursor-pointer ${
                  hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                title="Edit video metadata"
                aria-label="Edit video metadata"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEditRef.current?.();
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}

            {ytVideo && (
              <button
                type="button"
                className={`bg-black/60 text-white border border-white/20 rounded-lg p-1.5 transition-all hover:bg-accent hover:border-accent pointer-events-auto cursor-pointer ${
                  hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                title="Open on YouTube"
                aria-label="Open on YouTube"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  BrowserOpenURL(`https://www.youtube.com/watch?v=${ytVideo.id}`);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div
        className={`flex flex-col flex-1 min-w-0 ${isList ? "px-3 py-2 justify-between" : "p-3 pb-2.5 gap-1.5"}`}
      >
        <div className="flex flex-col gap-0.5">
          <h3
            className={`font-semibold text-text-primary line-clamp-2 leading-snug break-words ${isList ? "text-xs" : "text-[13px]"}`}
            title={title}
          >
            {titleSegments.map((segment, idx) => {
              if (segment.isGameTag) {
                return (
                  <span
                    key={idx}
                    style={{ color: getTagColor(segment.text) }}
                    className="font-bold"
                  >
                    {segment.text}
                  </span>
                );
              }
              if (segment.isPlaceholder) {
                return (
                  <span
                    key={idx}
                    className="text-amber-400 font-semibold bg-amber-500/15 px-1 py-0.5 rounded-sm text-[11px]"
                    title={`Unfilled variable: ${segment.varName || segment.text}`}
                  >
                    {segment.text}
                  </span>
                );
              }
              return (
                <span key={idx} className="opacity-90">
                  {segment.text}
                </span>
              );
            })}
          </h3>
          {isList && publishedAt && (
            <span className="text-[10px] text-text-muted font-medium mt-0.5">
              {publishedAt}
            </span>
          )}
        </div>

        <div
          className={`flex items-center justify-between text-text-secondary ${isList ? "text-[10px]" : "text-[11px] mt-auto pt-2"}`}
        >
          <div className="flex items-center gap-3">
            {isYT ? (
              <span className="flex items-center gap-1.5 text-text-muted font-medium truncate">
                <VideoStatusBadge
                  monetizationStatus={ytVideo?.monetizationStatus}
                  rejectionReason={ytVideo?.rejectionReason}
                  statusIssues={ytVideo?.statusIssues}
                  compact={isList && compact}
                />
                {ytVideo?.privacy === "private" && (
                  <span
                    className="text-amber-400 font-semibold"
                    title="Private video"
                  >
                    Private
                  </span>
                )}
                {ytVideo?.privacy === "unlisted" && (
                  <span
                    className="text-sky-400 font-semibold"
                    title="Unlisted video"
                  >
                    Unlisted
                  </span>
                )}
                <span>
                  {formatNumber(ytVideo?.viewCount ?? 0)} views •{" "}
                  {formatNumber(ytVideo?.likeCount ?? 0)} likes
                  {publishedAt && ` • ${publishedAt}`}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {isLocal && video.youtubeId && (
                  <div
                    className="shrink-0 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center text-white shadow-sm"
                    title="Uploaded to YouTube"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                )}
                {showQueuedBadge && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400"
                    title="Pending in upload queue"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    Queued
                  </span>
                )}
                <span className="flex items-center gap-1 font-medium">
                  {formatSize(video.size)}
                </span>
              </span>
            )}
          </div>

          {!isList && publishedAt && !isYT && (
            <span className="font-medium opacity-60">{publishedAt}</span>
          )}

          {!isYT && uploadProgress !== undefined && (
            <span className="flex items-center gap-2 ml-0.5">
              {uploadSpeed !== undefined && uploadSpeed > 0 && (
                <span className="text-[9px] text-text-muted font-medium tabular-nums mt-0.5">
                  {formatSize(uploadSpeed)}/s
                </span>
              )}
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-14 h-[5px] rounded-full overflow-hidden bg-white/10 shrink-0"
                  title={`Uploading: ${uploadProgress}%`}
                >
                  <span
                    className="block h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${uploadProgress}%`,
                      background: "var(--accent, #f97316)",
                    }}
                  />
                </span>
                <span
                  className="text-[9px] font-bold tabular-nums"
                  style={{ color: "var(--accent, #f97316)" }}
                >
                  {uploadProgress}%
                </span>
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function areVideoPillPropsEqual(
  prev: VideoPillProps,
  next: VideoPillProps,
): boolean {
  if (prev.video !== next.video) {
    const prevIsLocal = "path" in prev.video;
    const nextIsLocal = "path" in next.video;
    if (prevIsLocal !== nextIsLocal) return false;

    if (prevIsLocal && nextIsLocal) {
      const p = prev.video as VideoFile;
      const n = next.video as VideoFile;
      if (
        p.path !== n.path ||
        p.modTime !== n.modTime ||
        p.size !== n.size ||
        p.youtubeId !== n.youtubeId ||
        p.game !== n.game ||
        p.episode !== n.episode ||
        p.youtubeTitle !== n.youtubeTitle ||
        p.name !== n.name ||
        p.contentType !== n.contentType
      ) {
        return false;
      }
    } else {
      const p = prev.video as YTVideo;
      const n = next.video as YTVideo;
      if (
        p.id !== n.id ||
        p.title !== n.title ||
        p.privacy !== n.privacy ||
        p.viewCount !== n.viewCount ||
        p.likeCount !== n.likeCount ||
        p.monetizationStatus !== n.monetizationStatus ||
        p.thumbnailUrl !== n.thumbnailUrl ||
        p.gameTag !== n.gameTag ||
        p.episode !== n.episode
      ) {
        return false;
      }
    }
  }

  return (
    prev.selected === next.selected &&
    prev.multiSelected === next.multiSelected &&
    prev.uploadProgress === next.uploadProgress &&
    prev.uploadSpeed === next.uploadSpeed &&
    prev.viewMode === next.viewMode &&
    prev.compact === next.compact &&
    prev.duplicateCount === next.duplicateCount &&
    prev.readOnlyThumbnail === next.readOnlyThumbnail &&
    prev.gameProfiles === next.gameProfiles &&
    prev.isQueued === next.isQueued &&
    Boolean(prev.onEdit) === Boolean(next.onEdit)
  );
}

const VideoPill = React.memo(VideoPillComponent, areVideoPillPropsEqual);
export default VideoPill;

