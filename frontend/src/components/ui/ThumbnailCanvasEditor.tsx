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

export interface ThumbnailCanvasEditorProps {
  readonly config: TagThumbnailConfig;
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
      position: config.episode_position || "bottom-right",
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
    } else if (baseImage) {
      setActiveDrag("image");
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
        const updated = clampLayout({
          x: cur.x + deltaNormalizedX,
          y: cur.y + deltaNormalizedY,
          scale: cur.scale,
        });
        onConfigChange({ episode_layout: updated });
      } else if (activeDrag === "logo" && config.logo) {
        const updated = clampLayout({
          x: config.logo.x + deltaNormalizedX,
          y: config.logo.y + deltaNormalizedY,
          scale: config.logo.scale,
        });
        onConfigChange({
          logo: {
            ...config.logo,
            ...updated,
          },
        });
      } else if (activeDrag === "title" && config.title) {
        const updated = clampLayout({
          x: config.title.x + deltaNormalizedX,
          y: config.title.y + deltaNormalizedY,
          scale: config.title.scale,
        });
        onConfigChange({
          title: {
            ...config.title,
            ...updated,
          },
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeDrag) return;
    setActiveDrag(null);
    dragStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`aspect-video w-full rounded border border-white/10 overflow-hidden bg-black/60 relative select-none ${className}`}
    >
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        tabIndex={0}
        aria-label="Thumbnail canvas preview with interactive elements"
        className={`w-full h-full object-cover touch-none ${
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
      />
    </div>
  );
}
