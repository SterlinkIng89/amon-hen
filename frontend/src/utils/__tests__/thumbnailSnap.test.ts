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
  SiblingElementSnapTarget,
  SmartGuideLine,
  buildSiblingAnchors,
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

  it("renders connecting smart guide lines and boundary ticks when smartGuides are present", () => {
    const ctx = createMockContext();
    const smartGuides: SmartGuideLine[] = [
      {
        axis: "x",
        coordinate: 640,
        sourceRect: { x: 540, y: 100, w: 200, h: 100 },
        targetRect: { x: 590, y: 300, w: 100, h: 80 },
        alignment: "center",
        targetEdge: "center",
        targetLabel: "Game Title",
      },
      {
        axis: "y",
        coordinate: 250,
        sourceRect: { x: 200, y: 200, w: 150, h: 100 },
        targetRect: { x: 500, y: 200, w: 200, h: 100 },
        alignment: "leading",
        targetEdge: "leading",
        targetLabel: "Episode Badge",
      },
    ];

    renderAlignmentGuides(ctx, 1280, 720, {
      showBaseGrid: false,
      lockState: {
        lockedX: {
          value: 0.5,
          label: "Aligned with Game Title Center X",
          kind: "element",
        },
        lockedY: null,
      },
      smartGuides,
    });

    // Smart guide connecting line along x=640 from minY (100 - 12 = 88) to maxY (380 + 12 = 392)
    expect(ctx.moveTo).toHaveBeenCalledWith(640, 88);
    expect(ctx.lineTo).toHaveBeenCalledWith(640, 392);

    // Smart guide horizontal line along y=250 from minX (200 - 12 = 188) to maxX (700 + 12 = 712)
    expect(ctx.moveTo).toHaveBeenCalledWith(188, 250);
    expect(ctx.lineTo).toHaveBeenCalledWith(712, 250);

    // Must not draw full-bleed canvas line for element-kind locks
    expect(ctx.moveTo).not.toHaveBeenCalledWith(640, 0);
  });
});

describe("thumbnailSnap - Multi-Edge Inner Guide Snapping", () => {
  const elementSize = { halfW: 0.12, halfH: 0.08 };

  it("snaps element trailing edge (bottom edge) to 72% lower guide", () => {
    // When element center is at 0.642 (rawY + halfH = 0.642 + 0.08 = 0.722, within capture)
    const result = computeStickySnap(0.5, 0.642, undefined, { elementSize });

    expect(result.y).toBeCloseTo(0.72 - 0.08, 4);
    expect(result.lockState.lockedY?.alignment).toBe("trailing");
    expect(result.lockState.lockedY?.label).toBe("Bottom Edge -> Lower Guide (72%)");
    expect(result.activeLabel).toContain("Bottom Edge -> Lower Guide (72%)");
  });

  it("snaps element leading edge (top edge) to 28% upper guide", () => {
    // When element center is at 0.358 (rawY - halfH = 0.358 - 0.08 = 0.278, within capture)
    const result = computeStickySnap(0.5, 0.358, undefined, { elementSize });

    expect(result.y).toBeCloseTo(0.28 + 0.08, 4);
    expect(result.lockState.lockedY?.alignment).toBe("leading");
    expect(result.lockState.lockedY?.label).toBe("Top Edge -> Upper Guide (28%)");
    expect(result.activeLabel).toContain("Top Edge -> Upper Guide (28%)");
  });

  it("snaps element left edge and right edge to 50% Center X guide", () => {
    // Left edge (rawX - halfW = 0.619 - 0.12 = 0.499, within capture of 0.50)
    const leftSnap = computeStickySnap(0.619, 0.5, undefined, { elementSize });
    expect(leftSnap.x).toBeCloseTo(0.50 + 0.12, 4);
    expect(leftSnap.lockState.lockedX?.alignment).toBe("leading");
    expect(leftSnap.lockState.lockedX?.label).toBe("Left Edge -> Center X (50%)");

    // Right edge (rawX + halfW = 0.381 + 0.12 = 0.501, within capture of 0.50)
    const rightSnap = computeStickySnap(0.381, 0.5, undefined, { elementSize });
    expect(rightSnap.x).toBeCloseTo(0.50 - 0.12, 4);
    expect(rightSnap.lockState.lockedX?.alignment).toBe("trailing");
    expect(rightSnap.lockState.lockedX?.label).toBe("Right Edge -> Center X (50%)");
  });

  it("holds edge alignment lock with breakout hysteresis", () => {
    const initial = computeStickySnap(0.5, 0.642, undefined, { elementSize });
    expect(initial.lockState.lockedY).not.toBeNull();

    // Small movement within breakout threshold
    const held = computeStickySnap(0.5, 0.642 + 0.005, initial.lockState, { elementSize });
    expect(held.y).toBeCloseTo(0.72 - 0.08, 4);
    expect(held.lockState.lockedY).toBe(initial.lockState.lockedY);

    // Breakout force
    const broke = computeStickySnap(0.5, 0.642 + SNAP_BREAKOUT_THRESHOLD + 0.002, initial.lockState, { elementSize });
    expect(broke.lockState.lockedY).toBeNull();
  });
});

