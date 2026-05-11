import React, { useState, useEffect, useRef } from "react";
import { VideoFile } from "../../types";
import { formatSize, formatDuration, generateYouTubeTitle } from "../../utils/videoUtils";
import { useInView } from "../../hooks/useInView";
import { GetThumbnail, GetVideoDuration } from "../../../wailsjs/go/main/App";

interface VideoListItemProps {
  video: VideoFile;
  index: number;
  selected: boolean;
  multiSelected?: boolean;
  scrollRoot: HTMLElement | null;
  onClick: (e: React.MouseEvent) => void;
}

export default function VideoListItem({
  video,
  index,
  selected,
  multiSelected,
  scrollRoot,
  onClick,
}: VideoListItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, scrollRoot);
  const [thumb, setThumb] = useState("");
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!inView) return;
    GetThumbnail(video.path)
      .then((d: string) => { if (d) setThumb(d); })
      .catch(() => {})
      .finally(() => setThumbLoaded(true));
    GetVideoDuration(video.path)
      .then((s: number) => { if (s > 0) setDuration(s); })
      .catch(() => {});
  }, [inView, video.path]);

  // Scroll into view when selected
  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  const ytTitle = generateYouTubeTitle(video.name, video.game);

  return (
    <div
      ref={ref}
      className={`group relative flex gap-3.5 p-2.5 rounded-xl cursor-pointer transition-all duration-200 select-none border-2 ${
        multiSelected 
          ? "ring-2 ring-accent/30 border-accent bg-accent/5" 
          : selected 
            ? "bg-elevated border-accent shadow-[0_4px_12px_rgba(0,0,0,0.1)]" 
            : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick(e as any)}
    >
      {/* Thumbnail Container */}
      <div className="relative w-32 aspect-video bg-black/40 rounded-lg shrink-0 overflow-hidden shadow-inner group-hover:shadow-lg transition-shadow duration-300">
        {thumbLoaded && thumb ? (
          <img src={thumb} alt={video.name} className="w-full h-full object-cover transition-transform duration-500" />
        ) : (
          <div className={`absolute inset-0 bg-elevated bg-[length:200%_100%] animate-shimmer bg-gradient-to-r from-elevated via-card to-elevated ${thumbLoaded ? "hidden" : ""}`} />
        )}
        
        {/* Hover Play Icon */}
        {!selected && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-8 h-8 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center border border-white/30 scale-75 group-hover:scale-100 transition-transform duration-300">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {duration !== null && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-sm text-text-primary text-[10px] font-bold py-[2px] px-1.5 rounded-[4px] tracking-wide border border-white/10 z-10">
            {formatDuration(duration)}
          </span>
        )}

        {video.youtubeId && (
          <div className="absolute top-1.5 right-1.5 bg-red-600 text-white rounded-md p-1 shadow-md z-10" title="Uploaded to YouTube">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info Container */}
      <div className="flex flex-col flex-1 min-w-0 justify-center gap-0.5 py-0.5">
        <div className="flex flex-col">
          <span className={`text-[13px] font-bold leading-tight truncate transition-colors ${selected ? "text-accent" : "text-text-primary group-hover:text-accent/90"}`} title={ytTitle}>
            {ytTitle}
          </span>
          <span className="text-[10px] text-text-muted font-medium truncate opacity-60 group-hover:opacity-100 transition-opacity" title={video.name}>
            {video.name}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-text-secondary font-medium">
            {formatSize(video.size)}
          </span>
          {video.game && (
            <>
              <span className="text-text-secondary/20 text-[10px] mx-0.5">/</span>
              <span className="flex items-center bg-accent/10 text-accent text-[9px] font-extrabold py-0.5 px-2 rounded-full border border-accent/20 hover:bg-accent/20 transition-colors">
                {video.game}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
