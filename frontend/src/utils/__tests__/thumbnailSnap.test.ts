import { describe, it, expect, vi } from "vitest";
import {
  computeStickySnap,
  detectActiveAnchorPreset,
  renderAlignmentGuides,
  snapAxisWithHysteresis,
  snapAxisToAnchors,
  SNAP_CAPTURE_THRESHOLD,
  SNAP_BREAKOUT_THRESHOLD,
  GRID_ANCHORS_X,
  GRID_ANCHORS_Y,
  ANCHOR_PRESETS,
  SnapLockState,
  getPresetCoordinates,
  getElementHalfDimensions,
} from "../thumbnailSnap";

describe("thumbnailSnap - computeStickySnap", () => {
  it("returns free coordinates outside the capture threshold", () => {
    const result = computeStickySnap(0.40, 0.40);

    expect(result.x).toBeCloseTo(0.40, 5);
    expect(result.y).toBeCloseTo(0.40, 5);
    expect(result.lockState.lockedX).toBeNull();
    expect(result.lockState.lockedY).toBeNull();
    expect(result.activeLabel).toBeNull();
  });

  it("locks strictly on center axes when pointer enters capture zone", () => {
    const result = computeStickySnap(0.505, 0.495);

    expect(result.x).toBe(0.5);
    expect(result.y).toBe(0.5);
    expect(result.lockState.lockedX?.kind).toBe("center");
    expect(result.lockState.lockedY?.kind).toBe("center");
    expect(result.activeLabel).toContain("Center X (50%)");
    expect(result.activeLabel).toContain("Center Y (50%)");
  });

  it("holds position strictly locked at anchor without padding or wobble while within breakout", () => {
    const centerAnchor = GRID_ANCHORS_X.find((a) => a.kind === "center")!;
    const prevLock: SnapLockState = { lockedX: centerAnchor, lockedY: null };

    // Move pointer slightly within breakout threshold (0.012 < SNAP_BREAKOUT_THRESHOLD)
    const result = computeStickySnap(0.512, 0.25, prevLock);

    expect(result.x).toBe(0.5); // Strictly pinned at center
    expect(result.lockState.lockedX).toBe(centerAnchor);
    expect(result.activeLabel).toBe("Center X (50%)");
  });

  it("breaks out cleanly when force exceeds breakout threshold", () => {
    const centerAnchor = GRID_ANCHORS_X.find((a) => a.kind === "center")!;
    const prevLock: SnapLockState = { lockedX: centerAnchor, lockedY: null };

    // Raw pointer pulled just past breakout
    const result = computeStickySnap(0.5 + SNAP_BREAKOUT_THRESHOLD + 0.002, 0.25, prevLock);

    expect(result.lockState.lockedX).toBeNull();
    expect(result.x).toBeCloseTo(0.5 + SNAP_BREAKOUT_THRESHOLD + 0.002, 5);
  });

  it("captures edge and safe-zone anchors", () => {
    const result = computeStickySnap(0.05 + 0.002, 0.28 - 0.002);

    expect(result.x).toBeCloseTo(0.05, 5);
    expect(result.y).toBeCloseTo(0.28, 5);
    expect(result.lockState.lockedX?.kind).toBe("edge");
    expect(result.lockState.lockedY?.kind).toBe("safe");
  });

  it("bypasses snapping completely when bypassSnap is true", () => {
    const result = computeStickySnap(0.505, 0.495, undefined, { bypassSnap: true });

    expect(result.x).toBe(0.505);
    expect(result.y).toBe(0.495);
    expect(result.lockState.lockedX).toBeNull();
    expect(result.lockState.lockedY).toBeNull();
    expect(result.activeLabel).toBeNull();
  });

  it("clamps raw coordinates to [0, 1] range", () => {
    const result = computeStickySnap(-0.2, 1.3, undefined, { bypassSnap: true });

    expect(result.x).toBe(0);
    expect(result.y).toBe(1);
  });

  it("supports single-axis active label formatting", () => {
    expect(computeStickySnap(0.5, 0.25).activeLabel).toBe("Center X (50%)");
  });

  it("snaps element outer edges to boundary guidelines without overflowing", () => {
    const elementSize = { halfW: 0.15, halfH: 0.08 };

    // When dragging near bottom boundary (0.95), bottom edge (rawY + 0.08) enters capture
    const bottomResult = computeStickySnap(0.5, 0.871, undefined, { elementSize });
    expect(bottomResult.y).toBeCloseTo(0.95 - 0.08, 4);
    expect(bottomResult.lockState.lockedY?.label).toBe("Bottom Edge (95%)");

    // When dragging near top boundary (0.05), top edge (rawY - 0.08) enters capture
    const topResult = computeStickySnap(0.5, 0.129, undefined, { elementSize });
    expect(topResult.y).toBeCloseTo(0.05 + 0.08, 4);
    expect(topResult.lockState.lockedY?.label).toBe("Top Edge (5%)");

    // When dragging near left boundary (0.05), left edge (rawX - 0.15) enters capture
    const leftResult = computeStickySnap(0.201, 0.5, undefined, { elementSize });
    expect(leftResult.x).toBeCloseTo(0.05 + 0.15, 4);
    expect(leftResult.lockState.lockedX?.label).toBe("Left Edge (5%)");

    // When dragging near right boundary (0.95), right edge (rawX + 0.15) enters capture
    const rightResult = computeStickySnap(0.799, 0.5, undefined, { elementSize });
    expect(rightResult.x).toBeCloseTo(0.95 - 0.15, 4);
    expect(rightResult.lockState.lockedX?.label).toBe("Right Edge (95%)");

    // Center axes still snap the element center
    const centerResult = computeStickySnap(0.505, 0.495, undefined, { elementSize });
    expect(centerResult.x).toBe(0.5);
    expect(centerResult.y).toBe(0.5);
  });
});

