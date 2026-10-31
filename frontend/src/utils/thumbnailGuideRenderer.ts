import { ElementRect } from "./thumbnailGenerator";
import {
  GRID_ANCHORS_X,
  GRID_ANCHORS_Y,
  SnapLockState,
  SmartGuideLine,
} from "./thumbnailSnap";

export interface RenderAlignmentGuidesOptions {
  readonly showBaseGrid: boolean;
  readonly lockState: SnapLockState;
  readonly activeRect?: ElementRect;
  readonly selectedRect?: ElementRect;
  readonly showCrosshairs?: boolean;
  readonly autoFade?: boolean;
  readonly gridOpacity?: number;
  readonly showSafeZone?: boolean;
  readonly showMarginReadouts?: boolean;
  readonly smartGuides?: readonly SmartGuideLine[];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(val) ? val : min));
}

function strokeWithBackdrop(
  ctx: CanvasRenderingContext2D,
  dash: number[],
  backdropColor: string,
  backdropWidth: number,
  fgColor: string,
  fgWidth: number,
  draw: () => void
): void {
  ctx.setLineDash(dash);
  ctx.strokeStyle = backdropColor;
  ctx.lineWidth = backdropWidth;
  draw();

  ctx.strokeStyle = fgColor;
  ctx.lineWidth = fgWidth;
  draw();
}

function renderFullBleedBaseGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  whiteAlpha: number,
  darkAlpha: number
): void {
  ctx.save();
  strokeWithBackdrop(
    ctx,
    [],
    `rgba(0, 0, 0, ${darkAlpha})`,
    1.5,
    `rgba(255, 255, 255, ${whiteAlpha})`,
    1,
    () => {
      ctx.beginPath();
      for (const anchor of GRID_ANCHORS_X) {
        const x = Math.round(anchor.value * width);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (const anchor of GRID_ANCHORS_Y) {
        const y = Math.round(anchor.value * height);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }
  );
  ctx.restore();
}

function renderYouTubeSafeZone(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const szX = Math.round(0.86 * width);
  const szY = Math.round(0.86 * height);
  const szW = Math.round(0.12 * width);
  const szH = Math.round(0.10 * height);

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  if (typeof ctx.fillRect === "function") {
    ctx.fillRect(szX, szY, szW, szH);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(szX, szY, szW, szH);
  ctx.restore();
}

function renderElementCrosshairsAndSelection(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rect: ElementRect,
  isLocked: boolean,
  showCrosshairs: boolean,
  showMarginReadouts: boolean
): void {
  const { x, y, w, h } = rect;
  const left = Math.round(x);
  const right = Math.round(x + w);
  const top = Math.round(y);
  const bottom = Math.round(y + h);
  const cx = Math.round(x + w / 2);
  const cy = Math.round(y + h / 2);
  const accentColor = isLocked ? "#38bdf8" : "#ffffff";

  ctx.save();

  if (showCrosshairs) {
    strokeWithBackdrop(
      ctx,
      [4, 4],
      "rgba(0, 0, 0, 0.22)",
      1.25,
      "rgba(255, 255, 255, 0.26)",
      1,
      () => {
        ctx.beginPath();
        ctx.moveTo(left, 0);
        ctx.lineTo(left, height);
        ctx.moveTo(right, 0);
        ctx.lineTo(right, height);
        ctx.moveTo(0, top);
        ctx.lineTo(width, top);
        ctx.moveTo(0, bottom);
        ctx.lineTo(width, bottom);
        ctx.stroke();
      }
    );

    strokeWithBackdrop(
      ctx,
      [5, 4],
      "rgba(0, 0, 0, 0.36)",
      1.75,
      isLocked ? "#38bdf8" : "rgba(255, 255, 255, 0.62)",
      1.25,
      () => {
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();
      }
    );
  }

  strokeWithBackdrop(
    ctx,
    [],
    "rgba(0, 0, 0, 0.48)",
    2.5,
    isLocked ? "#38bdf8" : "rgba(255, 255, 255, 0.92)",
    1.5,
    () => ctx.strokeRect(x, y, w, h)
  );

  const cornerLen = Math.max(10, Math.min(18, Math.min(w, h) / 3));
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y + cornerLen);
  ctx.lineTo(x, y);
  ctx.lineTo(x + cornerLen, y);
  ctx.moveTo(x + w - cornerLen, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + cornerLen);
  ctx.moveTo(x, y + h - cornerLen);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + cornerLen, y + h);
  ctx.moveTo(x + w - cornerLen, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - cornerLen);
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.25, 0, Math.PI * 2);
  ctx.fill();

  if (showMarginReadouts && typeof ctx.fillText === "function") {
    const xPct = Math.round((cx / width) * 100);
    const yPct = Math.round((cy / height) * 100);
    const badgeW = 54;
    const badgeH = 20;
    const xBadgeX = clamp(cx - badgeW / 2, 6, width - badgeW - 6);
    const xBadgeY =
      top > 32 ? Math.max(6, top - badgeH - 6) : Math.min(height - badgeH - 6, bottom + 6);
    const yBadgeX =
      left > 64 ? Math.max(6, left - badgeW - 6) : Math.min(width - badgeW - 6, right + 6);
    const yBadgeY = clamp(cy - badgeH / 2, 6, height - badgeH - 6);

    ctx.fillStyle = "rgba(9, 13, 22, 0.82)";
    if (typeof ctx.fillRect === "function") {
      ctx.fillRect(xBadgeX, xBadgeY, badgeW, badgeH);
      ctx.fillRect(yBadgeX, yBadgeY, badgeW, badgeH);
    }

    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`X ${xPct}%`, xBadgeX + 8, xBadgeY + 14);
    ctx.fillText(`Y ${yPct}%`, yBadgeX + 8, yBadgeY + 14);
  }

  ctx.restore();
}

function renderSmartGuideLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  smartGuides: readonly SmartGuideLine[]
): void {
  if (!smartGuides || smartGuides.length === 0) return;

  const tickHalfLen = 5;
  const extension = 12;

  for (const guide of smartGuides) {
    ctx.save();
    if (guide.axis === "x") {
      const x = guide.coordinate;
      const minY = Math.max(
        0,
        Math.min(guide.sourceRect.y, guide.targetRect.y) - extension
      );
      const maxY = Math.min(
        height,
        Math.max(
          guide.sourceRect.y + guide.sourceRect.h,
          guide.targetRect.y + guide.targetRect.h
        ) + extension
      );

      strokeWithBackdrop(
        ctx,
        [],
        "rgba(0, 0, 0, 0.45)",
        2.5,
        "#38bdf8",
        1.5,
        () => {
          ctx.beginPath();
          ctx.moveTo(x, minY);
          ctx.lineTo(x, maxY);

          ctx.moveTo(x - tickHalfLen, guide.sourceRect.y);
          ctx.lineTo(x + tickHalfLen, guide.sourceRect.y);
          ctx.moveTo(x - tickHalfLen, guide.sourceRect.y + guide.sourceRect.h);
          ctx.lineTo(x + tickHalfLen, guide.sourceRect.y + guide.sourceRect.h);

          ctx.moveTo(x - tickHalfLen, guide.targetRect.y);
          ctx.lineTo(x + tickHalfLen, guide.targetRect.y);
          ctx.moveTo(x - tickHalfLen, guide.targetRect.y + guide.targetRect.h);
          ctx.lineTo(x + tickHalfLen, guide.targetRect.y + guide.targetRect.h);

          ctx.stroke();
        }
      );
    } else {
      const y = guide.coordinate;
      const minX = Math.max(
        0,
        Math.min(guide.sourceRect.x, guide.targetRect.x) - extension
      );
      const maxX = Math.min(
        width,
        Math.max(
          guide.sourceRect.x + guide.sourceRect.w,
          guide.targetRect.x + guide.targetRect.w
        ) + extension
      );

      strokeWithBackdrop(
        ctx,
        [],
        "rgba(0, 0, 0, 0.45)",
        2.5,
        "#38bdf8",
        1.5,
        () => {
          ctx.beginPath();
          ctx.moveTo(minX, y);
          ctx.lineTo(maxX, y);

          ctx.moveTo(guide.sourceRect.x, y - tickHalfLen);
          ctx.lineTo(guide.sourceRect.x, y + tickHalfLen);
          ctx.moveTo(guide.sourceRect.x + guide.sourceRect.w, y - tickHalfLen);
          ctx.lineTo(guide.sourceRect.x + guide.sourceRect.w, y + tickHalfLen);

          ctx.moveTo(guide.targetRect.x, y - tickHalfLen);
          ctx.lineTo(guide.targetRect.x, y + tickHalfLen);
          ctx.moveTo(guide.targetRect.x + guide.targetRect.w, y - tickHalfLen);
          ctx.lineTo(guide.targetRect.x + guide.targetRect.w, y + tickHalfLen);

          ctx.stroke();
        }
      );
    }
    ctx.restore();
  }
}

export function renderAlignmentGuides(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: RenderAlignmentGuidesOptions
): void {
  if (width <= 0 || height <= 0) return;

  ctx.save();

  ctx.save();
  strokeWithBackdrop(
    ctx,
    [],
    "rgba(0, 0, 0, 0.22)",
    1.5,
    "rgba(255, 255, 255, 0.28)",
    1,
    () => ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
  );
  ctx.restore();

  if (options.showBaseGrid || options.autoFade) {
    const whiteAlpha =
      options.gridOpacity ?? (options.showBaseGrid ? 0.32 : 0.18);
    const darkAlpha =
      options.gridOpacity !== undefined
        ? Math.min(1, options.gridOpacity * 0.7)
        : options.showBaseGrid
          ? 0.22
          : 0.12;
    renderFullBleedBaseGrid(ctx, width, height, whiteAlpha, darkAlpha);
  }

  if (options.showSafeZone) {
    renderYouTubeSafeZone(ctx, width, height);
  }

  const { lockedX, lockedY } = options.lockState;

  if (lockedX && lockedX.kind !== "element") {
    const x = Math.round(lockedX.value * width);
    ctx.save();
    strokeWithBackdrop(ctx, [], "rgba(0, 0, 0, 0.45)", 2.5, "#38bdf8", 1.5, () => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });
    ctx.restore();
  }

  if (lockedY && lockedY.kind !== "element") {
    const y = Math.round(lockedY.value * height);
    ctx.save();
    strokeWithBackdrop(ctx, [], "rgba(0, 0, 0, 0.45)", 2.5, "#38bdf8", 1.5, () => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  if (options.smartGuides && options.smartGuides.length > 0) {
    renderSmartGuideLines(ctx, width, height, options.smartGuides);
  }

  const targetRect = options.activeRect ?? options.selectedRect;
  if (targetRect) {
    renderElementCrosshairsAndSelection(
      ctx,
      width,
      height,
      targetRect,
      Boolean(lockedX || lockedY),
      options.showCrosshairs ?? true,
      options.showMarginReadouts ?? false
    );
  }

  ctx.restore();
}
