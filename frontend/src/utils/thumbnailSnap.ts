import { ElementLayout, TagThumbnailConfig } from "../types";
import { ElementRect } from "./thumbnailGenerator";

export type AnchorKind = "center" | "safe" | "edge" | "element";

export type EdgeAlignment = "center" | "leading" | "trailing";

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
  readonly alignment?: EdgeAlignment;
  readonly targetElementId?: string;
  readonly targetElementLabel?: string;
  readonly rawLabel?: string;
  readonly targetEdge?: "leading" | "center" | "trailing";
  readonly siblingRect?: ElementRect;
}

export interface SnapLockState {
  readonly lockedX: GridAnchor | null;
  readonly lockedY: GridAnchor | null;
}

export interface SnapAxisResult {
  readonly value: number;
  readonly locked: GridAnchor | null;
}

export interface SiblingElementSnapTarget {
  readonly id: "logo" | "title" | "episode" | string;
  readonly label: string;
  readonly rect: ElementRect;
}

export interface SmartGuideLine {
  readonly axis: "x" | "y";
  readonly coordinate: number;
  readonly sourceRect: ElementRect;
  readonly targetRect: ElementRect;
  readonly alignment: EdgeAlignment;
  readonly targetEdge: "leading" | "center" | "trailing";
  readonly targetLabel: string;
}

