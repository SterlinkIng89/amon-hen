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
    : "h-fit";
  const thumbHeightClass = isList ? "h-full" : "h-[112px]";

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setBgPos("0% 0%");
      }}
      className={`group flex select-none bg-card rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer shrink-0 hover:-translate-y-0.5 ${
        isList ? "flex-row" : "flex-col"
      } ${heightClass} ${
        multiSelected
          ? "ring-2 ring-accent/30 border-accent bg-accent/5 shadow-accent/20"
          : selected
            ? "ring-2 ring-accent border-accent bg-accent/5 shadow-accent/20"
            : "border-border-subtle hover:border-border-medium hover:shadow-md"
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
            className="absolute inset-0 w-full h-full"
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
            className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Play Icon on Hover */}
        <div
          className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}
        >
          <div
            className={`w-10 h-10 bg-accent rounded-full flex items-center justify-center text-white shadow-lg transition-transform duration-300 ${hovered ? "scale-100" : "scale-75"}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Duration Badge */}
        {displayDuration && (
          <div
            className={`absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-white z-10 border border-white/10 tabular-nums ${isList && compact ? "scale-90" : ""}`}
          >
            {displayDuration}
          </div>
        )}

        {/* Badges (Local, YT) */}

        {isLocal && video.youtubeId && (
          <div
            className={`absolute top-2 left-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white border border-white/20 z-10 shadow-lg shadow-green-500/20 ${isList ? "scale-75 origin-top-left" : ""}`}
            title="Uploaded to YouTube"
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
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        )}

        {/* Action Buttons on Hover */}
        {hovered && isLocal && !video.youtubeId && (
          <button
            className="absolute top-2 right-2 bg-black/60 text-white border border-white/20 rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-all hover:bg-accent hover:border-accent z-20 shadow-xl"
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
        className={`flex flex-col flex-1 min-w-0 ${isList ? "px-3 py-2 justify-between" : "p-3.5 gap-2"}`}
      >
        <div className="flex flex-col gap-1">
          <h3
            className={`font-bold text-text-primary line-clamp-2 leading-tight ${isList ? "text-xs" : "text-sm"}`}
            title={title}
          >
            {/* Colorize game-name prefix with its deterministic per-tag color */}
            {isLocal && (video as VideoFile).game && (video as VideoFile).game!.length > 0 && title.startsWith((video as VideoFile).game!) ? (
              <>
                <span style={{ color: getTagColor((video as VideoFile).game!) }}>
                  {(video as VideoFile).game}
                </span>
                <span>{title.slice((video as VideoFile).game!.length)}</span>
              </>
            ) : (
              title
            )}
          </h3>
          {subtitle && (
            <p
              className="text-[10px] text-text-muted font-mono truncate opacity-60"
              title={subtitle}
            >
              {subtitle}
            </p>
          )}
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
              <>
                <span className="flex items-center gap-1 font-bold">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-50"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {formatNumber(video.viewCount)}
                </span>
                <span className="flex items-center gap-1 font-bold">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-50"
                  >
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  {formatNumber(video.likeCount)}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1 font-bold">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-50"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {formatSize(video.size)}
              </span>
            )}
          </div>

          {!isList && publishedAt && (
            <span className="font-bold opacity-60">{publishedAt}</span>
          )}


        </div>
      </div>
    </div>
  );
}
