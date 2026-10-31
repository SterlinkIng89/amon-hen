import { ElementLayout, TagThumbnailConfig } from "../types";
import { ElementRect } from "./thumbnailGenerator";

export type AnchorKind = "center" | "safe" | "edge";

export type AnchorPresetId =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface GridAnchor {
  readonly value: number;
  readonly label: string;
  readonly kind: AnchorKind;
}

export interface SnapLockState {
  readonly lockedX: GridAnchor | null;
  readonly lockedY: GridAnchor | null;
}

export interface SnapAxisResult {
  readonly value: number;
  readonly locked: GridAnchor | null;
}

export interface StickySnapResult {
  readonly x: number;
  readonly y: number;
  readonly lockState: SnapLockState;
  readonly activeLabel: string | null;
}

export interface RenderAlignmentGuidesOptions {
  readonly showBaseGrid: boolean;
  readonly lockState: SnapLockState;
  readonly activeRect?: ElementRect;
}

// Crisp, targeted capture threshold: captures when pointer is very close to anchor (~12px on 1280px canvas)
export const SNAP_CAPTURE_THRESHOLD = 0.010;
// Gentle breakout threshold: holds position strictly, then smoothly releases when pushed
export const SNAP_BREAKOUT_THRESHOLD = 0.016;

/**
 * Clean boundary alignment frame:
 * - Outer boundary snap (0.05 / 0.95): keeps elements and framing gracefully pinned near the frame borders.
 * - Center axes (0.50): principal anchor for elements and artwork framing.
 * - Horizontal quarter lines (0.28 / 0.72): extra horizontal guide lines as requested.
 */
export const GRID_ANCHORS_X: readonly GridAnchor[] = [
  { value: 0.05, label: "Left Edge (5%)", kind: "edge" },
  { value: 0.5, label: "Center X (50%)", kind: "center" },
  { value: 0.95, label: "Right Edge (95%)", kind: "edge" },
];

export const GRID_ANCHORS_Y: readonly GridAnchor[] = [
  { value: 0.05, label: "Top Edge (5%)", kind: "edge" },
  { value: 0.28, label: "Upper Guide (28%)", kind: "safe" },
  { value: 0.5, label: "Center Y (50%)", kind: "center" },
  { value: 0.72, label: "Lower Guide (72%)", kind: "safe" },
  { value: 0.95, label: "Bottom Edge (95%)", kind: "edge" },
];

/**
 * Boundary and center anchors for background artwork panning (offset_x, offset_y in [0, 1])
 */
export const ARTWORK_ANCHORS_X: readonly GridAnchor[] = [
  { value: 0.0, label: "Artwork Left Bound", kind: "edge" },
  { value: 0.5, label: "Artwork Center X", kind: "center" },
  { value: 1.0, label: "Artwork Right Bound", kind: "edge" },
];

export const ARTWORK_ANCHORS_Y: readonly GridAnchor[] = [
  { value: 0.0, label: "Artwork Top Bound", kind: "edge" },
  { value: 0.5, label: "Artwork Center Y", kind: "center" },
  { value: 1.0, label: "Artwork Bottom Bound", kind: "edge" },
];

export const ANCHOR_PRESETS: Record<
  AnchorPresetId,
  { readonly x: number; readonly y: number; readonly label: string }
> = {
  "top-left": { x: 0.05, y: 0.05, label: "Top Left" },
  "top-center": { x: 0.5, y: 0.05, label: "Top Center" },
  "top-right": { x: 0.95, y: 0.05, label: "Top Right" },
  "center-left": { x: 0.05, y: 0.5, label: "Center Left" },
  "center": { x: 0.5, y: 0.5, label: "Center" },
  "center-right": { x: 0.95, y: 0.5, label: "Center Right" },
  "bottom-left": { x: 0.05, y: 0.95, label: "Bottom Left" },
  "bottom-center": { x: 0.5, y: 0.95, label: "Bottom Center" },
  "bottom-right": { x: 0.95, y: 0.95, label: "Bottom Right" },
};

const PRESET_ENTRIES = Object.entries(ANCHOR_PRESETS) as [
  AnchorPresetId,
  { readonly x: number; readonly y: number; readonly label: string },
][];

