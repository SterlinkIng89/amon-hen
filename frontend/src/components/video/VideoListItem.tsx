import React, { useState, useEffect, useRef } from "react";
import { VideoFile } from "../../types";
import { formatName, formatSize } from "../../utils/videoUtils";
import { useInView } from "../../hooks/useInView";
import { GetThumbnail } from "../../../wailsjs/go/main/App";

interface VideoListItemProps {
  video: VideoFile;
  index: number;
  selected: boolean;
  scrollRoot: HTMLElement | null;
  onClick: () => void;
}

export default function VideoListItem({ video, index, selected, scrollRoot, onClick }: VideoListItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, scrollRoot);
  const [thumb, setThumb] = useState("");
  const [thumbLoaded, setThumbLoaded] = useState(false);

  useEffect(() => {
    if (!inView) return;
    GetThumbnail(video.path)
      .then((d: string) => { if (d) setThumb(d); })
      .catch(() => {})
      .finally(() => setThumbLoaded(true));
  }, [inView, video.path]);

  return (
    <div
      ref={ref}
      className={`list-item ${selected ? "list-item--selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
    >
      <span className="list-item-index">{index + 1}</span>
      <div className="list-item-thumb">
        {thumbLoaded && thumb ? (
          <img src={thumb} alt={video.name} className="list-item-img" />
        ) : (
          <div className={`list-item-skeleton ${thumbLoaded ? "loaded" : ""}`} />
        )}
        {selected && (
          <div className="list-item-playing">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </div>
      <div className="list-item-info">
        <span className="list-item-name" title={formatName(video.name)}>
          {formatName(video.name)}
        </span>
        <div className="list-item-meta">
          <span>{formatSize(video.size)}</span>
        </div>
      </div>
    </div>
  );
}
