import {
  EpisodeFormat,
  EpisodeNumberPosition,
  ElementLayout,
  ImageFraming,
  SteamGameArtwork,
} from "../types";

export const DEFAULT_FRAMING: ImageFraming = {
  offset_x: 0.5,
  offset_y: 0.5,
  zoom: 1,
};

export function clampFraming(f: ImageFraming): ImageFraming {
  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Number.isFinite(val) ? val : min));
  return {
    offset_x: clamp(f.offset_x, 0, 1),
    offset_y: clamp(f.offset_y, 0, 1),
    zoom: clamp(f.zoom, 1, 3),
  };
}

export function resolveCoverCrop(
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
  framing?: ImageFraming
): { sx: number; sy: number; sw: number; sh: number } {
  const f = framing ? clampFraming(framing) : DEFAULT_FRAMING;
  const canvasAspect = canvasW / canvasH;
  const imgAspect = imgW / imgH;

  let baseW: number;
  let baseH: number;

  if (imgAspect > canvasAspect) {
    baseH = imgH;
    baseW = imgH * canvasAspect;
  } else {
    baseW = imgW;
    baseH = imgW / canvasAspect;
  }

  // Zoom reduces the cropped window size
  const sw = baseW / f.zoom;
  const sh = baseH / f.zoom;

  // Max shift range in image coordinates
  const maxRangeX = Math.max(0, imgW - sw);
  const maxRangeY = Math.max(0, imgH - sh);

  const sx = maxRangeX * f.offset_x;
  const sy = maxRangeY * f.offset_y;

  return { sx, sy, sw, sh };
}

export function panFraming(
  f: ImageFraming,
  dxCanvas: number,
  dyCanvas: number,
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number
): ImageFraming {
  const current = clampFraming(f);
  const crop = resolveCoverCrop(imgW, imgH, canvasW, canvasH, current);

  const maxRangeX = Math.max(0, imgW - crop.sw);
  const maxRangeY = Math.max(0, imgH - crop.sh);

  // Conversion factor from canvas pixels to source image pixels
  const pxToImgX = crop.sw / canvasW;
  const pxToImgY = crop.sh / canvasH;

  // Moving cursor by +dx means image follows cursor -> crop window moves by -dx in source
  const deltaImgX = -dxCanvas * pxToImgX;
  const deltaImgY = -dyCanvas * pxToImgY;

  const deltaOffsetX = maxRangeX > 0 ? deltaImgX / maxRangeX : 0;
  const deltaOffsetY = maxRangeY > 0 ? deltaImgY / maxRangeY : 0;

  return clampFraming({
    offset_x: current.offset_x + deltaOffsetX,
    offset_y: current.offset_y + deltaOffsetY,
    zoom: current.zoom,
  });
}

export type ThumbnailElementId = "episode" | "logo" | "title";

export interface ElementRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type ThumbnailRects = Partial<Record<ThumbnailElementId, ElementRect>>;

export function clampLayout(layout: ElementLayout): ElementLayout {
  const clamp = (val: number, min: number, max: number, def: number) =>
    Math.max(min, Math.min(max, Number.isFinite(val) ? val : def));
  return {
    x: clamp(layout.x, 0, 1, 0.5),
    y: clamp(layout.y, 0, 1, 0.5),
    scale: clamp(layout.scale, 0.25, 3, 1),
  };
}

export function pointerToCanvasPoint(
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  canvasW: number,
  canvasH: number
): { x: number; y: number } {
  const scaleX = canvasW / (bounds.width || 1);
  const scaleY = canvasH / (bounds.height || 1);
  return {
    x: (clientX - bounds.left) * scaleX,
    y: (clientY - bounds.top) * scaleY,
  };
}

export function hitTestElements(
  rects: ThumbnailRects,
  px: number,
  py: number
): ThumbnailElementId | null {
  // Hit test priority: title > logo > episode (topmost first)
  const priority: ThumbnailElementId[] = ["title", "logo", "episode"];
  for (const id of priority) {
    const r = rects[id];
    if (r) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        return id;
      }
    }
  }
  return null;
}

export interface ThumbnailGeneratorOptions {
  width?: number; // default 1280
  height?: number; // default 720
  showEpisode: boolean;
  episodeNumber: number;
  episodeFormat: EpisodeFormat;
  position: EpisodeNumberPosition;
  fontColor?: string;
  framing?: ImageFraming;
  episodeLayout?: ElementLayout;
  logo?: {
    image: HTMLImageElement | null;
    layout: ElementLayout & { enabled: boolean };
  };
  title?: {
    text: string;
    layout: ElementLayout & { enabled: boolean; color?: string };
  };
}

export function resolveThumbnailImageUrl(
  sourceType: "steam" | "custom",
  customImagePath?: string,
  steamAssetType?: "hero" | "header" | "poster",
  steamAssets?: SteamGameArtwork | null
): string {
  if (sourceType === "custom" && customImagePath) {
    return customImagePath;
  }
  if (sourceType === "steam" && steamAssets) {
    const assetType = steamAssetType || "header";
    if (assetType === "hero") {
      return steamAssets.heroUrl || steamAssets.headerUrl || "";
    }
    if (assetType === "poster") {
      return steamAssets.posterUrl || steamAssets.headerUrl || "";
    }
    return steamAssets.headerUrl || steamAssets.heroUrl || "";
  }
  return "";
}

export function formatEpisodeBadgeText(
  episode: number,
  format: EpisodeFormat
): string {
  const numStr = episode > 0 && episode < 10 ? `0${episode}` : String(episode);
  switch (format) {
    case "hash":
      return `#${numStr}`;
    case "ep":
      return `EP ${numStr}`;
    case "pad2":
    case "number":
    default:
      return numStr;
  }
}

