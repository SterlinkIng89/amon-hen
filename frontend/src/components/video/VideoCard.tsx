import React, { useState, useEffect, useRef } from "react";
import { VideoFile } from "../../types";
import { formatName, formatSize, formatDuration, generateYouTubeTitle } from "../../utils/videoUtils";
import { useInView } from "../../hooks/useInView";
import { GetThumbnail, GetVideoPreview, GetVideoDuration } from "../../../wailsjs/go/main/App";

interface VideoCardProps {
  video: VideoFile;
  selected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onUpload: () => void;
}

export default function VideoCard({ video, selected, onClick, onUpload }: VideoCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [sprite, setSprite] = useState("");
  const [thumb, setThumb] = useState("");
  const [bgPos, setBgPos] = useState("0% 0%");
  const [hovered, setHovered] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!inView) return;
    GetThumbnail(video.path)
      .then((d: string) => { if (d) setThumb(d); })
      .catch(() => {})
      .finally(() => setThumbLoaded(true));
    GetVideoPreview(video.path)
      .then((d: string) => { if (d) setSprite(d); })
      .catch(() => {})
      .finally(() => setSpriteLoaded(true));
    GetVideoDuration(video.path)
      .then((s: number) => { if (s > 0) setDuration(s); })
      .catch(() => {});
  }, [inView, video.path]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sprite) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const frame = Math.floor(pct * 25);
    const col = frame % 5;
    const row = Math.floor(frame / 5);
    setBgPos(`${(col / 4) * 100}% ${(row / 4) * 100}%`);
  };

  return (
    <div
      ref={ref}
      className={`group flex flex-col bg-card rounded-md border overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.4)] hover:bg-card-hover select-none ${selected ? "ring-2 ring-accent border-accent bg-card-hover" : "border-border-subtle hover:border-border-medium"}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setBgPos("0% 0%"); }}
    >
      <div className="relative aspect-video bg-black shrink-0 overflow-hidden" onMouseMove={handleMouseMove}>
        {!thumbLoaded && <div className="absolute inset-0 bg-elevated bg-[length:200%_100%] animate-shimmer bg-gradient-to-r from-elevated via-card to-elevated" />}
        {sprite && hovered ? (
          <div
            className="absolute inset-0 w-full h-full"
            style={{ backgroundImage: `url(${sprite})`, backgroundSize: "500% 500%", backgroundPosition: bgPos }}
          />
        ) : thumb ? (
          <img src={thumb} alt={video.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
        <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}>
          <div className={`w-11 h-11 bg-accent rounded-full flex items-center justify-center text-white shadow-lg transition-transform duration-200 ${hovered ? "scale-100" : "scale-90"}`}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        {hovered && !spriteLoaded && thumbLoaded && (
          <div className="absolute top-2 left-2"><div className="w-3.5 h-3.5 border-[1.5px] border-white/20 border-t-white rounded-full animate-spin" /></div>
        )}
        {hovered && (
          <button
            className="absolute top-2 right-2 bg-black/60 text-white border border-white/20 rounded-[4px] p-1.5 opacity-0 group-hover:opacity-100 transition-all hover:bg-accent hover:border-accent z-10"
            title="Upload to YouTube"
            onClick={e => { e.stopPropagation(); onUpload(); }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
            </svg>
          </button>
        )}
        {duration !== null && (
          <div className="absolute bottom-2 right-2 bg-black/75 text-text-primary text-[10px] font-medium py-0.5 px-1.5 rounded-sm tabular-nums tracking-wide z-10 backdrop-blur-sm border border-white/10">
            {formatDuration(duration)}
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div className="flex flex-col">
          <p className="font-semibold text-text-primary text-sm leading-tight line-clamp-2 break-words" title={generateYouTubeTitle(video.name, video.game)}>
            {generateYouTubeTitle(video.name, video.game)}
          </p>
          <p className="text-[11px] text-text-muted font-mono truncate mt-0.5" title={video.name}>
            {video.name}
          </p>
        </div>
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary font-medium">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
              <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
            </svg>
            <span>{formatSize(video.size)}</span>
          </div>
          {video.game && (
            <div className="flex items-center gap-1 bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded-sm max-w-[120px]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
              </svg>
              <span className="truncate">{video.game}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
