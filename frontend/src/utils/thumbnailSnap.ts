import { ElementLayout } from "../types";
import { ElementRect } from "./thumbnailGenerator";

export type AnchorKind = "center" | "thirds" | "safe";

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

export const SNAP_CAPTURE_THRESHOLD = 0.022;
export const SNAP_BREAKOUT_THRESHOLD = 0.045;

export const GRID_ANCHORS_X: readonly GridAnchor[] = [
  { value: 0.18, label: "Left Safe (18%)", kind: "safe" },
  { value: 1 / 3, label: "Left Third (33.3%)", kind: "thirds" },
  { value: 0.5, label: "Center X (50%)", kind: "center" },
  { value: 2 / 3, label: "Right Third (66.7%)", kind: "thirds" },
  { value: 0.82, label: "Right Safe (82%)", kind: "safe" },
];

export const GRID_ANCHORS_Y: readonly GridAnchor[] = [
  { value: 0.18, label: "Top Safe (18%)", kind: "safe" },
  { value: 1 / 3, label: "Top Third (33.3%)", kind: "thirds" },
  { value: 0.5, label: "Center Y (50%)", kind: "center" },
  { value: 2 / 3, label: "Bottom Third (66.7%)", kind: "thirds" },
  { value: 0.82, label: "Bottom Safe (82%)", kind: "safe" },
];

export const ANCHOR_PRESETS: Record<
  AnchorPresetId,
  { readonly x: number; readonly y: number; readonly label: string }
> = {
  "top-left": { x: 0.18, y: 0.18, label: "Top Left" },
  "top-center": { x: 0.5, y: 0.18, label: "Top Center" },
  "top-right": { x: 0.82, y: 0.18, label: "Top Right" },
  "center-left": { x: 0.18, y: 0.5, label: "Center Left" },
  "center": { x: 0.5, y: 0.5, label: "Center" },
  "center-right": { x: 0.82, y: 0.5, label: "Center Right" },
  "bottom-left": { x: 0.18, y: 0.82, label: "Bottom Left" },
  "bottom-center": { x: 0.5, y: 0.82, label: "Bottom Center" },
  "bottom-right": { x: 0.82, y: 0.82, label: "Bottom Right" },
};

const PRESET_ENTRIES = Object.entries(ANCHOR_PRESETS) as [
  AnchorPresetId,
  { readonly x: number; readonly y: number; readonly label: string },
][];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(val) ? val : min));
}

function computeAxisSnap(
  rawCoord: number,
  currentLocked: GridAnchor | null,
  anchors: readonly GridAnchor[],
  captureThreshold: number,
  breakoutThreshold: number
): { readonly value: number; readonly locked: GridAnchor | null } {
  const clamped = clamp(rawCoord, 0, 1);

  if (currentLocked !== null) {
    const distToLock = Math.abs(clamped - currentLocked.value);
    if (distToLock <= breakoutThreshold) {
      return { value: currentLocked.value, locked: currentLocked };
    }
  }

  let closestAnchor: GridAnchor | null = null;
  let minDistance = Infinity;

  for (const anchor of anchors) {
    const dist = Math.abs(clamped - anchor.value);
    if (dist <= captureThreshold && dist < minDistance) {
      minDistance = dist;
      closestAnchor = anchor;
    }
  }

  if (closestAnchor !== null) {
    return { value: closestAnchor.value, locked: closestAnchor };
  }

  return { value: clamped, locked: null };
}

export function computeStickySnap(
  rawX: number,
  rawY: number,
  prevLock: SnapLockState,
  options?: {
    readonly bypassSnap?: boolean;
    readonly captureThreshold?: number;
    readonly breakoutThreshold?: number;
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

  const captureThreshold = options?.captureThreshold ?? SNAP_CAPTURE_THRESHOLD;
  const breakoutThreshold = options?.breakoutThreshold ?? SNAP_BREAKOUT_THRESHOLD;

  const resX = computeAxisSnap(
    clampedX,
    prevLock.lockedX,
    GRID_ANCHORS_X,
    captureThreshold,
    breakoutThreshold
  );

  const resY = computeAxisSnap(
    clampedY,
    prevLock.lockedY,
    GRID_ANCHORS_Y,
    captureThreshold,
    breakoutThreshold
  );

  const lockState: SnapLockState = {
    lockedX: resX.locked,
    lockedY: resY.locked,
  };

  let activeLabel: string | null = null;
  if (lockState.lockedX && lockState.lockedY) {
    activeLabel = `${lockState.lockedX.label} • ${lockState.lockedY.label}`;
  } else if (lockState.lockedX) {
    activeLabel = lockState.lockedX.label;
  } else if (lockState.lockedY) {
    activeLabel = lockState.lockedY.label;
  }

  return {
    x: resX.value,
    y: resY.value,
    lockState,
    activeLabel,
  };
}

export function detectActiveAnchorPreset(
  layout: Pick<ElementLayout, "x" | "y">,
  tolerance = 0.02
): AnchorPresetId | null {
  let matchedPreset: AnchorPresetId | null = null;
  let minDistance = Infinity;

  for (const [id, preset] of PRESET_ENTRIES) {
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

  if (options.showBaseGrid) {
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (const anchor of GRID_ANCHORS_X) {
      const x = Math.round(anchor.value * width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (const anchor of GRID_ANCHORS_Y) {
      const y = Math.round(anchor.value * height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  const { lockedX, lockedY } = options.lockState;

  if (lockedX) {
    const x = Math.round(lockedX.value * width);
    ctx.strokeStyle = lockedX.kind === "center" ? "#f97316" : "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  if (lockedY) {
    const y = Math.round(lockedY.value * height);
    ctx.strokeStyle = lockedY.kind === "center" ? "#f97316" : "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (options.activeRect) {
    const { x, y, w, h } = options.activeRect;
    ctx.strokeStyle = lockedX || lockedY ? "#f97316" : "#38bdf8";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);

    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.setLineDash([]);
    ctx.fillStyle = lockedX && lockedY ? "#f97316" : "#38bdf8";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}