describe("thumbnailSnap - Inter-Element Smart Guides", () => {
  const elementSize = { halfW: 0.10, halfH: 0.06 }; // 256x86 px on 1280x720
  const otherElements: SiblingElementSnapTarget[] = [
    {
      id: "logo",
      label: "Steam Game Logo",
      // Centered at x: 600, y: 140, w: 200, h: 80
      rect: { x: 500, y: 100, w: 200, h: 80 },
    },
    {
      id: "episode",
      label: "Episode Badge",
      // Centered at x: 950, y: 580, w: 100, h: 60
      rect: { x: 900, y: 550, w: 100, h: 60 },
    },
  ];

  it("snaps center to sibling element center X and Y", () => {
    const logoCenterY = 140 / 720;
    const result = computeStickySnap(0.20, logoCenterY - 0.001, undefined, {
      elementSize,
      otherElements,
      canvasDimensions: { width: 1280, height: 720 },
    });

    expect(result.y).toBeCloseTo(logoCenterY, 4);
    expect(result.lockState.lockedY?.kind).toBe("element");
    expect(result.lockState.lockedY?.label).toBe("Aligned with Steam Game Logo Center Y");
    expect(result.smartGuides).toHaveLength(1);
    expect(result.smartGuides[0].axis).toBe("y");
    expect(result.smartGuides[0].targetLabel).toBe("Steam Game Logo");
  });

  it("snaps top edge to sibling element bottom edge (vertical stacking)", () => {
    // Sibling logo bottom is (100 + 80)/720 = 180/720 = 0.25
    const logoBottom = 180 / 720;
    // Active element top edge is rawY - halfH, so rawY = logoBottom + halfH = 0.25 + 0.06 = 0.31
    const result = computeStickySnap(0.20, logoBottom + 0.06 + 0.002, undefined, {
      elementSize,
      otherElements,
      canvasDimensions: { width: 1280, height: 720 },
    });

    expect(result.y).toBeCloseTo(logoBottom + 0.06, 4);
    expect(result.lockState.lockedY?.kind).toBe("element");
    expect(result.lockState.lockedY?.label).toBe("Top Edge -> Steam Game Logo Bottom Edge");
    expect(result.smartGuides).toHaveLength(1);
    expect(result.smartGuides[0].alignment).toBe("leading");
    expect(result.smartGuides[0].targetEdge).toBe("trailing");
  });

  it("snaps matching left edges between active element and sibling", () => {
    // Sibling episode left is 900/1280 = 0.703125
    const epLeft = 900 / 1280;
    // Active left is rawX - halfW, so rawX = epLeft + halfW = 0.703125 + 0.10 = 0.803125
    // Use rawY = 0.38 which does not collide with any Y guide
    const result = computeStickySnap(epLeft + 0.10 - 0.002, 0.38, undefined, {
      elementSize,
      otherElements,
      canvasDimensions: { width: 1280, height: 720 },
    });

    expect(result.x).toBeCloseTo(epLeft + 0.10, 4);
    expect(result.lockState.lockedX?.kind).toBe("element");
    expect(result.lockState.lockedX?.label).toBe("Left Edge -> Episode Badge Left Edge");
    expect(result.smartGuides).toHaveLength(1);
    expect(result.smartGuides[0].axis).toBe("x");
  });

  it("maintains inter-element lock with hysteresis until breakout", () => {
    const logoCenterY = 140 / 720;
    const initial = computeStickySnap(0.20, logoCenterY + 0.002, undefined, {
      elementSize,
      otherElements,
      canvasDimensions: { width: 1280, height: 720 },
    });

    expect(initial.lockState.lockedY?.kind).toBe("element");

    // Move pointer slightly within breakout
    const held = computeStickySnap(0.20, logoCenterY + 0.010, initial.lockState, {
      elementSize,
      otherElements,
      canvasDimensions: { width: 1280, height: 720 },
    });
    expect(held.y).toBeCloseTo(logoCenterY, 4);
    expect(held.lockState.lockedY).toBe(initial.lockState.lockedY);

    // Move pointer beyond breakout
    const broke = computeStickySnap(0.20, logoCenterY + SNAP_BREAKOUT_THRESHOLD + 0.005, initial.lockState, {
      elementSize,
      otherElements,
      canvasDimensions: { width: 1280, height: 720 },
    });
    expect(broke.lockState.lockedY).toBeNull();
  });
});

