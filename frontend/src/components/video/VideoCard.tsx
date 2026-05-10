import React, { useState, useEffect, useRef } from "react";
import { VideoFile } from "../../types";
import { formatName, formatSize } from "../../utils/videoUtils";
import { useInView } from "../../hooks/useInView";
import { GetThumbnail, GetVideoPreview } from "../../../wailsjs/go/main/App";

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
      className={`video-card ${selected ? "video-card--selected" : ""}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setBgPos("0% 0%"); }}
    >
      <div className="video-card-thumb" onMouseMove={handleMouseMove}>
        {!thumbLoaded && <div className="thumb-skeleton" />}
        {sprite && hovered ? (
          <div
            className="thumb-sprite"
            style={{ backgroundImage: `url(${sprite})`, backgroundSize: "500% 500%", backgroundPosition: bgPos }}
          />
        ) : thumb ? (
          <img src={thumb} alt={video.name} className="thumb-img" />
        ) : null}
        <div className={`play-overlay ${hovered ? "visible" : ""}`}>
          <div className="play-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        {hovered && !spriteLoaded && thumbLoaded && (
          <div className="sprite-loading"><div className="spinner-sm" /></div>
        )}
        {hovered && (
          <button
            className="card-upload-btn"
            title="Upload to YouTube"
            onClick={e => { e.stopPropagation(); onUpload(); }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
            </svg>
          </button>
        )}
      </div>
      <div className="video-card-info">
        <div className="video-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <p className="video-title" title={formatName(video.name)} style={{ margin: 0 }}>
            {formatName(video.name)}
          </p>
        </div>
        <div className="video-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
          <span>{formatSize(video.size)}</span>
          {video.game && <span className="video-game-badge" style={{ fontSize: "10px", background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>{video.game}</span>}
        </div>
      </div>
    </div>
  );
}
