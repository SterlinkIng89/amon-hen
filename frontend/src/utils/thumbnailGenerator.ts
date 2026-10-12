import {
  EpisodeFormat,
  EpisodeNumberPosition,
  SteamGameArtwork,
} from "../types";

export interface ThumbnailGeneratorOptions {
  width?: number; // default 1280
  height?: number; // default 720
  showEpisode: boolean;
  episodeNumber: number;
  episodeFormat: EpisodeFormat;
  position: EpisodeNumberPosition;
  fontColor?: string;
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

/**
 * Renders the base image cropped/centered to 16:9 canvas, and overlays the episode number text with high-contrast stroke styling if configured.
 */
export function renderThumbnailToCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  options: ThumbnailGeneratorOptions
): void {
  const width = options.width || 1280;
  const height = options.height || 720;

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Clear canvas with dark slate background
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  // Draw scaled & cropped image
  if (image && image.complete && image.naturalWidth > 0) {
    const imgAspect = image.naturalWidth / image.naturalHeight;
    const canvasAspect = width / height;

    let srcW = image.naturalWidth;
    let srcH = image.naturalHeight;
    let srcX = 0;
    let srcY = 0;

    if (imgAspect > canvasAspect) {
      srcW = image.naturalHeight * canvasAspect;
      srcX = (image.naturalWidth - srcW) / 2;
    } else {
      srcH = image.naturalWidth / canvasAspect;
      srcY = (image.naturalHeight - srcH) / 2;
    }

    ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, width, height);
  }

  // Draw episode badge if enabled and episode > 0
  if (options.showEpisode && options.episodeNumber > 0) {
    const text = formatEpisodeBadgeText(
      options.episodeNumber,
      options.episodeFormat
    );

    // Font styling: Impact / ultra-bold display font for gaming thumbnails (YouTube standard)
    const fontSize = 140;
    ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
    ctx.textBaseline = "top";

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize * 0.95;
    const margin = 44;

    const { x, y } = calculateBadgePosition(
      options.position,
      width,
      height,
      textWidth,
      textHeight,
      margin
    );

    const fillColor = options.fontColor || "#ffffff";
    const isDarkFill =
      fillColor.toLowerCase() === "#000000" ||
      fillColor.toLowerCase() === "#111111" ||
      fillColor.toLowerCase() === "black";
    const strokeColor = isDarkFill ? "#ffffff" : "#000000";

    ctx.save();
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    // Drop shadow behind stroke
    ctx.shadowColor = isDarkFill ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    // Thick stroke (12px)
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 12;
    ctx.strokeText(text, x, y);

    // Fill with selected font color
    ctx.shadowColor = "transparent";
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
