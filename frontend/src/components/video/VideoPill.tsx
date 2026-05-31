import React, { useState, useEffect, useRef } from "react";
import { YTVideo, VideoFile } from "../../types";
import {
  formatSize,
  formatDuration,
  generateYouTubeTitle,
} from "../../utils/videoUtils";
import { getTagColor } from "../../utils/tagColors";
import { useInView } from "../../hooks/useInView";
import {
  GetThumbnail,
  GetVideoPreview,
  GetVideoDuration,
} from "../../../wailsjs/go/backend/App";

interface VideoPillProps {
  video: YTVideo | VideoFile;
  selected?: boolean;
  multiSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onUpload?: () => void;
  onUpdate?: () => void;
  viewMode?: "grid" | "list";
  compact?: boolean;
  uploadProgress?: number; // 0-100 while uploading, undefined otherwise
}

export default function VideoPill({
  video,
  selected,
  multiSelected,
  onClick,
  onUpload,
  onUpdate,
  viewMode = "grid",
  compact = false,
  uploadProgress,
}: VideoPillProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  // States for local files
  const [thumb, setThumb] = useState("");
  const [sprite, setSprite] = useState("");
  const [bgPos, setBgPos] = useState("0% 0%");
  const [hovered, setHovered] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [localDuration, setLocalDuration] = useState<number | null>(null);

  // Helper: Is it a YouTube video or a Local file?
  const isYT = "id" in video && !("path" in video);
  const isLocal = "path" in video;

  // Data normalization
  const title = isYT
    ? video.title
    : video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode);
  const subtitle = isLocal ? video.name : "";
  const thumbnail = isYT ? video.thumbnailUrl : thumb;
  const publishedAt = isYT
    ? new Date(video.publishedAt).toLocaleDateString()
    : "";

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

  useEffect(() => {
    if (isLocal && inView) {
      GetThumbnail(video.path).then((d) => {
        if (d) setThumb(d);
        setThumbLoaded(true);
      });
      GetVideoPreview(video.path).then((d) => {
        if (d) setSprite(d);
      });
      GetVideoDuration(video.path).then((s) => {
        if (s > 0) setLocalDuration(s);
      });
    }
  }, [inView, isLocal, (video as VideoFile).path]);

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

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setBgPos("0% 0%");
      }}
      className={`group flex select-none rounded-xl overflow-hidden transition-all duration-300 cursor-pointer shrink-0 ${
        isList ? "flex-row" : "flex-col"
      } ${heightClass} ${
        multiSelected
          ? "bg-accent/10 ring-2 ring-accent/50 shadow-[0_0_15px_rgba(var(--color-accent),0.3)]"
          : selected
            ? "bg-accent/10 ring-2 ring-accent shadow-[0_0_15px_rgba(var(--color-accent),0.3)]"
            : "bg-card border border-transparent hover:border-accent/30 hover:bg-elevated hover:shadow-[0_0_20px_rgba(var(--color-accent),0.15)]"
      }`}
    >
      {/* Thumbnail Area */}
      <div
        className={`relative bg-black shrink-0 overflow-hidden ${isList ? "" : "w-full"} ${thumbHeightClass}`}
        style={{ width: isList ? thumbWidth : "100%" }}
        onMouseMove={handleMouseMove}
      >
        {isLocal && !thumbLoaded && (
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
          <div
            className="w-12 h-12 bg-black/50 border border-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-lg"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Duration Badge */}
        {displayDuration && (
          <div
            className={`absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-white z-10 tabular-nums shadow-sm border border-white/10 ${isList && compact ? "scale-90" : ""}`}
          >
            {displayDuration}
          </div>
        )}

        {/* Action Buttons on Hover */}
        {hovered && isLocal && !video.youtubeId && (
          <button
            className="absolute top-2 right-2 bg-black/60 text-white border border-white/20 rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-all hover:bg-accent hover:border-accent hover:shadow-[0_0_10px_rgba(var(--color-accent),0.3)] z-20"
            title="Upload to YouTube"
            onClick={(e) => {
              e.stopPropagation();
              onUpload?.();
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
      </div>

      {/* Info Panel */}
      <div
        className={`flex flex-col flex-1 min-w-0 ${isList ? "px-3 py-2 justify-between" : "p-3 pb-2.5 gap-1.5"}`}
      >
        <div className="flex flex-col gap-0.5">
          <h3
            className={`font-semibold text-text-primary line-clamp-2 leading-tight break-words ${isList ? "text-xs" : "text-[13px] min-h-[32px]"}`}
            title={title}
          >
            {/* Colorize game-name prefix with its deterministic per-tag color */}
            {isLocal && (video as VideoFile).game && (video as VideoFile).game!.length > 0 && title.startsWith((video as VideoFile).game!) ? (
              <>
                <span style={{ color: getTagColor((video as VideoFile).game!) }} className="font-bold drop-shadow-sm">
                  {(video as VideoFile).game}
                </span>
                <span className="opacity-90">{title.slice((video as VideoFile).game!.length)}</span>
              </>
            ) : (
              title
            )}
          </h3>
          {isList && publishedAt && (
            <span className="text-[10px] text-text-muted font-medium mt-0.5">
              {publishedAt}
            </span>
          )}
        </div>

        <div
          className={`flex items-center justify-between text-text-secondary ${isList ? "text-[10px]" : "text-[11px] mt-auto pt-1"}`}
        >
          <div className="flex items-center gap-3">
            {isYT ? (
              <span className="text-text-muted font-medium truncate">
                {formatNumber(video.viewCount)} views • {formatNumber(video.likeCount)} likes
                {publishedAt && ` • ${publishedAt}`}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {isLocal && video.youtubeId && (
                  <div
                    className="shrink-0 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center text-white shadow-sm"
                    title="Uploaded to YouTube"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                )}
                <span className="flex items-center gap-1 font-medium">
                  {formatSize(video.size)}
                </span>
                {uploadProgress !== undefined && (
                  <span className="flex items-center gap-1 ml-0.5">
                    <span
                      className="inline-block w-14 h-1 rounded-full overflow-hidden bg-white/10 shrink-0"
                      title={`Uploading: ${uploadProgress}%`}
                    >
                      <span
                        className="block h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${uploadProgress}%`,
                          background: "linear-gradient(90deg, var(--color-accent, #7c3aed) 0%, hsl(from var(--color-accent, #7c3aed) h s 75%) 100%)",
                          boxShadow: "0 0 4px var(--color-accent, #7c3aed)",
                        }}
                      />
                    </span>
                    <span className="text-[9px] font-bold tabular-nums" style={{ color: "var(--color-accent, #7c3aed)" }}>
                      {uploadProgress}%
                    </span>
                  </span>
                )}
              </span>
            )}
          </div>

          {!isList && publishedAt && !isYT && (
            <span className="font-medium opacity-60">{publishedAt}</span>
          )}
        </div>
      </div>
    </div>
  );
}