export interface ElementHalfDimensions {
  readonly halfW?: number;
  readonly halfH?: number;
}

/**
 * Calculates preset center coordinates adjusted so the element's outer edge
 * aligns with perimeter guidelines (0.05 and 0.95) rather than its center.
 */
export function getPresetCoordinates(
  presetId: AnchorPresetId,
  elementSize?: ElementHalfDimensions
): { x: number; y: number } {
  const base = ANCHOR_PRESETS[presetId];
  const halfW = elementSize?.halfW ?? 0;
  const halfH = elementSize?.halfH ?? 0;

  let x = base.x;
  if (base.x < 0.5) {
    // Left edge aligns with base.x (0.05) -> center is 0.05 + halfW
    x = Math.min(0.5, base.x + halfW);
  } else if (base.x > 0.5) {
    // Right edge aligns with base.x (0.95) -> center is 0.95 - halfW
    x = Math.max(0.5, base.x - halfW);
  }

  let y = base.y;
  if (base.y < 0.5) {
    // Top edge aligns with base.y (0.05) -> center is 0.05 + halfH
    y = Math.min(0.5, base.y + halfH);
  } else if (base.y > 0.5) {
    // Bottom edge aligns with base.y (0.95) -> center is 0.95 - halfH
    y = Math.max(0.5, base.y - halfH);
  }

  return { x, y };
}

/**
 * Derives normalized half-dimensions (halfW, halfH) for canvas elements
 * using exact rendered bounding rects when available, or reliable visual fallbacks.
 */
export function getElementHalfDimensions(
  elementId: "logo" | "title" | "episode",
  config: TagThumbnailConfig,
  renderedRect?: ElementRect,
  defaultTitle?: string
): { halfW: number; halfH: number } {
  if (renderedRect && renderedRect.w > 0 && renderedRect.h > 0) {
    return {
      halfW: renderedRect.w / (2 * 1280),
      halfH: renderedRect.h / (2 * 720),
    };
  }

  if (elementId === "logo") {
    const scale = config.logo?.scale ?? 1;
    return {
      halfW: Math.min(0.4, 0.13 * scale),
      halfH: Math.min(0.4, 0.13 * scale),
    };
  }

  if (elementId === "title") {
    const scale = config.title?.scale ?? 1;
    return {
      halfW: Math.min(0.4, 0.20 * scale),
      halfH: Math.min(0.4, 0.13 * scale),
    };
  }

  // episode badge
  const scale = config.episode_layout?.scale ?? 1;
  return {
    halfW: Math.min(0.4, 0.13 * scale),
    halfH: Math.min(0.4, 0.13 * scale),
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(val) ? val : min));
}

/**
 * Stateful magnetic snap with hysteresis:
 * 1. Only captures when the element's edge (for edge guides) or center (for center guides)
 *    enters within `captureThreshold`.
 * 2. When locked, the coordinate remains strictly pinned so the bounding edge touches the guide.
 * 3. Moving past `breakoutThreshold` cleanly releases the lock for fluid movement.
 */
