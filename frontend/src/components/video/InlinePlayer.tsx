import React, { useEffect, useRef } from "react";
import { VideoFile } from "../../types";
import { formatName, formatSize } from "../../utils/videoUtils";

interface InlinePlayerProps {
  video: VideoFile;
  streamPort: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onUpload: () => void;
}

export default function InlinePlayer({ video, streamPort, onPrev, onNext, onUpload }: InlinePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = `http://127.0.0.1:${streamPort}/stream?path=${encodeURIComponent(video.path)}`;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.load();
    el.play().catch(() => {});
  }, [video.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  return (
    <div className="player-wrap">
      <div className="player-video-area">
        <video ref={videoRef} key={video.path} src={src} controls className="player-video" autoPlay />
      </div>
      <div className="player-info">
        <h2 className="player-title" title={video.name}>
          {formatName(video.name)}
        </h2>
        <div className="player-meta-row">
          <span className="player-meta-size">{formatSize(video.size)}</span>
          <span className="player-meta-path" title={video.path}>
            {video.path}
          </span>
          <button className="btn btn-ghost btn-sm player-upload-btn" onClick={onUpload} title="Upload to YouTube">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
            </svg>
            Upload
          </button>
        </div>
      </div>
      <div className="player-nav">
        <button
          className="btn btn-ghost player-nav-btn"
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          title="Previous (←)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
          Previous
        </button>
        <button
          className="btn btn-ghost player-nav-btn"
          onClick={onNext ?? undefined}
          disabled={!onNext}
          title="Next (→)"
        >
          Next
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