describe("thumbnailSnap - snapAxisWithHysteresis & snapAxisToAnchors", () => {
  it("captures unanchored coordinate when within capture threshold", () => {
    const res = snapAxisToAnchors(0.505, GRID_ANCHORS_X);
    expect(res.value).toBe(0.5);
    expect(res.locked?.kind).toBe("center");
  });

  it("maintains lock against pointer movement below breakout threshold", () => {
    const centerAnchor = GRID_ANCHORS_X.find((a) => a.kind === "center")!;
    const res = snapAxisWithHysteresis(0.512, centerAnchor, GRID_ANCHORS_X);
    expect(res.value).toBe(0.5);
    expect(res.locked).toBe(centerAnchor);
  });
});

describe("thumbnailSnap - detectActiveAnchorPreset", () => {
  it("detects all 9 anchor presets at their exact coordinates", () => {
    for (const [presetId, coords] of Object.entries(ANCHOR_PRESETS)) {
      const detected = detectActiveAnchorPreset({ x: coords.x, y: coords.y });
      expect(detected).toBe(presetId);
    }
  });

  it("detects presets with minor positional deviation within tolerance", () => {
    // Top-right is at (0.95, 0.05)
    const detected = detectActiveAnchorPreset({ x: 0.955, y: 0.055 }, 0.02);
    expect(detected).toBe("top-right");
  });

  it("returns null when coordinates are not aligned to any preset", () => {
    const detected = detectActiveAnchorPreset({ x: 0.35, y: 0.65 }, 0.02);
    expect(detected).toBeNull();
  });

  it("detects presets taking into account element edge offset", () => {
    const elementSize = { halfW: 0.13, halfH: 0.13 };
    // Bottom-center with halfH=0.13 is at (0.5, 0.82)
    const detected = detectActiveAnchorPreset({ x: 0.5, y: 0.82 }, elementSize);
    expect(detected).toBe("bottom-center");

    // Top-left with halfW=0.13, halfH=0.13 is at (0.18, 0.18)
    const detectedTL = detectActiveAnchorPreset({ x: 0.18, y: 0.18 }, elementSize);
    expect(detectedTL).toBe("top-left");
  });
});

describe("thumbnailSnap - getPresetCoordinates", () => {
  it("calculates edge-aligned center coordinates for all directions", () => {
    const elementSize = { halfW: 0.15, halfH: 0.10 };

    const bc = getPresetCoordinates("bottom-center", elementSize);
    expect(bc.x).toBe(0.5);
    expect(bc.y).toBeCloseTo(0.95 - 0.10, 4);

    const tc = getPresetCoordinates("top-center", elementSize);
    expect(tc.x).toBe(0.5);
    expect(tc.y).toBeCloseTo(0.05 + 0.10, 4);

    const cl = getPresetCoordinates("center-left", elementSize);
    expect(cl.x).toBeCloseTo(0.05 + 0.15, 4);
    expect(cl.y).toBe(0.5);

    const cr = getPresetCoordinates("center-right", elementSize);
    expect(cr.x).toBeCloseTo(0.95 - 0.15, 4);
    expect(cr.y).toBe(0.5);

    const center = getPresetCoordinates("center", elementSize);
    expect(center.x).toBe(0.5);
    expect(center.y).toBe(0.5);
  });
});

