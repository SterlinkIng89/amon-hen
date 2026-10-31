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
  buildSnapLabel,
  computeStickySnap,
  GRID_ANCHORS_X,
  GRID_ANCHORS_Y,
  ARTWORK_ANCHORS_X,
  ARTWORK_ANCHORS_Y,
  SnapLockState,
  SiblingElementSnapTarget,
  SmartGuideLine,
} from "../../utils/thumbnailSnap";
import { renderAlignmentGuides } from "../../utils/thumbnailGuideRenderer";
import {
  useThumbnailHistory,
  buildConfigRestorePatch,
  isEditableKeyboardTarget,
} from "../../hooks/useThumbnailHistory";

export interface ThumbnailCanvasEditorProps {
  readonly config: Partial<TagThumbnailConfig>;
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage?: HTMLImageElement | null;
  readonly gameTitle?: string;
  readonly episodeNumber: number;
  readonly className?: string;
  readonly isLoading?: boolean;
  readonly emptyMessage?: string;
  readonly onConfigChange: (patch: Partial<TagThumbnailConfig>) => void;
  readonly onRenderRects?: (rects: ThumbnailRects) => void;
  readonly historyResetKey?: string | number;
}

export default function ThumbnailCanvasEditor({
  config,
  baseImage,
  logoImage = null,
  gameTitle = "",
  episodeNumber,
  className = "",
  isLoading = false,
  emptyMessage,
  onConfigChange,
  onRenderRects,
  historyResetKey,
}: ThumbnailCanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rectsRef = useRef<ThumbnailRects>({});
  const [activeDrag, setActiveDrag] = useState<ThumbnailElementId | "image" | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rawFramingRef = useRef<ImageFraming>(
    config.image_framing || DEFAULT_FRAMING
  );

  const history = useThumbnailHistory(config, {
    resetKey: historyResetKey,
  });

  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showSafeZone, setShowSafeZone] = useState<boolean>(false);
  const [selectedElement, setSelectedElement] = useState<ThumbnailElementId | null>(null);
  const [activeSnapLabel, setActiveSnapLabel] = useState<string | null>(null);
  const [quickAlignedElement, setQuickAlignedElement] = useState<ThumbnailElementId | null>(null);
  const quickAlignTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCoordsRef = useRef<{
    title?: { x?: number; y?: number };
    logo?: { x?: number; y?: number };
    episode?: { x?: number; y?: number };
  }>({
    title: config.title ? { x: config.title.x, y: config.title.y } : undefined,
    logo: config.logo ? { x: config.logo.x, y: config.logo.y } : undefined,
    episode: config.episode_layout ? { x: config.episode_layout.x, y: config.episode_layout.y } : undefined,
  });

  const snapLockRef = useRef<SnapLockState>({ lockedX: null, lockedY: null });
  const smartGuidesRef = useRef<readonly SmartGuideLine[]>([]);
  const dragRawPosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  useEffect(() => {
    if (selectedElement === "logo" && !config.logo?.enabled) {
      setSelectedElement(null);
    } else if (selectedElement === "title" && !config.title?.enabled) {
      setSelectedElement(null);
    }
  }, [config.logo?.enabled, config.title?.enabled, selectedElement]);

  const getSiblingElements = useCallback(
    (currentDrag: ThumbnailElementId): readonly SiblingElementSnapTarget[] => {
      const siblings: SiblingElementSnapTarget[] = [];
      const rects = rectsRef.current;

      if (currentDrag !== "logo" && rects.logo && rects.logo.w > 0 && rects.logo.h > 0) {
        siblings.push({
          id: "logo",
          label: "Steam Game Logo",
          rect: rects.logo,
        });
      }
      if (currentDrag !== "title" && rects.title && rects.title.w > 0 && rects.title.h > 0) {
        siblings.push({
          id: "title",
          label: "Game Title",
          rect: rects.title,
        });
      }
      if (currentDrag !== "episode" && rects.episode && rects.episode.w > 0 && rects.episode.h > 0) {
        siblings.push({
          id: "episode",
          label: "Episode Badge",
          rect: rects.episode,
        });
      }

      return siblings;
    },
    []
  );

  const handleCenterArtwork = () => {
    const current = config.image_framing || DEFAULT_FRAMING;
    const centeredFraming = clampFraming({ ...current, offset_x: 0.5, offset_y: 0.5 });
    rawFramingRef.current = centeredFraming;
    const lockState: SnapLockState = {
      lockedX: ARTWORK_ANCHORS_X[0] || null,
      lockedY: ARTWORK_ANCHORS_Y[0] || null,
    };
    snapLockRef.current = lockState;
    smartGuidesRef.current = [];
    setActiveSnapLabel(buildSnapLabel(lockState));
    history.pushState({
      ...config,
      image_framing: centeredFraming,
    });
    onConfigChange({
      image_framing: centeredFraming,
    });
  };

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
    onRenderRects?.(renderedRects);

    const ctx = canvas.getContext("2d");
    const shouldRenderGuides =
      showGrid ||
      showSafeZone ||
      activeDrag !== null ||
      quickAlignedElement !== null ||
      selectedElement !== null;
    if (ctx && shouldRenderGuides) {
      const activeTarget =
        activeDrag && activeDrag !== "image"
          ? activeDrag
          : (quickAlignedElement ?? selectedElement);
      const targetRect =
        activeTarget ? renderedRects[activeTarget] : undefined;
      renderAlignmentGuides(ctx, canvas.width || 1280, canvas.height || 720, {
        showBaseGrid: showGrid,
        autoFade: activeDrag !== null && !showGrid,
        lockState: snapLockRef.current,
        activeRect: targetRect,
        selectedRect: targetRect,
        showCrosshairs: Boolean(targetRect),
        showSafeZone,
        smartGuides: smartGuidesRef.current,
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
    showSafeZone,
    selectedElement,
    activeDrag,
    quickAlignedElement,
    onRenderRects,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    return () => {
      if (quickAlignTimerRef.current) {
        clearTimeout(quickAlignTimerRef.current);
      }
      if (nudgeTimerRef.current) {
        clearTimeout(nudgeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeDrag !== null) {
      prevCoordsRef.current = {
        title: config.title ? { x: config.title.x, y: config.title.y } : undefined,
        logo: config.logo ? { x: config.logo.x, y: config.logo.y } : undefined,
        episode: config.episode_layout ? { x: config.episode_layout.x, y: config.episode_layout.y } : undefined,
      };
      return;
    }

    const curTitle = config.title ? { x: config.title.x, y: config.title.y } : undefined;
    const curLogo = config.logo ? { x: config.logo.x, y: config.logo.y } : undefined;
    const curEpisode = config.episode_layout ? { x: config.episode_layout.x, y: config.episode_layout.y } : undefined;

    const prevTitle = prevCoordsRef.current.title;
    const prevLogo = prevCoordsRef.current.logo;
    const prevEpisode = prevCoordsRef.current.episode;

    let alignedTarget: ThumbnailElementId | null = null;
    let targetX = 0.5;
    let targetY = 0.5;

    if (
      curTitle &&
      prevTitle &&
      (curTitle.x !== prevTitle.x || curTitle.y !== prevTitle.y)
    ) {
      alignedTarget = "title";
      targetX = curTitle.x ?? 0.5;
      targetY = curTitle.y ?? 0.85;
    } else if (
      curLogo &&
      prevLogo &&
      (curLogo.x !== prevLogo.x || curLogo.y !== prevLogo.y)
    ) {
      alignedTarget = "logo";
      targetX = curLogo.x ?? 0.2;
      targetY = curLogo.y ?? 0.2;
    } else if (
      curEpisode &&
      prevEpisode &&
      (curEpisode.x !== prevEpisode.x || curEpisode.y !== prevEpisode.y)
    ) {
      alignedTarget = "episode";
      targetX = curEpisode.x ?? 0.85;
      targetY = curEpisode.y ?? 0.85;
    }

    prevCoordsRef.current = {
      title: curTitle,
      logo: curLogo,
      episode: curEpisode,
    };

    if (alignedTarget) {
      const activeRect = rectsRef.current[alignedTarget];
      const canvasW = canvasRef.current?.width || 1280;
      const canvasH = canvasRef.current?.height || 720;
      const halfW = activeRect ? (activeRect.w / canvasW) / 2 : 0.13;
      const halfH = activeRect ? (activeRect.h / canvasH) / 2 : 0.13;

      const snapResult = computeStickySnap(targetX, targetY, undefined, {
        elementSize: { halfW, halfH },
      });

      snapLockRef.current = snapResult.lockState;
      smartGuidesRef.current = snapResult.smartGuides;
      setActiveSnapLabel(snapResult.activeLabel);
      setQuickAlignedElement(alignedTarget);

      if (quickAlignTimerRef.current) {
        clearTimeout(quickAlignTimerRef.current);
      }
      quickAlignTimerRef.current = setTimeout(() => {
        setQuickAlignedElement(null);
        snapLockRef.current = { lockedX: null, lockedY: null };
        smartGuidesRef.current = [];
        setActiveSnapLabel(null);
      }, 2500);
    }
  }, [
    config.title?.x,
    config.title?.y,
    config.logo?.x,
    config.logo?.y,
    config.episode_layout?.x,
    config.episode_layout?.y,
    activeDrag,
  ]);

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

    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }

    if (hit) {
      history.beginBatch();
      setActiveDrag(hit);
      setSelectedElement(hit);
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
      history.beginBatch();
      setActiveDrag("image");
      setSelectedElement(null);
      rawFramingRef.current = clampFraming(config.image_framing || DEFAULT_FRAMING);
      snapLockRef.current = { lockedX: null, lockedY: null };
      setActiveSnapLabel(null);
    } else {
      setSelectedElement(null);
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

    const bypassSnap = !snapEnabled || Boolean(e.altKey);

    if (activeDrag === "image") {
      if (!baseImage) return;
      const rawFraming = panFraming(
        rawFramingRef.current,
        dx * scaleX,
        dy * scaleY,
        baseImage.naturalWidth,
        baseImage.naturalHeight,
        canvasW,
        canvasH
      );
      rawFramingRef.current = rawFraming;

      const snapResult = computeStickySnap(
        rawFraming.offset_x,
        rawFraming.offset_y,
        snapLockRef.current,
        {
          bypassSnap,
          anchorsX: ARTWORK_ANCHORS_X,
          anchorsY: ARTWORK_ANCHORS_Y,
        }
      );

      snapLockRef.current = snapResult.lockState;
      setActiveSnapLabel(snapResult.activeLabel);
      const framingPatch = {
        image_framing: { ...rawFraming, offset_x: snapResult.x, offset_y: snapResult.y },
      };
      history.updateBatchPreview({ ...config, ...framingPatch });
      onConfigChange(framingPatch);
    } else {
      // Moving an element (episode, logo, or title)
      const deltaNormalizedX = (dx * scaleX) / canvasW;
      const deltaNormalizedY = (dy * scaleY) / canvasH;

      const rawX = Math.max(0, Math.min(1, dragRawPosRef.current.x + deltaNormalizedX));
      const rawY = Math.max(0, Math.min(1, dragRawPosRef.current.y + deltaNormalizedY));
      dragRawPosRef.current = { x: rawX, y: rawY };

      const activeRect = rectsRef.current[activeDrag];
      const halfW = activeRect ? (activeRect.w / canvasW) / 2 : 0;
      const halfH = activeRect ? (activeRect.h / canvasH) / 2 : 0;

      const otherElements = getSiblingElements(activeDrag);

      const snapResult = computeStickySnap(
        rawX,
        rawY,
        snapLockRef.current,
        {
          bypassSnap,
          elementSize: { halfW, halfH },
          otherElements,
          canvasDimensions: { width: canvasW, height: canvasH },
        }
      );

      snapLockRef.current = snapResult.lockState;
      smartGuidesRef.current = snapResult.smartGuides;
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
        const epPatch = {
          episode_layout: {
            ...cur,
            x: snapResult.x,
            y: snapResult.y,
          },
        };
        history.updateBatchPreview({ ...config, ...epPatch });
        onConfigChange(epPatch);
      } else if (activeDrag === "logo" && config.logo) {
        const logoPatch = {
          logo: {
            ...config.logo,
            x: snapResult.x,
            y: snapResult.y,
          },
        };
        history.updateBatchPreview({ ...config, ...logoPatch });
        onConfigChange(logoPatch);
      } else if (activeDrag === "title" && config.title) {
        const titlePatch = {
          title: {
            ...config.title,
            x: snapResult.x,
            y: snapResult.y,
          },
        };
        history.updateBatchPreview({ ...config, ...titlePatch });
        onConfigChange(titlePatch);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeDrag) return;
    history.commitBatch();
    setActiveDrag(null);
    dragStartRef.current = null;
    snapLockRef.current = { lockedX: null, lockedY: null };
    smartGuidesRef.current = [];
    setActiveSnapLabel(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === "Escape") {
      setSelectedElement(null);
      snapLockRef.current = { lockedX: null, lockedY: null };
      smartGuidesRef.current = [];
      setActiveSnapLabel(null);
      if (nudgeTimerRef.current) {
        clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = null;
      }
      e.preventDefault();
      return;
    }

    const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (!arrowKeys.includes(e.key)) return;

    const target =
      selectedElement ||
      (config.logo?.enabled ? "logo" : config.title?.enabled ? "title" : "episode");

    if (!target) return;

    if (selectedElement !== target) {
      setSelectedElement(target);
    }

    const step = e.shiftKey ? 0.02 : 0.005;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    if (e.key === "ArrowRight") dx = step;
    if (e.key === "ArrowUp") dy = -step;
    if (e.key === "ArrowDown") dy = step;

    let updatedCoord: { x: number; y: number } | null = null;

    if (target === "logo" && config.logo?.enabled) {
      const cur = config.logo;
      const updated = clampLayout({
        x: cur.x + dx,
        y: cur.y + dy,
        scale: cur.scale,
      });
      updatedCoord = { x: updated.x, y: updated.y };
      const patch = { logo: { ...cur, ...updated } };
      history.pushState({ ...config, ...patch });
      onConfigChange(patch);
      e.preventDefault();
    } else if (target === "title" && config.title?.enabled) {
      const cur = config.title;
      const updated = clampLayout({
        x: cur.x + dx,
        y: cur.y + dy,
        scale: cur.scale,
      });
      updatedCoord = { x: updated.x, y: updated.y };
      const patch = { title: { ...cur, ...updated } };
      history.pushState({ ...config, ...patch });
      onConfigChange(patch);
      e.preventDefault();
    } else if (target === "episode") {
      const cur = config.episode_layout || { x: 0.85, y: 0.85, scale: 1 };
      const updated = clampLayout({
        x: cur.x + dx,
        y: cur.y + dy,
        scale: cur.scale,
      });
      updatedCoord = { x: updated.x, y: updated.y };
      const patch = { episode_layout: updated };
      history.pushState({ ...config, ...patch });
      onConfigChange(patch);
      e.preventDefault();
    }

    if (updatedCoord) {
      const canvasW = canvasRef.current?.width || 1280;
      const canvasH = canvasRef.current?.height || 720;
      const targetRect = rectsRef.current[target];
      const halfW = targetRect ? (targetRect.w / canvasW) / 2 : 0;
      const halfH = targetRect ? (targetRect.h / canvasH) / 2 : 0;
      const otherElements = getSiblingElements(target);

      const snapResult = computeStickySnap(
        updatedCoord.x,
        updatedCoord.y,
        undefined,
        {
          bypassSnap: !snapEnabled,
          elementSize: { halfW, halfH },
          otherElements,
          canvasDimensions: { width: canvasW, height: canvasH },
        }
      );

      snapLockRef.current = snapResult.lockState;
      smartGuidesRef.current = snapResult.smartGuides;
      const pctLabel = `X ${Math.round(updatedCoord.x * 100)}% • Y ${Math.round(updatedCoord.y * 100)}%`;
      setActiveSnapLabel(snapResult.activeLabel || pctLabel);

      if (nudgeTimerRef.current) {
        clearTimeout(nudgeTimerRef.current);
      }
      nudgeTimerRef.current = setTimeout(() => {
        snapLockRef.current = { lockedX: null, lockedY: null };
        smartGuidesRef.current = [];
        setActiveSnapLabel(null);
      }, 1500);
    }
  };

  const handleUndo = useCallback(() => {
    const target = history.undo();
    if (target) {
      onConfigChange(buildConfigRestorePatch(config, target));
    }
  }, [config, history, onConfigChange]);

  const handleRedo = useCallback(() => {
    const target = history.redo();
    if (target) {
      onConfigChange(buildConfigRestorePatch(config, target));
    }
  }, [config, history, onConfigChange]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;

      if (e.key === "Escape") {
        setSelectedElement(null);
        snapLockRef.current = { lockedX: null, lockedY: null };
        smartGuidesRef.current = [];
        setActiveSnapLabel(null);
        if (nudgeTimerRef.current) {
          clearTimeout(nudgeTimerRef.current);
          nudgeTimerRef.current = null;
        }
        return;
      }

      const isMac =
        typeof navigator !== "undefined" &&
        Boolean(navigator.platform && navigator.platform.toUpperCase().includes("MAC"));
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (!modifier || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if (key === "y" && !e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [handleUndo, handleRedo]);

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {/* 16:9 Canvas Frame */}
      <div
        className={`aspect-video w-full rounded-lg overflow-hidden bg-black/60 relative select-none shadow-xs transition-colors duration-150 ${
          activeDrag !== null || quickAlignedElement !== null
            ? "border-2 border-accent"
            : "border border-border-subtle"
        }`}
      >
        {/* Active Snap HUD Indicator */}
        {activeSnapLabel && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <span className="bg-black/80 text-accent border border-accent/40 rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow-xs flex items-center gap-1.5 whitespace-nowrap select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {activeSnapLabel}
            </span>
          </div>
        )}

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

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-base/60 backdrop-blur-xs pointer-events-none z-10">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && !baseImage && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-text-muted bg-base/80 pointer-events-none z-10">
            {emptyMessage || "No artwork loaded"}
          </span>
        )}
      </div>

      {/* Canvas Tooling Controls (Underneath the preview) */}
      <div className="flex items-center justify-between gap-1.5 text-xs select-none flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Center artwork"
            title="Center the background artwork (offset 50%, 50%)"
            disabled={!baseImage}
            onClick={handleCenterArtwork}
            className="btn btn-secondary btn-xs text-[11px] font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="22" y1="12" x2="18" y2="12" />
              <line x1="6" y1="12" x2="2" y2="12" />
              <line x1="12" y1="6" x2="12" y2="2" />
              <line x1="12" y1="22" x2="12" y2="18" />
            </svg>
            <span>Center art</span>
          </button>

          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!history.canUndo}
            onClick={handleUndo}
            className="btn btn-secondary btn-xs text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            <span>Undo</span>
          </button>

          <button
            type="button"
            aria-label="Redo"
            title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
            disabled={!history.canRedo}
            onClick={handleRedo}
            className="btn btn-secondary btn-xs text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Redo</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Toggle magnetic grid snap"
            title="Toggle magnetic grid snap (or hold Alt while dragging)"
            onClick={() => setSnapEnabled((prev) => !prev)}
            className={`btn btn-xs text-[11px] font-medium transition-colors cursor-pointer ${
              snapEnabled
                ? "btn-secondary text-accent border border-accent/40 bg-accent/15"
                : "btn-secondary text-text-muted hover:text-white"
            }`}
          >
            Snap: {snapEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            aria-label="Show or hide 3x3 alignment grid"
            title="Show or hide 3x3 alignment grid"
            onClick={() => setShowGrid((prev) => !prev)}
            className={`btn btn-xs text-[11px] font-medium transition-colors cursor-pointer ${
              showGrid
                ? "btn-secondary text-accent border border-accent/40 bg-accent/15"
                : "btn-secondary text-text-muted hover:text-white"
            }`}
          >
            Grid: {showGrid ? "On" : "Off"}
          </button>
          <button
            type="button"
            aria-label="Toggle YouTube timestamp safe zone overlay"
            title="Toggle YouTube timestamp safe zone (bottom-right 14% area)"
            onClick={() => setShowSafeZone((prev) => !prev)}
            className={`btn btn-xs text-[11px] font-medium transition-colors cursor-pointer ${
              showSafeZone
                ? "btn-secondary text-accent border border-accent/40 bg-accent/15"
                : "btn-secondary text-text-muted hover:text-white"
            }`}
          >
            Safe zone: {showSafeZone ? "On" : "Off"}
          </button>
        </div>
      </div>
    </div>
  );
}
