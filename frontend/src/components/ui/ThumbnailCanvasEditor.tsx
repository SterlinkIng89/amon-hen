import React, { useRef, useEffect, useState, useCallback } from "react";
import { TagThumbnailConfig, ImageFraming, ElementLayout } from "../../types";
import {
  renderThumbnailToCanvas,
  DEFAULT_FRAMING,
  panFraming,
  clampFraming,
  clampLayout,
  hitTestElements,
  pointerToCanvasPoint,
  ThumbnailRects,
  ThumbnailElementId,
} from "../../utils/thumbnailGenerator";
import {
  computeStickySnap,
  renderAlignmentGuides,
  SnapLockState,
} from "../../utils/thumbnailSnap";

export interface ThumbnailCanvasEditorProps {
  readonly config: Partial<TagThumbnailConfig>;
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage?: HTMLImageElement | null;
  readonly gameTitle?: string;
  readonly episodeNumber: number;
  readonly className?: string;
  readonly onConfigChange: (patch: Partial<TagThumbnailConfig>) => void;
}

export default function ThumbnailCanvasEditor({
  config,
  baseImage,
  logoImage = null,
  gameTitle = "",
  episodeNumber,
  className = "",
  onConfigChange,
}: ThumbnailCanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rectsRef = useRef<ThumbnailRects>({});
  const [activeDrag, setActiveDrag] = useState<ThumbnailElementId | "image" | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const currentFramingRef = useRef<ImageFraming>(
    config.image_framing || DEFAULT_FRAMING
  );

  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [activeSnapLabel, setActiveSnapLabel] = useState<string | null>(null);

  const snapLockRef = useRef<SnapLockState>({ lockedX: null, lockedY: null });
  const dragRawPosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const selectedElementRef = useRef<ThumbnailElementId | null>(null);

  useEffect(() => {
    currentFramingRef.current = config.image_framing || DEFAULT_FRAMING;
  }, [config.image_framing]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderedRects = renderThumbnailToCanvas(canvas, baseImage, {
      showEpisode: true,
      episodeNumber: episodeNumber > 0 ? episodeNumber : 1,
      episodeFormat: config.episode_format || "pad2",
      position: config.episode_position || "bottom-left",
      fontColor: config.font_color || "#ffffff",
      framing: config.image_framing || DEFAULT_FRAMING,
      episodeLayout: config.episode_layout,
      logo: config.logo?.enabled
        ? {
            image: logoImage,
            layout: config.logo,
          }
        : undefined,
      title: config.title?.enabled
        ? {
            text: config.title.text_override || gameTitle,
            layout: config.title,
          }
        : undefined,
    });

    rectsRef.current = renderedRects;

    const ctx = canvas.getContext("2d");
    if (ctx && (showGrid || activeDrag !== null)) {
      const activeRect =
        activeDrag && activeDrag !== "image"
          ? renderedRects[activeDrag]
          : undefined;
      renderAlignmentGuides(ctx, canvas.width || 1280, canvas.height || 720, {
        showBaseGrid: showGrid,
        lockState: snapLockRef.current,
        activeRect,
      });
    }
  }, [
    baseImage,
    logoImage,
    gameTitle,
    episodeNumber,
    config.episode_format,
    config.episode_position,
    config.font_color,
    config.image_framing,
    config.episode_layout,
    config.logo,
    config.title,
    showGrid,
    activeDrag,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const canvasPoint = pointerToCanvasPoint(
      e.clientX,
      e.clientY,
      bounds,
      canvas.width || 1280,
      canvas.height || 720
    );

    const hit = hitTestElements(rectsRef.current, canvasPoint.x, canvasPoint.y);

    if (hit) {
      setActiveDrag(hit);
      selectedElementRef.current = hit;
      const canvasW = canvas.width || 1280;
      const canvasH = canvas.height || 720;
      if (hit === "episode") {
        const curX =
          config.episode_layout?.x ??
          (rectsRef.current.episode
            ? (rectsRef.current.episode.x + rectsRef.current.episode.w / 2) / canvasW
            : 0.85);
        const curY =
          config.episode_layout?.y ??
          (rectsRef.current.episode
            ? (rectsRef.current.episode.y + rectsRef.current.episode.h / 2) / canvasH
            : 0.85);
        dragRawPosRef.current = { x: curX, y: curY };
      } else if (hit === "logo") {
        dragRawPosRef.current = {
          x: config.logo?.x ?? 0.2,
          y: config.logo?.y ?? 0.2,
        };
      } else if (hit === "title") {
        dragRawPosRef.current = {
          x: config.title?.x ?? 0.5,
          y: config.title?.y ?? 0.85,
        };
      }
      snapLockRef.current = { lockedX: null, lockedY: null };
      setActiveSnapLabel(null);
    } else if (baseImage) {
      setActiveDrag("image");
      selectedElementRef.current = null;
    } else {
      return;
    }

    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeDrag || !dragStartRef.current || !canvasRef.current) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };

    const canvasW = canvasRef.current.width || 1280;
    const canvasH = canvasRef.current.height || 720;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasW / (rect.width || 1);
    const scaleY = canvasH / (rect.height || 1);

    if (activeDrag === "image") {
      if (!baseImage) return;
      const dxCanvas = dx * scaleX;
      const dyCanvas = dy * scaleY;
      const updated = panFraming(
        currentFramingRef.current,
        dxCanvas,
        dyCanvas,
        baseImage.naturalWidth,
        baseImage.naturalHeight,
        canvasW,
        canvasH
      );
      currentFramingRef.current = updated;
      onConfigChange({ image_framing: updated });
    } else {
      // Moving an element (episode, logo, or title)
      const deltaNormalizedX = (dx * scaleX) / canvasW;
      const deltaNormalizedY = (dy * scaleY) / canvasH;

      dragRawPosRef.current = {
        x: Math.max(0, Math.min(1, dragRawPosRef.current.x + deltaNormalizedX)),
        y: Math.max(0, Math.min(1, dragRawPosRef.current.y + deltaNormalizedY)),
      };

      const bypassSnap = !snapEnabled || Boolean(e.altKey);
      const snapResult = computeStickySnap(
        dragRawPosRef.current.x,
        dragRawPosRef.current.y,
        snapLockRef.current,
        { bypassSnap }
      );
      snapLockRef.current = snapResult.lockState;
      setActiveSnapLabel(snapResult.activeLabel);

      if (activeDrag === "episode") {
        const cur = config.episode_layout || {
          x: rectsRef.current.episode
            ? (rectsRef.current.episode.x + rectsRef.current.episode.w / 2) / canvasW
            : 0.85,
          y: rectsRef.current.episode
            ? (rectsRef.current.episode.y + rectsRef.current.episode.h / 2) / canvasH
            : 0.85,
          scale: 1,
        };
        onConfigChange({
          episode_layout: {
            ...cur,
            x: snapResult.x,
            y: snapResult.y,
          },
        });
      } else if (activeDrag === "logo" && config.logo) {
        onConfigChange({
          logo: {
            ...config.logo,
            x: snapResult.x,
            y: snapResult.y,
          },
        });
      } else if (activeDrag === "title" && config.title) {
        onConfigChange({
          title: {
            ...config.title,
            x: snapResult.x,
            y: snapResult.y,
          },
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeDrag) return;
    setActiveDrag(null);
    dragStartRef.current = null;
    snapLockRef.current = { lockedX: null, lockedY: null };
    setActiveSnapLabel(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (!arrowKeys.includes(e.key)) return;

    const target =
      selectedElementRef.current ||
      (config.logo?.enabled ? "logo" : config.title?.enabled ? "title" : "episode");

    const step = e.shiftKey ? 0.02 : 0.005;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    if (e.key === "ArrowRight") dx = step;
    if (e.key === "ArrowUp") dy = -step;
    if (e.key === "ArrowDown") dy = step;

    if (target === "logo" && config.logo?.enabled) {
      const cur = config.logo;
      const updated = clampLayout({
        x: cur.x + dx,
        y: cur.y + dy,
        scale: cur.scale,
      });
      onConfigChange({ logo: { ...cur, ...updated } });
      e.preventDefault();
    } else if (target === "title" && config.title?.enabled) {
      const cur = config.title;
      const updated = clampLayout({
        x: cur.x + dx,
        y: cur.y + dy,
        scale: cur.scale,
      });
      onConfigChange({ title: { ...cur, ...updated } });
      e.preventDefault();
    } else if (target === "episode") {
      const cur = config.episode_layout || { x: 0.85, y: 0.85, scale: 1 };
      const updated = clampLayout({
        x: cur.x + dx,
        y: cur.y + dy,
        scale: cur.scale,
      });
      onConfigChange({ episode_layout: updated });
      e.preventDefault();
    }
  };

  return (
    <div
      className={`aspect-video w-full rounded border border-white/10 overflow-hidden bg-black/60 relative select-none ${className}`}
    >
      {/* Active Snap HUD Indicator */}
      {activeSnapLabel && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <span className="bg-black/80 text-accent border border-accent/40 rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow-sm flex items-center gap-1.5 whitespace-nowrap select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {activeSnapLabel}
          </span>
        </div>
      )}

      {/* Floating Toolbar (Top Right) */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10 bg-black/60 backdrop-blur-xs p-1 rounded-md border border-white/10 text-xs select-none">
        <button
          type="button"
          aria-label="Toggle magnetic grid snap"
          title="Toggle magnetic grid snap (or hold Alt while dragging)"
          onClick={() => setSnapEnabled((prev) => !prev)}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
            snapEnabled
              ? "bg-accent/20 text-accent border border-accent/40"
              : "text-text-muted hover:text-white"
          }`}
        >
          Snap: {snapEnabled ? "On" : "Off"}
        </button>
        <button
          type="button"
          aria-label="Show or hide 3x3 alignment grid"
          title="Show or hide 3x3 alignment grid"
          onClick={() => setShowGrid((prev) => !prev)}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
            showGrid
              ? "bg-accent/20 text-accent border border-accent/40"
              : "text-text-muted hover:text-white"
          }`}
        >
          Grid: {showGrid ? "On" : "Off"}
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        tabIndex={0}
        aria-label="Thumbnail canvas preview with interactive elements"
        className={`w-full h-full object-cover touch-none outline-none ${
          activeDrag
            ? "cursor-grabbing"
            : baseImage
            ? "cursor-grab"
            : "cursor-default"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
