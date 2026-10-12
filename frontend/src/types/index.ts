export interface VideoFile {
  name: string;
  path: string;
  size: number;
  modTime: number;
  folder: string;
  game: string;
  youtubeTitle?: string;
  description?: string;
  privacy?: string;
  youtubeId?: string;
  playlistId?: string;
  playlistTitle?: string;
  episode?: number;
  durationSecs?: number;
  event?: string;
  gameMode?: string;
  customVars?: Record<string, string>;
  contentType?: string;
}

export type EpisodeNumberPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type EpisodeFormat = "hash" | "ep" | "number" | "pad2";

export interface ImageFraming {
  readonly offset_x: number; // 0..1, 0.5 = centered
  readonly offset_y: number; // 0..1, 0.5 = centered
  readonly zoom: number;     // 1..3, 1 = cover fit
}

export interface ElementLayout {
  readonly x: number;      // 0..1 center
  readonly y: number;      // 0..1 center
  readonly scale: number;  // 0.25..3, 1 = default
}

export interface LogoLayer extends ElementLayout {
  readonly enabled: boolean;
}

export interface TitleLayer extends ElementLayout {
  readonly enabled: boolean;
  readonly text_override?: string;
  readonly color?: string;
}

export interface TagThumbnailConfig {
  enabled: boolean;
  source_type: "steam" | "custom";
  steam_asset_type?: "hero" | "header" | "poster";
  custom_image_path?: string;
  episode_position: EpisodeNumberPosition;
  episode_format: EpisodeFormat;
  font_color?: string;
  image_framing?: ImageFraming;
  episode_layout?: ElementLayout;
  logo?: LogoLayer;
  title?: TitleLayer;
}

export interface SteamGameArtwork {
  title?: string;
  heroUrl?: string;
  headerUrl?: string;
  posterUrl?: string;
  logoUrl?: string;
}

export interface TagPlaylistConfig {
  vod_playlist_id: string;
  clip_playlist_id: string;
  thumbnail_config?: TagThumbnailConfig;
}

export interface GameProfile {
  type: string; // "singleplayer" | "multiplayer"
  titleTemplate: string;
  modes?: string[]; // list of available game modes
}

export interface Config {
  folders: string[];
  youtube_client_id: string;
  youtube_client_secret: string;
  youtube_token_json?: string;
  video_games: Record<string, string>;
  video_metadata: Record<string, any>;
  folder_settings: Record<string, FolderConfig>;
  game_profiles: Record<string, GameProfile>;
  tag_playlists: Record<string, string>;
  tag_playlist_configs?: Record<string, TagPlaylistConfig>;
  watch_folder_enabled: boolean;
  title_separator?: string;
  recent_field_values?: Record<string, string[]>;
  steam_api_key?: string;
  steam_id?: string;
  export_folder?: string;
}

export interface ExportItem {
  sourcePath: string;
  targetTitle: string;
  description: string;
  game: string;
  playlistTitle: string;
  privacy: string;
  tags: string[];
}

export interface ExportResult {
  successCount: number;
  failedCount: number;
  exportedPaths: string[];
  errors: string[];
}

export interface YTVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  duration: string;
  privacy: string;
  localFile?: string;
  playlistTitle?: string;
  episode?: number;
  monetizationStatus?:
    "monetized" | "limited" | "demonetized" | "unknown" | string;
  rejectionReason?: string;
  statusIssues?: string[];
}

export interface YTPlaylist {
  id: string;
  title: string;
  description: string;
  videoCount: number;
  thumbnailUrl: string;
  publishedAt: string;
  privacy?: string;
  duplicateCount?: number;
}

export interface VideoGroup {
  label: string;
  dateKey: string;
  videos: VideoFile[];
}

export interface VideoGroupYT {
  label: string;
  dateKey: string;
  videos: YTVideo[];
}

export interface FolderConfig {
  recursive: boolean;
  max_duration_secs: number;
}

export type ViewMode =
  "grid" | "player" | "channel" | "queue" | "stats" | "steam";
export type PlaylistPrivacy = "public" | "unlisted" | "private";
