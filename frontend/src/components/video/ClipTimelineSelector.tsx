import React, { useEffect, useRef, useState, useCallback } from "react";
import { formatDuration, formatTimeWithSubseconds, computeInitialClipRange } from "../../utils/videoUtils";

interface ClipTimelineSelectorProps {
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly videoName?: string;
  readonly duration: number;
  readonly anchorTime?: number;
  readonly defaultTitle: string;
  readonly isSaving: boolean;
  readonly onClipSave: (startSec: number, endSec: number, title: string) => void;
  readonly onCancel: () => void;
}

function clampViewWindow(
  centerTime: number,
  windowDuration: number,
  totalDuration: number
): { start: number; end: number } {
  const dur = Math.max(10, Math.min(totalDuration, windowDuration));
  let start = Math.max(0, centerTime - dur / 2);
  let end = Math.min(totalDuration, start + dur);
  if (end === totalDuration) {
    start = Math.max(0, totalDuration - dur);
  }
  return { start, end };
}

export function ClipTimelineSelector({
  videoRef,
  videoName,
  duration,
  anchorTime,
  defaultTitle,
  isSaving,
  onClipSave,
  onCancel,
}: ClipTimelineSelectorProps) {
  const safeDuration = Math.max(duration, 0.1);
  const resolvedAnchor = anchorTime ?? videoRef.current?.currentTime ?? 0;
  const initialRange = computeInitialClipRange(resolvedAnchor, safeDuration);

  const [inPoint, setInPoint] = useState<number>(() => initialRange.inPoint);
  const [outPoint, setOutPoint] = useState<number>(() => initialRange.outPoint);
  const [currentTime, setCurrentTime] = useState<number>(() => initialRange.inPoint);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [title, setTitle] = useState<string>(defaultTitle);
  const [draggingHandle, setDraggingHandle] = useState<"in" | "out" | null>(null);

  const [viewWindow, setViewWindow] = useState<{ start: number; end: number }>(() => {
    if (safeDuration > 120) {
      const center = (initialRange.inPoint + initialRange.outPoint) / 2;
      const initialSpan = Math.max(60, initialRange.outPoint - initialRange.inPoint + 60);
      return clampViewWindow(center, initialSpan, safeDuration);
    }
    return { start: 0, end: safeDuration };
  });

  const hasUserEditedRange = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const viewDuration = Math.max(1, viewWindow.end - viewWindow.start);
  const isZoomed = viewDuration < safeDuration - 0.5;

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = initialRange.inPoint;
      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (duration > 0 && !hasUserEditedRange.current) {
      const range = computeInitialClipRange(resolvedAnchor, duration);
      setInPoint(range.inPoint);
      setOutPoint(range.outPoint);
      if (duration > 120) {
        const center = (range.inPoint + range.outPoint) / 2;
        const initialSpan = Math.max(60, range.outPoint - range.inPoint + 60);
        setViewWindow(clampViewWindow(center, initialSpan, duration));
      } else {
        setViewWindow({ start: 0, end: duration });
      }
    }
  }, [duration, resolvedAnchor]);

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
        hasUserEditedRange.current = true;
        const nextIn = Math.max(0, Math.min(playhead, outPoint - 1));
        setInPoint(nextIn);
      } else if (e.key === "]" || e.key === "o" || e.key === "O") {
        e.preventDefault();
        hasUserEditedRange.current = true;
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
      return viewWindow.start + fraction * viewDuration;
    },
    [viewWindow.start, viewDuration]
  );

  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (e: PointerEvent) => {
      hasUserEditedRange.current = true;
      const time = getTimeFromPointer(e.clientX);
      if (draggingHandle === "in") {
        const clampedIn = Math.max(0, Math.min(time, outPoint - 1));
        setInPoint(clampedIn);
        if (videoRef.current) {
          videoRef.current.currentTime = clampedIn;
        }
        // Auto-pan view if dragged past edges
        if (clampedIn < viewWindow.start) {
          const shift = viewWindow.start - clampedIn + 5;
          setViewWindow((prev) => ({
            start: Math.max(0, prev.start - shift),
            end: Math.max(0, prev.start - shift) + viewDuration,
          }));
        }
      } else {
        const clampedOut = Math.min(safeDuration, Math.max(time, inPoint + 1));
        setOutPoint(clampedOut);
        if (videoRef.current) {
          videoRef.current.currentTime = clampedOut;
        }
        // Auto-pan view if dragged past edges
        if (clampedOut > viewWindow.end) {
          const shift = clampedOut - viewWindow.end + 5;
          setViewWindow((prev) => ({
            start: Math.min(safeDuration - viewDuration, prev.start + shift),
            end: Math.min(safeDuration, prev.end + shift),
          }));
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
  }, [draggingHandle, inPoint, outPoint, safeDuration, getTimeFromPointer, videoRef, viewWindow, viewDuration]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.dataset.handle) return;

    const time = getTimeFromPointer(e.clientX);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (safeDuration <= 30) return;
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const mouseTime = viewWindow.start + fraction * viewDuration;

    const factor = e.deltaY < 0 ? 0.75 : 1.35;
    setViewWindow((prev) => {
      const curDur = prev.end - prev.start;
      const newDur = Math.max(10, Math.min(safeDuration, curDur * factor));
      let s = Math.max(0, mouseTime - fraction * newDur);
      let endVal = Math.min(safeDuration, s + newDur);
      if (endVal === safeDuration) s = Math.max(0, safeDuration - newDur);
      return { start: s, end: endVal };
    });
  };

  const zoomIn = () => {
    setViewWindow((prev) => {
      const curDur = prev.end - prev.start;
      if (curDur <= 10) return prev;
      return clampViewWindow((inPoint + outPoint) / 2, curDur * 0.65, safeDuration);
    });
  };

  const zoomOut = () => {
    setViewWindow((prev) => {
      const curDur = prev.end - prev.start;
      if (curDur >= safeDuration) return prev;
      return clampViewWindow((prev.start + prev.end) / 2, curDur * 1.5, safeDuration);
    });
  };

  const focusClip = () => {
    const clipDur = outPoint - inPoint;
    const targetDur = Math.max(60, clipDur * 2.5);
    setViewWindow(clampViewWindow((inPoint + outPoint) / 2, targetDur, safeDuration));
  };

  const fitFull = () => {
    setViewWindow({ start: 0, end: safeDuration });
  };

  const handleOverviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = fraction * safeDuration;
    setViewWindow((prev) => clampViewWindow(targetTime, prev.end - prev.start, safeDuration));
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

  // Position mappings relative to viewWindow
  const toPercent = (t: number) => ((t - viewWindow.start) / viewDuration) * 100;
  const inPercent = toPercent(inPoint);
  const outPercent = toPercent(outPoint);
  const currentPercent = toPercent(currentTime);

  const clipLeftPercent = Math.max(0, Math.min(100, inPercent));
  const clipRightPercent = Math.max(0, Math.min(100, outPercent));
  const clipVisibleWidth = Math.max(0, clipRightPercent - clipLeftPercent);

  // Overview map percentages (0 to 100% of full video)
  const overviewClipLeft = (inPoint / safeDuration) * 100;
  const overviewClipWidth = Math.max(0.5, (clipDuration / safeDuration) * 100);
  const overviewWindowLeft = (viewWindow.start / safeDuration) * 100;
  const overviewWindowWidth = Math.min(100 - overviewWindowLeft, (viewDuration / safeDuration) * 100);
  const overviewPlayheadLeft = (currentTime / safeDuration) * 100;

  const handleSaveClick = () => {
    if (isSaving || clipDuration < 1) return;
    onClipSave(inPoint, outPoint, title.trim());
  };

  return (
    <div className="w-full bg-[#121212] border-t border-white/10 px-6 py-3 flex flex-col gap-3 shrink-0 text-white select-none shadow-2xl z-20">
      {/* Top Header: Badge, source title, In/Out/Duration stats, and Zoom Controls */}
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
            <span className="text-white/70 font-medium text-xs truncate max-w-[200px] md:max-w-[280px]" title={videoName}>
              {videoName}
            </span>
          )}
          <span className="text-white/40 text-[11px] hidden xl:inline border-l border-white/10 pl-2.5">
            Keys: <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">[</kbd> Start &bull; <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">]</kbd> End &bull; <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">&larr;/&rarr;</kbd> Seek &bull; <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-white/80">Space</kbd> Play
          </span>
        </div>

        <div className="flex items-center gap-3 tabular-nums text-xs">
          {/* Zoom controls */}
          {safeDuration > 30 && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5 mr-1">
              <button
                type="button"
                onClick={zoomOut}
                disabled={!isZoomed}
                className="px-2 py-0.5 text-white/70 hover:text-white hover:bg-white/10 rounded text-xs disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Zoom Out"
              >
                &minus;
              </button>
              <button
                type="button"
                onClick={focusClip}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${isZoomed ? "bg-[#3ea6ff]/20 text-[#3ea6ff]" : "text-white/70 hover:text-white hover:bg-white/10"}`}
                title="Zoom in to selection"
              >
                Focus Clip
              </button>
              <button
                type="button"
                onClick={fitFull}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${!isZoomed ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}
                title="Fit full timeline"
              >
                Full
              </button>
              <button
                type="button"
                onClick={zoomIn}
                className="px-2 py-0.5 text-white/70 hover:text-white hover:bg-white/10 rounded text-xs transition-colors"
                title="Zoom In"
              >
                +
              </button>
            </div>
          )}

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

      {/* Mini-map Full Timeline Overview Bar */}
      {safeDuration > 60 && (
        <div className="flex flex-col gap-1 px-1">
          <div
            onClick={handleOverviewClick}
            className="relative h-2 bg-white/10 hover:bg-white/15 rounded-full cursor-pointer overflow-hidden transition-colors"
            title="Full Video Overview - Click to jump window"
          >
            {/* Full clip region in overview */}
            <div
              className="absolute top-0 bottom-0 bg-[#3ea6ff] rounded-full pointer-events-none"
              style={{
                left: `${overviewClipLeft}%`,
                width: `${overviewClipWidth}%`,
              }}
            />
            {/* Viewport window highlight */}
            {isZoomed && (
              <div
                className="absolute top-0 bottom-0 bg-white/40 border border-white/70 rounded-full pointer-events-none"
                style={{
                  left: `${overviewWindowLeft}%`,
                  width: `${overviewWindowWidth}%`,
                }}
              />
            )}
            {/* Playhead in overview */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white rounded-full pointer-events-none -translate-x-1/2"
              style={{ left: `${overviewPlayheadLeft}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-white/30 px-0.5 tabular-nums">
            <span>0:00</span>
            <span>{formatDuration(safeDuration)} (Full)</span>
          </div>
        </div>
      )}

      {/* Main Detailed Scrubber Track */}
      <div className="relative pt-1 pb-1 px-2">
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          onWheel={handleWheel}
          className="relative h-12 bg-black/90 rounded-lg border border-white/15 cursor-pointer flex items-center overflow-visible select-none"
        >
          {/* Shaded unselected left */}
          {clipLeftPercent > 0 && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-black/75 rounded-l-lg pointer-events-none"
              style={{ width: `${clipLeftPercent}%` }}
            />
          )}

          {/* Active clip highlighted region */}
          {clipVisibleWidth > 0 && (
            <div
              className="absolute top-0 bottom-0 bg-[#3ea6ff]/20 border-y-2 border-[#3ea6ff] pointer-events-none"
              style={{
                left: `${clipLeftPercent}%`,
                width: `${clipVisibleWidth}%`,
              }}
            />
          )}

          {/* Shaded unselected right */}
          {clipRightPercent < 100 && (
            <div
              className="absolute top-0 bottom-0 right-0 bg-black/75 rounded-r-lg pointer-events-none"
              style={{ width: `${100 - clipRightPercent}%` }}
            />
          )}

          {/* Current playhead indicator needle */}
          {currentPercent >= 0 && currentPercent <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-30 transition-transform duration-75"
              style={{ left: `${currentPercent}%` }}
            >
              <div className="w-2.5 h-2.5 bg-white rounded-full -translate-x-[4px] -translate-y-1 shadow-sm" />
            </div>
          )}

          {/* Left in-point handle */}
          {inPercent >= -2 && inPercent <= 102 && (
            <div
              data-handle="in"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingHandle("in");
              }}
              className="absolute -top-1 -bottom-1 w-6 -translate-x-1/2 bg-[#3ea6ff] hover:bg-[#65b8ff] active:scale-105 cursor-ew-resize flex flex-col items-center justify-center rounded-l-md shadow-md z-40 transition-colors group touch-none"
              style={{ left: `${Math.max(0, Math.min(100, inPercent))}%` }}
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
          )}

          {/* Right out-point handle */}
          {outPercent >= -2 && outPercent <= 102 && (
            <div
              data-handle="out"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingHandle("out");
              }}
              className="absolute -top-1 -bottom-1 w-6 -translate-x-1/2 bg-[#3ea6ff] hover:bg-[#65b8ff] active:scale-105 cursor-ew-resize flex flex-col items-center justify-center rounded-r-md shadow-md z-40 transition-colors group touch-none"
              style={{ left: `${Math.max(0, Math.min(100, outPercent))}%` }}
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
          )}
        </div>

        {/* Timeline time marks below track */}
        <div className="flex justify-between items-center text-[11px] text-white/40 mt-1 px-1 tabular-nums">
          <span>{formatTimeWithSubseconds(viewWindow.start)}</span>
          <span className="text-white/70 font-medium">{formatTimeWithSubseconds(currentTime)}</span>
          <span>{formatTimeWithSubseconds(viewWindow.end)}</span>
        </div>
      </div>

      {/* Bottom bar: Play/Pause/Rewind + Clip Title Input + Action Buttons */}
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
