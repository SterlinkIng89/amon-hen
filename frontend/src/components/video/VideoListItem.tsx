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
      className={`flex gap-3 p-2 rounded-md cursor-pointer transition-colors select-none border ${multiSelected ? "ring-2 ring-accent border-accent bg-card-hover" : selected ? "bg-card border-border-medium shadow-sm" : "bg-transparent border-transparent hover:bg-black/20"}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick(e as any)}
    >
      {/* Thumbnail */}
      <div className="relative w-28 aspect-video bg-black rounded shrink-0 overflow-hidden">
        {thumbLoaded && thumb ? (
          <img src={thumb} alt={video.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`absolute inset-0 bg-elevated bg-[length:200%_100%] animate-shimmer bg-gradient-to-r from-elevated via-card to-elevated ${thumbLoaded ? "hidden" : ""}`} />
        )}
        {selected && !multiSelected && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-accent">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
        {duration !== null && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-text-primary text-[9px] font-medium py-[1px] px-1 rounded-[3px] tracking-wide border border-white/10 z-10">{formatDuration(duration)}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 min-w-0 justify-center gap-1">
        <span className="text-xs font-semibold text-text-primary truncate" title={ytTitle}>{ytTitle}</span>
        <span className="text-[10px] text-text-muted font-mono truncate" title={video.name}>{video.name}</span>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-secondary">
          <span>{formatSize(video.size)}</span>
          {video.game && (
            <span className="flex items-center gap-1 bg-accent-dim text-accent font-semibold py-[1px] px-1.5 rounded-[3px]">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
              </svg>
              {video.game}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