export function snapAxisWithHysteresis(
  rawCoord: number,
  currentLocked: GridAnchor | null,
  anchors: readonly GridAnchor[],
  options?: {
    readonly captureThreshold?: number;
    readonly breakoutThreshold?: number;
    readonly halfSize?: number;
  }
): SnapAxisResult {
  const clamped = clamp(rawCoord, 0, 1);
  const captureThreshold = options?.captureThreshold ?? SNAP_CAPTURE_THRESHOLD;
  const breakoutThreshold = options?.breakoutThreshold ?? SNAP_BREAKOUT_THRESHOLD;
  const half = options?.halfSize ?? 0;

  const getAnchorMetrics = (anchor: GridAnchor) => {
    if (anchor.kind === "edge") {
      if (anchor.value <= 0.5) {
        // Min edge (left / top): element's leading edge is clamped - half
        const edgeCoord = clamped - half;
        const targetCenter = Math.min(0.5, anchor.value + half);
        const dist = Math.abs(edgeCoord - anchor.value);
        return { dist, targetCenter };
      } else {
        // Max edge (right / bottom): element's trailing edge is clamped + half
        const edgeCoord = clamped + half;
        const targetCenter = Math.max(0.5, anchor.value - half);
        const dist = Math.abs(edgeCoord - anchor.value);
        return { dist, targetCenter };
      }
    }
    // Center or safe-zone: aligns element center
    return {
      dist: Math.abs(clamped - anchor.value),
      targetCenter: anchor.value,
    };
  };

  if (currentLocked !== null) {
    const { dist, targetCenter } = getAnchorMetrics(currentLocked);
    if (dist <= breakoutThreshold) {
      return {
        value: targetCenter,
        locked: currentLocked,
      };
    }

    return {
      value: clamped,
      locked: null,
    };
  }

  let nearest: GridAnchor | null = null;
  let nearestTargetCenter = clamped;
  let minDistance = Infinity;

  for (const anchor of anchors) {
    const { dist, targetCenter } = getAnchorMetrics(anchor);
    if (dist <= captureThreshold && dist < minDistance) {
      minDistance = dist;
      nearest = anchor;
      nearestTargetCenter = targetCenter;
    }
  }

  if (nearest !== null) {
    return {
      value: nearestTargetCenter,
      locked: nearest,
    };
  }

  return {
    value: clamped,
    locked: null,
  };
}

export function snapAxisToAnchors(
  rawCoord: number,
  anchors: readonly GridAnchor[],
  captureThreshold: number = SNAP_CAPTURE_THRESHOLD,
  breakoutThreshold: number = SNAP_BREAKOUT_THRESHOLD,
  currentLocked: GridAnchor | null = null,
  halfSize: number = 0
): SnapAxisResult {
  return snapAxisWithHysteresis(rawCoord, currentLocked, anchors, {
    captureThreshold,
    breakoutThreshold,
    halfSize,
  });
}

export function buildSnapLabel(lockState: SnapLockState): string | null {
  const { lockedX, lockedY } = lockState;
  if (lockedX && lockedY) return `${lockedX.label} • ${lockedY.label}`;
  return lockedX?.label ?? lockedY?.label ?? null;
}

export function computeStickySnap(
  rawX: number,
  rawY: number,
  prevLock?: SnapLockState,
  options?: {
    readonly bypassSnap?: boolean;
    readonly captureThreshold?: number;
    readonly breakoutThreshold?: number;
    readonly anchorsX?: readonly GridAnchor[];
    readonly anchorsY?: readonly GridAnchor[];
    readonly elementSize?: ElementHalfDimensions;
  }
): StickySnapResult {
  const clampedX = clamp(rawX, 0, 1);
  const clampedY = clamp(rawY, 0, 1);

  if (options?.bypassSnap) {
    return {
      x: clampedX,
      y: clampedY,
      lockState: { lockedX: null, lockedY: null },
      activeLabel: null,
    };
  }

  const anchorsX = options?.anchorsX ?? GRID_ANCHORS_X;
  const anchorsY = options?.anchorsY ?? GRID_ANCHORS_Y;
  const currentLockedX = prevLock?.lockedX ?? null;
  const currentLockedY = prevLock?.lockedY ?? null;

  const resX = snapAxisWithHysteresis(clampedX, currentLockedX, anchorsX, {
    ...options,
    halfSize: options?.elementSize?.halfW ?? 0,
  });
  const resY = snapAxisWithHysteresis(clampedY, currentLockedY, anchorsY, {
    ...options,
    halfSize: options?.elementSize?.halfH ?? 0,
  });

  const lockState: SnapLockState = { lockedX: resX.locked, lockedY: resY.locked };

  return {
    x: resX.value,
    y: resY.value,
    lockState,
    activeLabel: buildSnapLabel(lockState),
  };
}

export function detectActiveAnchorPreset(
  layout: Pick<ElementLayout, "x" | "y">,
  elementSizeOrTolerance?: ElementHalfDimensions | number,
  maybeTolerance?: number
): AnchorPresetId | null {
  const elementSize =
    typeof elementSizeOrTolerance === "object" ? elementSizeOrTolerance : undefined;
  const tolerance =
    typeof elementSizeOrTolerance === "number"
      ? elementSizeOrTolerance
      : maybeTolerance ?? 0.025;

  let matchedPreset: AnchorPresetId | null = null;
  let minDistance = Infinity;

  for (const [id] of PRESET_ENTRIES) {
    const preset = getPresetCoordinates(id, elementSize);
    const dx = Math.abs(layout.x - preset.x);
    const dy = Math.abs(layout.y - preset.y);
    if (dx <= tolerance && dy <= tolerance) {
      const dist = Math.hypot(dx, dy);
      if (dist < minDistance) {
        minDistance = dist;
        matchedPreset = id;
      }
    }
  }

  return matchedPreset;
}

