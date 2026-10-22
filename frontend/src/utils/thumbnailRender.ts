import { TagThumbnailConfig } from "../types";
import {
  renderThumbnailToCanvas,
  renderPlaylistCoverToCanvas,
} from "./thumbnailGenerator";

export interface RenderTagThumbnailParams {
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage: HTMLImageElement | null;
  readonly gameTitle: string;
  readonly episodeNumber: number;
  readonly config: Partial<TagThumbnailConfig>;
}

export interface RenderPlaylistCoverParams {
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage: HTMLImageElement | null;
  readonly gameTitle: string;
  readonly config: TagThumbnailConfig;
}

/**
 * Renders a complete 1280x720 JPEG thumbnail data URL using the offscreen canvas.
 * If episodeNumber <= 0, showEpisode is disabled.
 */
export function renderTagThumbnailDataUrl({
  baseImage,
  logoImage,
  gameTitle,
  episodeNumber,
  config,
}: RenderTagThumbnailParams): string {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 1280;
  exportCanvas.height = 720;

  renderThumbnailToCanvas(exportCanvas, baseImage, {
    showEpisode: episodeNumber > 0,
    episodeNumber: episodeNumber > 0 ? episodeNumber : 1,
    episodeFormat: config.episode_format || "pad2",
    position: config.episode_position || "bottom-left",
    fontColor: config.font_color || "#ffffff",
    framing: config.image_framing,
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

  return exportCanvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Renders a clean 1080x1080 (1:1 square) JPEG playlist cover data URL without episode counter badges.
 */
export function renderPlaylistCoverDataUrl({
  baseImage,
  logoImage,
  gameTitle,
  config,
}: RenderPlaylistCoverParams): string {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 1080;
  exportCanvas.height = 1080;

  renderPlaylistCoverToCanvas(exportCanvas, baseImage, {
    framing: config.image_framing,
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

  return exportCanvas.toDataURL("image/jpeg", 0.92);
}

