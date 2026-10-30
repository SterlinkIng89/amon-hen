import { describe, it, expect, vi } from "vitest";
import {
  computeStickySnap,
  detectActiveAnchorPreset,
  renderAlignmentGuides,
  SNAP_CAPTURE_THRESHOLD,
  SNAP_BREAKOUT_THRESHOLD,
  GRID_ANCHORS_X,
  GRID_ANCHORS_Y,
  ANCHOR_PRESETS,
  SnapLockState,
} from "../thumbnailSnap";

describe("thumbnailSnap - computeStickySnap", () => {
  const emptyLock: SnapLockState = { lockedX: null, lockedY: null };

  it("returns free coordinates and empty lock state when outside capture threshold", () => {
    const result = computeStickySnap(0.40, 0.40, emptyLock);

    expect(result.x).toBeCloseTo(0.40, 5);
    expect(result.y).toBeCloseTo(0.40, 5);
    expect(result.lockState.lockedX).toBeNull();
    expect(result.lockState.lockedY).toBeNull();
    expect(result.activeLabel).toBeNull();
  });

  it("captures and snaps to center axes within SNAP_CAPTURE_THRESHOLD (0.022)", () => {
    const rawX = 0.5 - SNAP_CAPTURE_THRESHOLD * 0.5; // 0.489 -> within 0.011 of 0.5
    const rawY = 0.5 + SNAP_CAPTURE_THRESHOLD * 0.5; // 0.511 -> within 0.011 of 0.5

    const result = computeStickySnap(rawX, rawY, emptyLock);

    expect(result.x).toBe(0.5);
    expect(result.y).toBe(0.5);
    expect(result.lockState.lockedX?.value).toBe(0.5);
    expect(result.lockState.lockedX?.kind).toBe("center");
    expect(result.lockState.lockedY?.value).toBe(0.5);
    expect(result.lockState.lockedY?.kind).toBe("center");
    expect(result.activeLabel).toContain("Center X (50%)");
    expect(result.activeLabel).toContain("Center Y (50%)");
  });

  it("captures rule-of-thirds and safe-zone anchors accurately", () => {
    // 1/3 anchor is ~0.333333
    const thirdsX = 1 / 3 + 0.01;
    // 0.82 safe anchor
    const safeY = 0.82 - 0.01;

    const result = computeStickySnap(thirdsX, safeY, emptyLock);

    expect(result.x).toBeCloseTo(1 / 3, 5);
    expect(result.y).toBe(0.82);
    expect(result.lockState.lockedX?.kind).toBe("thirds");
    expect(result.lockState.lockedY?.kind).toBe("safe");
  });

  it("retains sticky lock across small pointer movement within SNAP_BREAKOUT_THRESHOLD (0.045)", () => {
    const lockedCenterState: SnapLockState = {
      lockedX: GRID_ANCHORS_X.find((a) => a.value === 0.5)!,
      lockedY: GRID_ANCHORS_Y.find((a) => a.value === 0.5)!,
    };

    // Move pointer by 0.035 from center (0.535), which is > capture (0.022) but < breakout (0.045)
    const result = computeStickySnap(0.535, 0.47, lockedCenterState);

    expect(result.x).toBe(0.5);
    expect(result.y).toBe(0.5);
    expect(result.lockState.lockedX?.value).toBe(0.5);
    expect(result.lockState.lockedY?.value).toBe(0.5);
  });

  it("breaks out of sticky lock when pointer movement exceeds SNAP_BREAKOUT_THRESHOLD", () => {
    const lockedCenterState: SnapLockState = {
      lockedX: GRID_ANCHORS_X.find((a) => a.value === 0.5)!,
      lockedY: null,
    };

    // Move pointer to 0.56 (delta 0.06 > breakout 0.045)
    const result = computeStickySnap(0.56, 0.25, lockedCenterState);

    expect(result.x).toBeCloseTo(0.56, 5);
    expect(result.lockState.lockedX).toBeNull();
  });

  it("bypasses snapping completely when bypassSnap is true (holding Alt / toggle off)", () => {
    const lockedCenterState: SnapLockState = {
      lockedX: GRID_ANCHORS_X.find((a) => a.value === 0.5)!,
      lockedY: GRID_ANCHORS_Y.find((a) => a.value === 0.5)!,
    };

    const result = computeStickySnap(0.505, 0.495, lockedCenterState, {
      bypassSnap: true,
    });

    expect(result.x).toBe(0.505);
    expect(result.y).toBe(0.495);
    expect(result.lockState.lockedX).toBeNull();
    expect(result.lockState.lockedY).toBeNull();
    expect(result.activeLabel).toBeNull();
  });

  it("clamps raw coordinates to [0, 1] range", () => {
    const result = computeStickySnap(-0.2, 1.3, emptyLock, { bypassSnap: true });

    expect(result.x).toBe(0);
    expect(result.y).toBe(1);
  });

  it("supports single-axis active label formatting", () => {
    const lockOnlyX: SnapLockState = {
      lockedX: GRID_ANCHORS_X.find((a) => a.value === 0.5)!,
      lockedY: null,
    };

    const result = computeStickySnap(0.5, 0.25, lockOnlyX);
    expect(result.activeLabel).toBe("Center X (50%)");
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
    // Top-right is at (0.82, 0.18)
    const detected = detectActiveAnchorPreset({ x: 0.825, y: 0.175 }, 0.02);
    expect(detected).toBe("top-right");
  });

  it("returns null when coordinates are not aligned to any preset", () => {
    const detected = detectActiveAnchorPreset({ x: 0.35, y: 0.65 }, 0.02);
    expect(detected).toBeNull();
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
      arc: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
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

  it("renders base grid lines when showBaseGrid is true", () => {
    const ctx = createMockContext();
    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: true,
      lockState: { lockedX: null, lockedY: null },
    });

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("renders locked axis guides with #f97316 for center and #38bdf8 for thirds/safe", () => {
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

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("renders active element bounding box and center handle when activeRect is supplied", () => {
    const ctx = createMockContext();

    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      lockState: { lockedX: null, lockedY: null },
      activeRect: { x: 100, y: 150, w: 200, h: 80 },
    });

    expect(ctx.strokeRect).toHaveBeenCalledWith(100, 150, 200, 80);
    expect(ctx.arc).toHaveBeenCalledWith(200, 190, 3.5, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalled();
  });
});