export interface StickySnapResult {
  readonly x: number;
  readonly y: number;
  readonly lockState: SnapLockState;
  readonly activeLabel: string | null;
  readonly smartGuides: readonly SmartGuideLine[];
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
    x = Math.min(0.5, base.x + halfW);
  } else if (base.x > 0.5) {
    x = Math.max(0.5, base.x - halfW);
  }

  let y = base.y;
  if (base.y < 0.5) {
    y = Math.min(0.5, base.y + halfH);
  } else if (base.y > 0.5) {
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

export function formatCandidateLabel(
  anchor: GridAnchor,
  alignment: EdgeAlignment,
  axisName?: "x" | "y"
): string {
  if (anchor.kind === "element") {
    return anchor.label;
  }
  const isX =
    axisName === "x" ||
    anchor.label.includes("X") ||
    anchor.label.includes("Left") ||
    anchor.label.includes("Right");

  if (alignment === "center") {
    if (anchor.kind === "edge") {
      return isX ? `Center X -> ${anchor.label}` : `Center Y -> ${anchor.label}`;
    }
    return anchor.label;
  }

  if (alignment === "leading") {
    const edgeName = isX ? "Left Edge" : "Top Edge";
    if (anchor.kind === "edge" && anchor.value <= 0.5) {
      return anchor.label;
    }
    return `${edgeName} -> ${anchor.label}`;
  }

  if (alignment === "trailing") {
    const edgeName = isX ? "Right Edge" : "Bottom Edge";
    if (anchor.kind === "edge" && anchor.value > 0.5) {
      return anchor.label;
    }
    return `${edgeName} -> ${anchor.label}`;
  }

  return anchor.label;
}

export function buildSiblingAnchors(
  otherElements: readonly SiblingElementSnapTarget[],
  canvasW: number,
  canvasH: number,
  axis: "x" | "y"
): readonly GridAnchor[] {
  const anchors: GridAnchor[] = [];

  for (const sibling of otherElements) {
    if (!sibling.rect || sibling.rect.w <= 0 || sibling.rect.h <= 0) continue;

    const descriptors =
      axis === "x"
        ? [
            {
              value: (sibling.rect.x + sibling.rect.w / 2) / canvasW,
              alignment: "center" as const,
              targetEdge: "center" as const,
              label: `Aligned with ${sibling.label} Center X`,
            },
            {
              value: sibling.rect.x / canvasW,
              alignment: "leading" as const,
              targetEdge: "leading" as const,
              label: `Left Edge -> ${sibling.label} Left Edge`,
            },
            {
              value: (sibling.rect.x + sibling.rect.w) / canvasW,
              alignment: "trailing" as const,
              targetEdge: "trailing" as const,
              label: `Right Edge -> ${sibling.label} Right Edge`,
            },
            {
              value: (sibling.rect.x + sibling.rect.w) / canvasW,
              alignment: "leading" as const,
              targetEdge: "trailing" as const,
              label: `Left Edge -> ${sibling.label} Right Edge`,
            },
            {
              value: sibling.rect.x / canvasW,
              alignment: "trailing" as const,
              targetEdge: "leading" as const,
              label: `Right Edge -> ${sibling.label} Left Edge`,
            },
          ]
        : [
            {
              value: (sibling.rect.y + sibling.rect.h / 2) / canvasH,
              alignment: "center" as const,
              targetEdge: "center" as const,
              label: `Aligned with ${sibling.label} Center Y`,
            },
            {
              value: sibling.rect.y / canvasH,
              alignment: "leading" as const,
              targetEdge: "leading" as const,
              label: `Top Edge -> ${sibling.label} Top Edge`,
            },
            {
              value: (sibling.rect.y + sibling.rect.h) / canvasH,
              alignment: "trailing" as const,
              targetEdge: "trailing" as const,
              label: `Bottom Edge -> ${sibling.label} Bottom Edge`,
            },
            {
              value: (sibling.rect.y + sibling.rect.h) / canvasH,
              alignment: "leading" as const,
              targetEdge: "trailing" as const,
              label: `Top Edge -> ${sibling.label} Bottom Edge`,
            },
            {
              value: sibling.rect.y / canvasH,
              alignment: "trailing" as const,
              targetEdge: "leading" as const,
              label: `Bottom Edge -> ${sibling.label} Top Edge`,
            },
          ];

    for (const d of descriptors) {
      anchors.push({
        value: d.value,
        kind: "element",
        alignment: d.alignment,
        targetEdge: d.targetEdge,
        targetElementId: sibling.id,
        targetElementLabel: sibling.label,
        siblingRect: sibling.rect,
        label: d.label,
      });
    }
  }

  return anchors;
}

/**
 * Stateful magnetic snap with hysteresis:
 * 1. Evaluates candidate alignment modes (center, leading edge, trailing edge) for all anchors.
 * 2. When locked, coordinates remain strictly pinned with breakout hysteresis.
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
    readonly axisName?: "x" | "y";
  }
): SnapAxisResult {
  const clamped = clamp(rawCoord, 0, 1);
  const captureThreshold = options?.captureThreshold ?? SNAP_CAPTURE_THRESHOLD;
  const breakoutThreshold = options?.breakoutThreshold ?? SNAP_BREAKOUT_THRESHOLD;
  const half = options?.halfSize ?? 0;
  const axisName = options?.axisName;

  const resolveLockedMetrics = (locked: GridAnchor) => {
    let alignment: EdgeAlignment = locked.alignment ?? "center";
    if (locked.alignment === undefined && locked.kind === "edge") {
      alignment = locked.value <= 0.5 ? "leading" : "trailing";
    }

    let dist: number;
    let targetCenter: number;

    if (alignment === "leading") {
      const edgeCoord = clamped - half;
      dist = Math.abs(edgeCoord - locked.value);
      targetCenter = locked.value + half;
    } else if (alignment === "trailing") {
      const edgeCoord = clamped + half;
      dist = Math.abs(edgeCoord - locked.value);
      targetCenter = locked.value - half;
    } else {
      dist = Math.abs(clamped - locked.value);
      targetCenter = locked.value;
    }

    return { dist, targetCenter, alignment };
  };

  if (currentLocked !== null) {
    const { dist, targetCenter } = resolveLockedMetrics(currentLocked);
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
    if (anchor.alignment !== undefined) {
      let edgeCoord = clamped;
      let targetCenter = anchor.value;
      if (anchor.alignment === "leading") {
        edgeCoord = clamped - half;
        targetCenter = anchor.value + half;
      } else if (anchor.alignment === "trailing") {
        edgeCoord = clamped + half;
        targetCenter = anchor.value - half;
      }
      const dist = Math.abs(edgeCoord - anchor.value);
      if (dist <= captureThreshold && dist < minDistance) {
        minDistance = dist;
        nearest = anchor;
        nearestTargetCenter = targetCenter;
      }
      continue;
    }

    if (half <= 0) {
      const dist = Math.abs(clamped - anchor.value);
      if (dist <= captureThreshold && dist < minDistance) {
        minDistance = dist;
        nearest = {
          ...anchor,
          alignment: "center",
          label: formatCandidateLabel(anchor, "center", axisName),
        };
        nearestTargetCenter = anchor.value;
      }
      continue;
    }

    interface Candidate {
      alignment: EdgeAlignment;
      dist: number;
      targetCenter: number;
      priorityBonus: number;
    }

    const candidates: Candidate[] = [
      {
        alignment: "center",
        dist: Math.abs(clamped - anchor.value),
        targetCenter: anchor.value,
        priorityBonus: anchor.kind === "center" ? 0.001 : 0,
      },
      {
        alignment: "leading",
        dist: Math.abs(clamped - half - anchor.value),
        targetCenter: anchor.value + half,
        priorityBonus: anchor.kind === "edge" && anchor.value <= 0.5 ? 0.001 : 0,
      },
      {
        alignment: "trailing",
        dist: Math.abs(clamped + half - anchor.value),
        targetCenter: anchor.value - half,
        priorityBonus: anchor.kind === "edge" && anchor.value > 0.5 ? 0.001 : 0,
      },
    ];

    for (const cand of candidates) {
      if (cand.dist <= captureThreshold) {
        const effectiveDist = cand.dist - cand.priorityBonus;
        const currentBestEffective = nearest
          ? minDistance - (nearest.kind === "center" && nearest.alignment === "center" ? 0.001 : 0)
          : Infinity;
        if (effectiveDist < currentBestEffective) {
          minDistance = cand.dist;
          nearestTargetCenter = cand.targetCenter;
          nearest = {
            ...anchor,
            alignment: cand.alignment,
            label: formatCandidateLabel(anchor, cand.alignment, axisName),
          };
        }
      }
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
    readonly otherElements?: readonly SiblingElementSnapTarget[];
    readonly canvasDimensions?: { readonly width: number; readonly height: number };
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
      smartGuides: [],
    };
  }

  const canvasW = options?.canvasDimensions?.width || 1280;
  const canvasH = options?.canvasDimensions?.height || 720;

  const baseAnchorsX = options?.anchorsX ?? GRID_ANCHORS_X;
  const baseAnchorsY = options?.anchorsY ?? GRID_ANCHORS_Y;

  const siblingAnchorsX = options?.otherElements
    ? buildSiblingAnchors(options.otherElements, canvasW, canvasH, "x")
    : [];
  const siblingAnchorsY = options?.otherElements
    ? buildSiblingAnchors(options.otherElements, canvasW, canvasH, "y")
    : [];

  const combinedAnchorsX = [...baseAnchorsX, ...siblingAnchorsX];
  const combinedAnchorsY = [...baseAnchorsY, ...siblingAnchorsY];

  const currentLockedX = prevLock?.lockedX ?? null;
  const currentLockedY = prevLock?.lockedY ?? null;

  const resX = snapAxisWithHysteresis(clampedX, currentLockedX, combinedAnchorsX, {
    ...options,
    halfSize: options?.elementSize?.halfW ?? 0,
    axisName: "x",
  });
  const resY = snapAxisWithHysteresis(clampedY, currentLockedY, combinedAnchorsY, {
    ...options,
    halfSize: options?.elementSize?.halfH ?? 0,
    axisName: "y",
  });

  const lockState: SnapLockState = { lockedX: resX.locked, lockedY: resY.locked };

  const smartGuides: SmartGuideLine[] = [];
  const activeW = (options?.elementSize?.halfW ?? 0) * 2 * canvasW;
  const activeH = (options?.elementSize?.halfH ?? 0) * 2 * canvasH;
  const activePxX = resX.value * canvasW - activeW / 2;
  const activePxY = resY.value * canvasH - activeH / 2;
  const sourceRect: ElementRect = {
    x: activePxX,
    y: activePxY,
    w: activeW,
    h: activeH,
  };

  if (resX.locked?.kind === "element" && resX.locked.siblingRect) {
    smartGuides.push({
      axis: "x",
      coordinate: Math.round(resX.locked.value * canvasW),
      sourceRect,
      targetRect: resX.locked.siblingRect,
      alignment: resX.locked.alignment ?? "center",
      targetEdge: resX.locked.targetEdge ?? "center",
      targetLabel: resX.locked.targetElementLabel ?? resX.locked.label,
    });
  }

  if (resY.locked?.kind === "element" && resY.locked.siblingRect) {
    smartGuides.push({
      axis: "y",
      coordinate: Math.round(resY.locked.value * canvasH),
      sourceRect,
      targetRect: resY.locked.siblingRect,
      alignment: resY.locked.alignment ?? "center",
      targetEdge: resY.locked.targetEdge ?? "center",
      targetLabel: resY.locked.targetElementLabel ?? resY.locked.label,
    });
  }

  return {
    x: resX.value,
    y: resY.value,
    lockState,
    activeLabel: buildSnapLabel(lockState),
    smartGuides,
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

export {
  renderAlignmentGuides,
  type RenderAlignmentGuidesOptions,
} from "./thumbnailGuideRenderer";
