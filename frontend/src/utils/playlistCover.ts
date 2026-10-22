import {
  SaveCustomThumbnail,
  SetYouTubePlaylistThumbnail,
} from "../../wailsjs/go/backend/App";
import { TagThumbnailConfig } from "../types";
import { renderPlaylistCoverDataUrl } from "./thumbnailRender";

export const DEFAULT_COVER_CONFIG: TagThumbnailConfig = {
  enabled: true,
  source_type: "steam",
  steam_asset_type: "header",
  episode_position: "bottom-left",
  episode_format: "pad2",
};

export interface GenerateAndUploadPlaylistCoverParams {
  readonly playlistId: string;
  readonly baseImage: HTMLImageElement | null;
  readonly logoImage: HTMLImageElement | null;
  readonly gameTitle: string;
  readonly config?: TagThumbnailConfig | null;
}

export async function generateAndUploadPlaylistCover({
  playlistId,
  baseImage,
  logoImage,
  gameTitle,
  config,
}: GenerateAndUploadPlaylistCoverParams): Promise<string> {
  const effectiveConfig = config || DEFAULT_COVER_CONFIG;
  const dataUrl = renderPlaylistCoverDataUrl({
    baseImage,
    logoImage,
    gameTitle,
    config: effectiveConfig,
  });
  const savedPath = await SaveCustomThumbnail("playlist_" + playlistId, dataUrl);
  return await SetYouTubePlaylistThumbnail(playlistId, savedPath);
}