export function calculateBadgePosition(
  position: EpisodeNumberPosition,
  canvasWidth: number,
  canvasHeight: number,
  badgeWidth: number,
  badgeHeight: number,
  margin = 40
): { x: number; y: number } {
  switch (position) {
    case "top-left":
      return { x: margin, y: margin };
    case "top-right":
      return { x: canvasWidth - badgeWidth - margin, y: margin };
    case "bottom-left":
      return { x: margin, y: canvasHeight - badgeHeight - margin };
    case "bottom-right":
    default:
      return {
        x: canvasWidth - badgeWidth - margin,
        y: canvasHeight - badgeHeight - margin,
      };
  }
}

function drawStrokedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fillColor = "#ffffff"
): { width: number; height: number } {
  ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  ctx.textBaseline = "top";

  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = fontSize * 0.95;

  const isDarkFill =
    fillColor.toLowerCase() === "#000000" ||
    fillColor.toLowerCase() === "#111111" ||
    fillColor.toLowerCase() === "black";
  const strokeColor = isDarkFill ? "#ffffff" : "#000000";

  ctx.save();
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  ctx.shadowColor = isDarkFill ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = Math.max(8, fontSize * 0.08);
  ctx.shadowOffsetX = Math.max(3, fontSize * 0.03);
  ctx.shadowOffsetY = Math.max(3, fontSize * 0.03);

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(6, fontSize * 0.085);
  ctx.strokeText(text, x, y);

  ctx.shadowColor = "transparent";
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();

  return { width: textWidth, height: textHeight };
}

/**
 * Renders the base image cropped/centered to 16:9 canvas, and overlays logo, title, and episode badge.
 * Returns bounding rects for interactive hit-testing and dragging.
 */
export function renderThumbnailToCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  options: ThumbnailGeneratorOptions
): ThumbnailRects {
  const width = options.width || 1280;
  const height = options.height || 720;
  const rects: ThumbnailRects = {};

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return rects;

  // Clear canvas with dark slate background
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  // Draw scaled & cropped base image
  if (image && image.complete && image.naturalWidth > 0) {
    const crop = resolveCoverCrop(
      image.naturalWidth,
      image.naturalHeight,
      width,
      height,
      options.framing
    );

    ctx.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      width,
      height
    );
  }

  // Draw Steam Game Logo layer
  if (
    options.logo &&
    options.logo.layout.enabled &&
    options.logo.image &&
    options.logo.image.complete &&
    options.logo.image.naturalWidth > 0
  ) {
    const logoImg = options.logo.image;
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
    const layout = clampLayout(options.logo.layout);

    // Default width is ~30% of canvas width (384px) * scale
    const targetW = Math.max(40, width * 0.3 * layout.scale);
    const targetH = targetW / aspect;

    const x = layout.x * width - targetW / 2;
    const y = layout.y * height - targetH / 2;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(logoImg, x, y, targetW, targetH);
    ctx.restore();

    rects.logo = { x, y, w: targetW, h: targetH };
  }

  // Draw Game Title text layer
  if (
    options.title &&
    options.title.layout.enabled &&
    options.title.text.trim().length > 0
  ) {
    const text = options.title.text.trim();
    const layout = clampLayout(options.title.layout);
    const fontSize = Math.max(20, 80 * layout.scale);

    ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
    const measured = ctx.measureText(text);
    const textW = measured.width;
    const textH = fontSize * 0.95;

    const x = layout.x * width - textW / 2;
    const y = layout.y * height - textH / 2;

    drawStrokedText(ctx, text, x, y, fontSize, options.title.layout.color || "#ffffff");
    rects.title = { x, y, w: textW, h: textH };
  }

  // Draw episode badge if enabled and episode > 0
  if (options.showEpisode && options.episodeNumber > 0) {
    const text = formatEpisodeBadgeText(
      options.episodeNumber,
      options.episodeFormat
    );

    const baseFontSize = 140;
    const scale = options.episodeLayout?.scale || 1;
    const fontSize = Math.max(30, baseFontSize * scale);

    ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize * 0.95;

    let posX = 0;
    let posY = 0;

    if (options.episodeLayout) {
      const layout = clampLayout(options.episodeLayout);
      posX = layout.x * width - textWidth / 2;
      posY = layout.y * height - textHeight / 2;
    } else {
      const margin = 44;
      const corner = calculateBadgePosition(
        options.position,
        width,
        height,
        textWidth,
        textHeight,
        margin
      );
      posX = corner.x;
      posY = corner.y;
    }

    drawStrokedText(
      ctx,
      text,
      posX,
      posY,
      fontSize,
      options.fontColor || "#ffffff"
    );

    rects.episode = {
      x: posX,
      y: posY,
      w: textWidth,
      h: textHeight,
    };
  }

  return rects;
}

export interface PlaylistCoverOptions {
  readonly width?: number;
  readonly height?: number;
  readonly framing?: ImageFraming;
  readonly logo?: {
    readonly image: HTMLImageElement | null;
    readonly layout: ElementLayout & { readonly enabled: boolean };
  };
  readonly title?: {
    readonly text: string;
    readonly layout: ElementLayout & { readonly enabled: boolean; readonly color?: string };
  };
}

export function renderPlaylistCoverToCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  options: PlaylistCoverOptions
): ThumbnailRects {
  const size = options.width || options.height || 1080;
  return renderThumbnailToCanvas(canvas, image, {
    width: size,
    height: size,
    showEpisode: false,
    episodeNumber: 0,
    episodeFormat: "pad2",
    position: "bottom-right",
    framing: options.framing,
    logo: options.logo,
    title: options.title,
  });
}