describe("thumbnailSnap - renderAlignmentGuides", () => {
  function createMockContext(): CanvasRenderingContext2D {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "left",
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;
  }

  it("does not render when canvas dimensions are zero or negative", () => {
    const ctx = createMockContext();
    renderAlignmentGuides(ctx, 0, 0, {
      showBaseGrid: true,
      lockState: { lockedX: null, lockedY: null },
    });

    expect(ctx.save).not.toHaveBeenCalled();
  });

  it("renders full-bleed (0 to width and 0 to height) hairline grid lines when showBaseGrid is true", () => {
    const ctx = createMockContext();
    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: true,
      lockState: { lockedX: null, lockedY: null },
    });

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);

    // Vertical grid lines must extend full-bleed from y=0 to y=720
    for (const anchor of GRID_ANCHORS_X) {
      const x = Math.round(anchor.value * 1280);
      expect(ctx.moveTo).toHaveBeenCalledWith(x, 0);
      expect(ctx.lineTo).toHaveBeenCalledWith(x, 720);
    }

    // Horizontal grid lines must extend full-bleed from x=0 to x=1280
    for (const anchor of GRID_ANCHORS_Y) {
      const y = Math.round(anchor.value * 720);
      expect(ctx.moveTo).toHaveBeenCalledWith(0, y);
      expect(ctx.lineTo).toHaveBeenCalledWith(1280, y);
    }

    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("renders auto-fade base grid when showBaseGrid is false and autoFade is true", () => {
    const ctx = createMockContext();
    const strokeStyles: string[] = [];
    Object.defineProperty(ctx, "strokeStyle", {
      get: () => strokeStyles[strokeStyles.length - 1] ?? "",
      set: (val: string) => {
        strokeStyles.push(val);
      },
    });

    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      autoFade: true,
      lockState: { lockedX: null, lockedY: null },
    });

    expect(ctx.moveTo).toHaveBeenCalledWith(640, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(640, 720);
    expect(strokeStyles).toContain("rgba(255, 255, 255, 0.18)");
  });

  it("renders locked axis guides for center and safe-zone anchors", () => {
    const ctx = createMockContext();
    const centerX = GRID_ANCHORS_X.find((a) => a.kind === "center")!;
    const safeY = GRID_ANCHORS_Y.find((a) => a.kind === "safe")!;

    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      lockState: {
        lockedX: centerX,
        lockedY: safeY,
      },
    });

    expect(ctx.moveTo).toHaveBeenCalledWith(640, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(640, 720);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, Math.round(0.28 * 720));
    expect(ctx.lineTo).toHaveBeenCalledWith(1280, Math.round(0.28 * 720));
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("renders full-canvas center X/Y crosshairs and 4 bounding edge projection lines for selectedRect or activeRect", () => {
    const ctx = createMockContext();
    const rect = { x: 200, y: 120, w: 300, h: 160 };

    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      lockState: { lockedX: null, lockedY: null },
      selectedRect: rect,
    });

    const cx = Math.round(rect.x + rect.w / 2); // 350
    const cy = Math.round(rect.y + rect.h / 2); // 200

    // Full-canvas center X/Y crosshairs
    expect(ctx.moveTo).toHaveBeenCalledWith(cx, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(cx, 720);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, cy);
    expect(ctx.lineTo).toHaveBeenCalledWith(1280, cy);

    // Full-canvas 4 edge projection hairlines (left, right, top, bottom)
    expect(ctx.moveTo).toHaveBeenCalledWith(200, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 720);
    expect(ctx.moveTo).toHaveBeenCalledWith(500, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(500, 720);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 120);
    expect(ctx.lineTo).toHaveBeenCalledWith(1280, 120);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 280);
    expect(ctx.lineTo).toHaveBeenCalledWith(1280, 280);

    // Selection bounding box
    expect(ctx.strokeRect).toHaveBeenCalledWith(200, 120, 300, 160);
  });

  it("renders compact margin percentage readouts only when showMarginReadouts is true", () => {
    const ctx = createMockContext();
    const rect = { x: 256, y: 144, w: 256, h: 144 };

    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      lockState: { lockedX: null, lockedY: null },
      selectedRect: rect,
      showMarginReadouts: false,
    });
    expect(ctx.fillText).not.toHaveBeenCalled();

    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      lockState: { lockedX: null, lockedY: null },
      activeRect: rect,
      showMarginReadouts: true,
    });
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it("renders YouTube bottom-right timestamp safe-zone indicator when showSafeZone is true", () => {
    const ctx = createMockContext();
    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      lockState: { lockedX: null, lockedY: null },
      showSafeZone: true,
    });

    const szX = Math.round(0.86 * 1280);
    const szY = Math.round(0.86 * 720);
    const szW = Math.round(0.12 * 1280);
    const szH = Math.round(0.10 * 720);

    expect(ctx.fillRect).toHaveBeenCalledWith(szX, szY, szW, szH);
    expect(ctx.strokeRect).toHaveBeenCalledWith(szX, szY, szW, szH);
  });
});
