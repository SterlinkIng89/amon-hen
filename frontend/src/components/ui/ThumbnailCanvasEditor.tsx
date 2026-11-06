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
  ElementRect,
  ResizeHandleId,
  hitTestResizeHandle,
  computeCornerResizeScale,
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
import ThumbnailCanvasToolbar from "./ThumbnailCanvasToolbar";

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
  readonly selectedElement?: ThumbnailElementId | null;
  readonly onSelectElement?: (element: ThumbnailElementId | null) => void;
}

interface ActiveResizeState {
  readonly element: ThumbnailElementId;
  readonly handle: ResizeHandleId;
  readonly initialRect: ElementRect;
  readonly initialScale: number;
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
  selectedElement: controlledSelectedElement,
  onSelectElement,
}: ThumbnailCanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rectsRef = useRef<ThumbnailRects>({});
  const [activeDrag, setActiveDrag] = useState<ThumbnailElementId | "image" | null>(null);
  const [activeResize, setActiveResize] = useState<ActiveResizeState | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<ResizeHandleId | null>(null);
  const [hoveredElement, setHoveredElement] = useState<ThumbnailElementId | null>(null);
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
  const [internalSelectedElement, setInternalSelectedElement] = useState<ThumbnailElementId | null>(null);
  const selectedElement = controlledSelectedElement !== undefined ? controlledSelectedElement : internalSelectedElement;
  const setSelectedElement = useCallback(
    (target: ThumbnailElementId | null) => {
      setInternalSelectedElement(target);
      onSelectElement?.(target);
    },
    [onSelectElement]
  );
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
      setActiveResize(null);
    } else if (selectedElement === "title" && !config.title?.enabled) {
      setSelectedElement(null);
      setActiveResize(null);
    }
  }, [config.logo?.enabled, config.title?.enabled, selectedElement, setSelectedElement]);

  const getSiblingElements = useCallback(
    (currentDrag: ThumbnailElementId): readonly SiblingElementSnapTarget[] => {
      const items: Array<{ id: ThumbnailElementId; label: string }> = [
        { id: "logo", label: "Steam Game Logo" },
        { id: "title", label: "Game Title" },
        { id: "episode", label: "Episode Badge" },
      ];
      return items
        .filter((item) => item.id !== currentDrag && (rectsRef.current[item.id]?.w ?? 0) > 0)
        .map((item) => ({ id: item.id, label: item.label, rect: rectsRef.current[item.id]! }));
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

  const applyElementScale = useCallback(
    (target: ThumbnailElementId, newScale: number, isInteractiveBatch = false) => {
      let patch: Partial<TagThumbnailConfig> | null = null;
      if (target === "logo" && config.logo) {
        patch = { logo: { ...config.logo, scale: newScale } };
      } else if (target === "title" && config.title) {
        patch = { title: { ...config.title, scale: newScale } };
      } else if (target === "episode") {
        const cur = config.episode_layout || {
          x: rectsRef.current.episode
            ? (rectsRef.current.episode.x + rectsRef.current.episode.w / 2) / (canvasRef.current?.width || 1280)
            : 0.85,
          y: rectsRef.current.episode
            ? (rectsRef.current.episode.y + rectsRef.current.episode.h / 2) / (canvasRef.current?.height || 720)
            : 0.85,
          scale: 1,
        };
        patch = { episode_layout: { ...cur, scale: newScale } };
      }
      if (!patch) return;
      if (isInteractiveBatch) {
        history.updateBatchPreview({ ...config, ...patch });
      } else {
        history.pushState({ ...config, ...patch });
      }
      onConfigChange(patch);
    },
    [config, history, onConfigChange]
  );

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
      activeResize !== null ||
      quickAlignedElement !== null ||
      selectedElement !== null;
    if (ctx && shouldRenderGuides) {
      const activeTarget =
        activeResize !== null
          ? activeResize.element
          : activeDrag && activeDrag !== "image"
          ? activeDrag
          : (quickAlignedElement ?? selectedElement);
      const targetRect =
        activeTarget ? renderedRects[activeTarget] : undefined;
      renderAlignmentGuides(ctx, canvas.width || 1280, canvas.height || 720, {
        showBaseGrid: showGrid,
        autoFade: (activeDrag !== null || activeResize !== null) && !showGrid,
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
    activeResize,
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

    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }

    // 1. Check if clicking on a resize corner handle of the selected element first
    if (selectedElement && rectsRef.current[selectedElement]) {
      const selectedRect = rectsRef.current[selectedElement]!;
      const handleHit = hitTestResizeHandle(selectedRect, canvasPoint.x, canvasPoint.y);
      if (handleHit) {
        const currentScale =
          selectedElement === "logo"
            ? config.logo?.scale ?? 1
            : selectedElement === "title"
            ? config.title?.scale ?? 1
            : config.episode_layout?.scale ?? 1;

        history.beginBatch();
        setActiveResize({
          element: selectedElement,
          handle: handleHit,
          initialRect: { ...selectedRect },
          initialScale: currentScale,
        });
        snapLockRef.current = { lockedX: null, lockedY: null };
        smartGuidesRef.current = [];
        setActiveSnapLabel(`Scale: ${Math.round(currentScale * 100)}%`);
        dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }
    }

    const hit = hitTestElements(rectsRef.current, canvasPoint.x, canvasPoint.y);

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
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const canvasW = canvas.width || 1280;
    const canvasH = canvas.height || 720;
    const rect = canvas.getBoundingClientRect();
    const canvasPoint = pointerToCanvasPoint(
      e.clientX,
      e.clientY,
      rect,
      canvasW,
      canvasH
    );

    // Active corner resize dragging
    if (activeResize) {
      const minScale = activeResize.element === "episode" ? 0.5 : 0.4;
      const maxScale = activeResize.element === "episode" ? 2.0 : 2.5;

      const newScale = computeCornerResizeScale({
        handle: activeResize.handle,
        initialRect: activeResize.initialRect,
        initialScale: activeResize.initialScale,
        currentCanvasX: canvasPoint.x,
        currentCanvasY: canvasPoint.y,
        minScale,
        maxScale,
      });

      setActiveSnapLabel(`Scale: ${Math.round(newScale * 100)}%`);
      applyElementScale(activeResize.element, newScale, true);
      return;
    }

    // Hover hit-testing when not dragging or resizing
    if (!activeDrag || !dragStartRef.current) {
      if (selectedElement && rectsRef.current[selectedElement]) {
        const handleHit = hitTestResizeHandle(
          rectsRef.current[selectedElement]!,
          canvasPoint.x,
          canvasPoint.y
        );
        setHoveredHandle(handleHit);
        if (handleHit) {
          setHoveredElement(null);
          return;
        }
      } else if (hoveredHandle !== null) {
        setHoveredHandle(null);
      }

      const elemHit = hitTestElements(rectsRef.current, canvasPoint.x, canvasPoint.y);
      setHoveredElement(elemHit);
      return;
    }

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };

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
    if (activeResize) {
      history.commitBatch();
      setActiveResize(null);
      dragStartRef.current = null;
      snapLockRef.current = { lockedX: null, lockedY: null };
      smartGuidesRef.current = [];
      setActiveSnapLabel(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }

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
      setActiveResize(null);
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

    const scaleKeys = ["+", "=", "-", "_"];
    if (scaleKeys.includes(e.key)) {
      const target =
        selectedElement ||
        (config.logo?.enabled ? "logo" : config.title?.enabled ? "title" : "episode");
      if (target) {
        if (selectedElement !== target) {
          setSelectedElement(target);
        }
        const delta = e.key === "+" || e.key === "=" ? 0.05 : -0.05;
        const curScale =
          target === "logo"
            ? config.logo?.scale ?? 1
            : target === "title"
            ? config.title?.scale ?? 1
            : config.episode_layout?.scale ?? 1;
        const minScale = target === "episode" ? 0.5 : 0.4;
        const maxScale = target === "episode" ? 2.0 : 2.5;
        const newScale = Math.max(
          minScale,
          Math.min(maxScale, Math.round((curScale + delta) * 100) / 100)
        );

        applyElementScale(target, newScale, false);
        setActiveSnapLabel(`Scale: ${Math.round(newScale * 100)}%`);
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(() => setActiveSnapLabel(null), 1500);
        e.preventDefault();
        return;
      }
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

  const getCanvasCursorClass = () => {
    if (activeResize) {
      return activeResize.handle === "nw" || activeResize.handle === "se"
        ? "cursor-nwse-resize"
        : "cursor-nesw-resize";
    }
    if (activeDrag) {
      return "cursor-grabbing";
    }
    if (hoveredHandle) {
      return hoveredHandle === "nw" || hoveredHandle === "se"
        ? "cursor-nwse-resize"
        : "cursor-nesw-resize";
    }
    if (hoveredElement) {
      return "cursor-grab";
    }
    return baseImage ? "cursor-grab" : "cursor-default";
  };

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {/* 16:9 Canvas Frame */}
      <div
        className={`aspect-video w-full rounded-lg overflow-hidden bg-black/60 relative select-none shadow-xs transition-colors duration-150 ${
          activeDrag !== null || activeResize !== null || quickAlignedElement !== null
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
          className={`w-full h-full object-cover touch-none outline-none ${getCanvasCursorClass()}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            if (!activeDrag && !activeResize) {
              setHoveredHandle(null);
              setHoveredElement(null);
            }
          }}
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

        {/* Selection Shortcut Hint Bar */}
        {selectedElement && !activeDrag && !activeResize && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-10 max-w-[90%]">
            <span className="bg-black/85 backdrop-blur-xs text-text-muted border border-border-subtle rounded-md px-2.5 py-1 text-[11px] font-medium shadow-xs flex items-center gap-1.5 whitespace-nowrap select-none">
              <span className="text-text-primary font-semibold">
                {selectedElement === "logo"
                  ? "Steam logo"
                  : selectedElement === "title"
                  ? "Title overlay"
                  : "Episode badge"}
              </span>
              <span className="text-text-muted">• Drag corners or +/- to scale • Arrows to nudge • Esc to deselect</span>
            </span>
          </div>
        )}
      </div>

      <ThumbnailCanvasToolbar
        hasBaseImage={Boolean(baseImage)}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        snapEnabled={snapEnabled}
        showGrid={showGrid}
        showSafeZone={showSafeZone}
        onCenterArtwork={handleCenterArtwork}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleSnap={() => setSnapEnabled((prev) => !prev)}
        onToggleGrid={() => setShowGrid((prev) => !prev)}
        onToggleSafeZone={() => setShowSafeZone((prev) => !prev)}
      />
    </div>
  );
}
