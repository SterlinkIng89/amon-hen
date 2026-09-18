import React, { useEffect, useRef, useState, useCallback } from "react";
import { formatDuration } from "../../utils/videoUtils";

interface ClipTimelineSelectorProps {
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly videoName?: string;
  readonly duration: number;
  readonly defaultTitle: string;
  readonly isSaving: boolean;
  readonly onClipSave: (startSec: number, endSec: number, title: string) => void;
  readonly onCancel: () => void;
}

function formatTimeWithSubseconds(sec: number): string {
  const clamped = Math.max(0, sec);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.floor((clamped % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}

export function ClipTimelineSelector({
  videoRef,
  videoName,
  duration,
  defaultTitle,
  isSaving,
  onClipSave,
  onCancel,
}: ClipTimelineSelectorProps) {
  const safeDuration = Math.max(duration, 0.1);

  const [inPoint, setInPoint] = useState<number>(0);
  const [outPoint, setOutPoint] = useState<number>(() => {
    if (duration > 0) {
      return Math.min(duration, Math.max(5, duration * 0.25));
    }
    return 30;
  });
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [title, setTitle] = useState<string>(defaultTitle);
  const [draggingHandle, setDraggingHandle] = useState<"in" | "out" | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (duration > 0) {
      setOutPoint((prev) => (prev === 0 || prev > duration ? Math.min(duration, Math.max(5, duration * 0.25)) : prev));
    }
  }, [duration]);

  useEffect(() => {
    setTitle(defaultTitle);
  }, [defaultTitle]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const curr = video.currentTime;
      setCurrentTime(curr);

      if (!video.paused && curr >= outPoint) {
        video.currentTime = inPoint;
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [videoRef, inPoint, outPoint]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
        return;
      }

      const video = videoRef.current;
      const playhead = video ? video.currentTime : currentTime;

      if (e.key === "[" || e.key === "i" || e.key === "I") {
        e.preventDefault();
        const nextIn = Math.max(0, Math.min(playhead, outPoint - 1));
        setInPoint(nextIn);
      } else if (e.key === "]" || e.key === "o" || e.key === "O") {
        e.preventDefault();
        const nextOut = Math.min(safeDuration, Math.max(playhead, inPoint + 1));
        setOutPoint(nextOut);
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (video) {
          if (video.paused) {
            if (video.currentTime < inPoint || video.currentTime >= outPoint) {
              video.currentTime = inPoint;
            }
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
        const target = Math.max(0, playhead - step);
        if (video) video.currentTime = target;
        setCurrentTime(target);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
        const target = Math.min(safeDuration, playhead + step);
        if (video) video.currentTime = target;
        setCurrentTime(target);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [videoRef, currentTime, inPoint, outPoint, safeDuration, onCancel]);

  const getTimeFromPointer = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return fraction * safeDuration;
    },
    [safeDuration]
  );

  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (e: PointerEvent) => {
      const time = getTimeFromPointer(e.clientX);
      if (draggingHandle === "in") {
        const clampedIn = Math.max(0, Math.min(time, outPoint - 1));
        setInPoint(clampedIn);
        if (videoRef.current) {
          videoRef.current.currentTime = clampedIn;
        }
      } else {
        const clampedOut = Math.min(safeDuration, Math.max(time, inPoint + 1));
        setOutPoint(clampedOut);
        if (videoRef.current) {
          videoRef.current.currentTime = clampedOut;
        }
      }
    };

    const handlePointerUp = () => {
      setDraggingHandle(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingHandle, inPoint, outPoint, safeDuration, getTimeFromPointer, videoRef]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.dataset.handle) return;

    const time = getTimeFromPointer(e.clientX);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < inPoint || video.currentTime >= outPoint) {
        video.currentTime = inPoint;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const rewindToStart = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = inPoint;
    setCurrentTime(inPoint);
    if (video.paused) {
      video.play().catch(() => {});
    }
  };

  const clipDuration = Math.max(0, outPoint - inPoint);
  const inPercent = (inPoint / safeDuration) * 100;
  const outPercent = (outPoint / safeDuration) * 100;
  const currentPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  const handleSaveClick = () => {
    if (isSaving || clipDuration < 1) return;
    onClipSave(inPoint, outPoint, title.trim());
  };

  return (
    <div className="w-full bg-[#121212] border-t border-white/10 px-6 py-3.5 flex flex-col gap-3.5 shrink-0 text-white select-none shadow-2xl z-20">
      <div className="flex items-center justify-between gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-2.5">
          <span className="bg-[#3ea6ff]/15 text-[#3ea6ff] border border-[#3ea6ff]/30 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
            Clip Mode
          </span>
          {videoName && (
            <span className="text-white/70 font-medium text-xs truncate max-w-[220px] md:max-w-[340px]" title={videoName}>
              {videoName}
            </span>
          )}
          <span className="text-white/40 text-[11px] hidden lg:inline border-l border-white/10 pl-2.5">
            Keys: <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">[</kbd> Start &bull; <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">]</kbd> End &bull; <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">&larr;/&rarr;</kbd> Seek &bull; <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">Space</kbd> Play
          </span>
        </div>

        <div className="flex items-center gap-3 tabular-nums text-xs">
          <div className="bg-white/5 px-2.5 py-1 rounded border border-white/10 flex items-center gap-1.5">
            <span className="text-white/40 font-medium">Start:</span>
            <span className="text-white font-medium">{formatTimeWithSubseconds(inPoint)}</span>
          </div>
          <div className="bg-white/5 px-2.5 py-1 rounded border border-white/10 flex items-center gap-1.5">
            <span className="text-white/40 font-medium">End:</span>
            <span className="text-white font-medium">{formatTimeWithSubseconds(outPoint)}</span>
          </div>
          <div className="bg-[#3ea6ff]/15 px-2.5 py-1 rounded border border-[#3ea6ff]/30 flex items-center gap-1.5">
            <span className="text-[#3ea6ff]/70 font-medium">Duration:</span>
            <span className="text-[#3ea6ff] font-bold">{formatDuration(clipDuration)}</span>
          </div>
        </div>
      </div>

      <div className="relative pt-2 pb-1 px-2">
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          className="relative h-12 bg-black/90 rounded-lg border border-white/15 cursor-pointer flex items-center overflow-visible select-none"
        >
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/70 rounded-l-lg pointer-events-none"
            style={{ width: `${inPercent}%` }}
          />

          <div
            className="absolute top-0 bottom-0 bg-[#3ea6ff]/20 border-y-2 border-[#3ea6ff] pointer-events-none"
            style={{
              left: `${inPercent}%`,
              width: `${Math.max(0, outPercent - inPercent)}%`,
            }}
          />

          <div
            className="absolute top-0 bottom-0 right-0 bg-black/70 rounded-r-lg pointer-events-none"
            style={{ width: `${Math.max(0, 100 - outPercent)}%` }}
          />

          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-30 transition-transform duration-75"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full -translate-x-[4px] -translate-y-1 shadow-sm" />
          </div>

          <div
            data-handle="in"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDraggingHandle("in");
            }}
            className="absolute -top-1 -bottom-1 w-6 -translate-x-1/2 bg-[#3ea6ff] hover:bg-[#65b8ff] active:scale-105 cursor-ew-resize flex flex-col items-center justify-center rounded-l-md shadow-md z-40 transition-colors group touch-none"
            style={{ left: `${inPercent}%` }}
            title={`Start Marker: ${formatTimeWithSubseconds(inPoint)} (drag or press [)`}
          >
            <div className="flex gap-0.5">
              <div className="w-0.5 h-3.5 bg-black/70 rounded-full" />
              <div className="w-0.5 h-3.5 bg-black/70 rounded-full" />
            </div>

            {draggingHandle === "in" && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/90 text-white border border-[#3ea6ff] px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap shadow-sm pointer-events-none">
                {formatTimeWithSubseconds(inPoint)}
              </div>
            )}
          </div>

          <div
            data-handle="out"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDraggingHandle("out");
            }}
            className="absolute -top-1 -bottom-1 w-6 -translate-x-1/2 bg-[#3ea6ff] hover:bg-[#65b8ff] active:scale-105 cursor-ew-resize flex flex-col items-center justify-center rounded-r-md shadow-md z-40 transition-colors group touch-none"
            style={{ left: `${outPercent}%` }}
            title={`End Marker: ${formatTimeWithSubseconds(outPoint)} (drag or press ])`}
          >
            <div className="flex gap-0.5">
              <div className="w-0.5 h-3.5 bg-black/70 rounded-full" />
              <div className="w-0.5 h-3.5 bg-black/70 rounded-full" />
            </div>

            {draggingHandle === "out" && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/90 text-white border border-[#3ea6ff] px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap shadow-sm pointer-events-none">
                {formatTimeWithSubseconds(outPoint)}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center text-[11px] text-white/40 mt-1 px-1 tabular-nums">
          <span>0:00</span>
          <span className="text-white/70 font-medium">{formatTimeWithSubseconds(currentTime)}</span>
          <span>{formatDuration(safeDuration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap pt-0.5">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={togglePlayPause}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center justify-center"
            title={isPlaying ? "Pause Preview (Space)" : "Play Clip Range (Space)"}
          >
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={rewindToStart}
            className="p-2.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors flex items-center justify-center"
            title="Replay from Clip Start"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 19 2 12 11 5 11 19" />
              <polygon points="22 19 13 12 22 5 22 19" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-[#1e1e1e] border border-white/15 rounded-lg px-3.5 py-2 focus-within:border-[#3ea6ff] transition-colors">
          <label htmlFor="clip-title" className="text-xs text-white/50 shrink-0 font-medium">
            Clip Name:
          </label>
          <input
            id="clip-title"
            type="text"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveClick();
            }}
            placeholder="Name your clip..."
            disabled={isSaving}
          />
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleSaveClick}
          disabled={isSaving || clipDuration < 1}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#3ea6ff] hover:bg-[#65b8ff] text-black transition-colors flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none shadow-sm"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              Creating Clip...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              Save Clip
            </>
          )}
        </button>
      </div>
    </div>
  );
}
