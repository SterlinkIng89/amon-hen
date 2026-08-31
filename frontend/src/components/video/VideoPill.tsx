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
import VideoStatusBadge from "../youtube/VideoStatusBadge";

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
	uploadSpeed?: number; // bytes per second while uploading
	readOnlyThumbnail?: boolean;
	gameProfiles?: Record<string, GameProfile>;
	onThumbLoaded?: (url: string) => void;
	onSelectToggle?: (e: React.MouseEvent) => void;
	duplicateCount?: number;
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
	uploadSpeed,
	readOnlyThumbnail = false,
	gameProfiles = {},
	onThumbLoaded,
	onSelectToggle,
	duplicateCount,
}: VideoPillProps) {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);

	// Helper: Is it a YouTube video or a Local file?
	const isYT = "id" in video && !("path" in video);
	const isLocal = "path" in video;
	const localPath = isLocal ? (video as VideoFile).path : "";

	// States for local files initialized immediately from memory cache if present
	const [thumb, setThumb] = useState<string>(() => (isLocal ? getCachedThumb(localPath) || "" : ""));
	const [sprite, setSprite] = useState<string>(() => (isLocal ? getCachedPreview(localPath) || "" : ""));
	const [bgPos, setBgPos] = useState("0% 0%");
	const [hovered, setHovered] = useState(false);
	const [thumbLoaded, setThumbLoaded] = useState<boolean>(() => (isLocal ? !!getCachedThumb(localPath) : true));
	const [imgLoaded, setImgLoaded] = useState<boolean>(() => (isLocal ? !!getCachedThumb(localPath) : false));
	const [localDuration, setLocalDuration] = useState<number | null>(() =>
		isLocal ? getCachedDuration(localPath) ?? null : null
	);

	// Data normalization
	const activeProfile = isLocal ? gameProfiles[(video as VideoFile).game || ""] : undefined;
	const { fullTitle: title, segments: titleSegments } = getVideoTitleSegments(video, activeProfile);
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

	// Primary thumbnail & duration loading when entering viewport
	useEffect(() => {
		if (isLocal && inView && localPath) {
			if (!thumb && !thumbLoaded) {
				enqueueThumb(() => GetThumbnail(localPath)).then((d) => {
					if (d) {
						setCachedThumb(localPath, d);
						setThumb(d);
						if (onThumbLoaded) onThumbLoaded(d);
					}
					setThumbLoaded(true);
				}).catch(() => {
					setThumbLoaded(true);
				});
			}
			if (localDuration === null) {
				enqueueDuration(() => GetVideoDuration(localPath)).then((s) => {
					if (s > 0) {
						setCachedDuration(localPath, s);
						setLocalDuration(s);
					}
				}).catch(() => {});
			}
		}
	}, [inView, isLocal, localPath, thumb, thumbLoaded, localDuration, onThumbLoaded]);

	// Secondary preview sprite loading — ONLY triggered when user hovers over card
	useEffect(() => {
		if (isLocal && hovered && !sprite && localPath) {
			enqueuePreview(() => GetVideoPreview(localPath)).then((d) => {
				if (d) {
					setCachedPreview(localPath, d);
					setSprite(d);
				}
			}).catch(() => {});
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

 return (
 <div
 ref={ref}
 onClick={onClick}
 onMouseEnter={() => { if (!readOnlyThumbnail) setHovered(true); }}
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
 {/* Selection Checkbox */}
 <div 
 className={`absolute top-2 left-2 z-30 transition-opacity duration-200 ${
 multiSelected ? "opacity-100" : hovered ? "opacity-100" : "opacity-0"
 }`}
 onClick={(e) => {
 if (onSelectToggle) {
 e.preventDefault();
 e.stopPropagation();
 onSelectToggle(e);
 }
 }}
 >
 <div className={`w-5 h-5 rounded border shadow-sm flex items-center justify-center transition-colors ${
 multiSelected ? "bg-accent border-accent text-white" : "bg-black/40 border-white/40 text-transparent hover:border-white/80 backdrop-blur-sm"
 }`}>
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="20 6 9 17 4 12"></polyline>
 </svg>
 </div>
 </div>

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

        {/* Duplicate Warning Badge */}
        {duplicateCount !== undefined && duplicateCount > 1 && (
          <div
            className="absolute top-2 right-2 bg-amber-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold z-20 flex items-center gap-1 border border-amber-400/40"
            title={`Duplicate video (${duplicateCount} occurrences in this playlist)`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
 {hovered && isLocal && !video.youtubeId && (
 <button
 className="absolute top-2 right-2 bg-black/60 text-white border border-white/20 rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-all hover:bg-accent hover:border-accent z-20"
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
 className={`font-semibold text-text-primary line-clamp-2 leading-tight break-words ${isList ? "text-xs" : "text-[13px]"}`}
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
									className="text-amber-400 font-semibold bg-amber-400/10 px-1 py-0.5 rounded border border-dashed border-amber-400/30 text-[11px] inline-block my-[-2px]"
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
 className={`flex items-center justify-between text-text-secondary ${isList ? "text-[10px]" : "text-[11px] mt-auto pt-1"}`}
 >
 <div className="flex items-center gap-3">
 {isYT ? (
 <span className="flex items-center gap-1.5 text-text-muted font-medium truncate">
   <VideoStatusBadge
     monetizationStatus={(video as YTVideo).monetizationStatus}
     rejectionReason={(video as YTVideo).rejectionReason}
     statusIssues={(video as YTVideo).statusIssues}
     compact={isList && compact}
   />
   <span>
     {formatNumber(video.viewCount)} views • {formatNumber(video.likeCount)} likes
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
 <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="20 6 9 17 4 12"></polyline>
 </svg>
 </div>
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
 boxShadow: "0 0 6px 1px rgba(249,115,22,0.7)",
 }}
 />
 </span>
 <span className="text-[9px] font-bold tabular-nums" style={{ color: "var(--accent, #f97316)" }}>
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