export function renderAlignmentGuides(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: RenderAlignmentGuidesOptions
): void {
  if (width <= 0 || height <= 0) return;

  ctx.save();

  // High-contrast outer image / canvas perimeter border (shown whenever grid is on or an element is dragged)
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.strokeRect(1, 1, width - 2, height - 2);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.restore();

  if (options.showBaseGrid) {
    const xMin = Math.round(0.05 * width);
    const xMax = Math.round(0.95 * width);
    const yMin = Math.round(0.05 * height);
    const yMax = Math.round(0.95 * height);
    const midX = Math.round(0.5 * width);
    const midY = Math.round(0.5 * height);

    // Pass 1: Dark halo backdrop for universal contrast against light or busy artwork
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.lineWidth = 3.5;
    ctx.setLineDash([]);
    ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);

    ctx.beginPath();
    ctx.moveTo(midX, yMin);
    ctx.lineTo(midX, yMax);
    ctx.moveTo(xMin, midY);
    ctx.lineTo(xMax, midY);
    for (const anchor of GRID_ANCHORS_Y) {
      if (anchor.kind === "safe") {
        const y = Math.round(anchor.value * height);
        ctx.moveTo(xMin, y);
        ctx.lineTo(xMax, y);
      }
    }
    ctx.stroke();

    // Pass 2: High-contrast foreground strokes
    // Outer bounding frame & center crosshair in vibrant golden yellow
    ctx.strokeStyle = "#ffd000";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);

    ctx.beginPath();
    ctx.moveTo(midX, yMin);
    ctx.lineTo(midX, yMax);
    ctx.moveTo(xMin, midY);
    ctx.lineTo(xMax, midY);
    ctx.stroke();

    // Horizontal extra safe guides (vibrant sky cyan)
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    for (const anchor of GRID_ANCHORS_Y) {
      if (anchor.kind === "safe") {
        const y = Math.round(anchor.value * height);
        ctx.beginPath();
        ctx.moveTo(xMin, y);
        ctx.lineTo(xMax, y);
        ctx.stroke();
      }
    }
  }

  const { lockedX, lockedY } = options.lockState;

  if (lockedX) {
    const x = Math.round(lockedX.value * width);
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.lineWidth = 4.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.strokeStyle = lockedX.kind === "safe" ? "#38bdf8" : "#ffd000";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.restore();
  }

  if (lockedY) {
    const y = Math.round(lockedY.value * height);
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.lineWidth = 4.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.strokeStyle = lockedY.kind === "safe" ? "#38bdf8" : "#ffd000";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.restore();
  }

  if (options.activeRect) {
    const { x, y, w, h } = options.activeRect;
    const isLocked = Boolean(lockedX || lockedY);

    ctx.save();
    // 1. Dark outer shadow/halo for bounding box
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);

    // 2. High-contrast foreground bounding box (vibrant gold when locked/aligned, pure white when moving)
    ctx.strokeStyle = isLocked ? "#ffd000" : "#ffffff";
    ctx.lineWidth = 2.25;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, w, h);

    // 3. Pro corner ticks/brackets
    const cornerLen = Math.max(10, Math.min(18, Math.min(w, h) / 3));
    ctx.setLineDash([]);
    ctx.strokeStyle = isLocked ? "#ffd000" : "#ffffff";
    ctx.lineWidth = 3;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    // Top-right
    ctx.moveTo(x + w - cornerLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerLen);
    // Bottom-left
    ctx.moveTo(x, y + h - cornerLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerLen, y + h);
    // Bottom-right
    ctx.moveTo(x + w - cornerLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();

    // 4. Center anchor pin
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isLocked ? "#ff7700" : "#00f0ff";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}
