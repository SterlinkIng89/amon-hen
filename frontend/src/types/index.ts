export interface VideoFile {
  name: string;
  path: string;
  size: number;
  modTime: number;
  folder: string;
  game: string;
  youtubeTitle?: string;
  remoteYouTubeTitle?: string;
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
  font_family?: string;
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
  default_video_description?: string;
}

export interface ExportItem {
  sourcePath: string;
  targetTitle: string;
  description: string;
  game: string;
  playlistId?: string;
  playlistTitle: string;
  episode?: number;
  contentType?: string;
  privacy: string;
  tags: string[];
}

export interface ExportResult {
  successCount: number;
  failedCount: number;
  exportedPaths: string[];
  exportIds?: string[];
  errors: string[];
}

export interface ExportedVideoRecord {
  readonly exportId: string;
  readonly sourcePath: string;
  readonly exportedPath: string;
  readonly targetTitle: string;
  readonly description: string;
  readonly privacy: string;
  readonly gameTag: string;
  readonly playlistId: string;
  readonly playlistTitle: string;
  readonly episode: number;
  readonly contentType: string;
  readonly tags: string;
  readonly status: string;
  readonly youtubeId: string;
  readonly errorMsg: string;
  readonly exportedAt: number;
  readonly appliedAt: number;
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
  gameTag?: string;
  monetizationStatus?:
    "monetized" | "limited" | "demonetized" | "unknown" | string;
  rejectionReason?: string;
  statusIssues?: string[];
}

export interface CatalogVideoDraft {
  readonly videoId: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly thumbnailUrl: string;
  readonly localFile?: string;
  readonly position: number;
  readonly existingEpisode: number;
  readonly episode: number;
  readonly source: "db" | "title" | "order" | "none";
  readonly conflict: boolean;
  readonly thumbnailUpdatedAt?: number;
  readonly titleEpisode?: number;
  readonly sortDate?: string;
  readonly mismatch?: boolean;
  readonly chronologyIssue?: boolean;
}

export type BatchItemStatus =
  | "pending"
  | "rendering"
  | "uploading"
  | "done"
  | "failed"
  | "skipped";

export interface BatchItem {
  readonly videoId: string;
  readonly episode: number;
  readonly cacheKey: string;
  readonly localFile?: string;
  readonly thumbnailUpdatedAt?: number;
  readonly thumbnailEpisode?: number;
  readonly status: BatchItemStatus;
  readonly error?: string;
}

export interface BatchDescriptionInputItem {
  readonly videoId: string;
  readonly title: string;
  readonly currentDescription: string;
}

export interface BatchDescriptionItem extends BatchDescriptionInputItem {
  readonly status: BatchItemStatus;
  readonly error?: string;
}

export interface BatchProgress {
  readonly current: number;
  readonly total: number;
  readonly successCount: number;
  readonly failCount: number;
}

export interface ThumbnailBatchJob {
  readonly items: readonly BatchItem[];
  readonly running: boolean;
  readonly runId: number;
  readonly cancelRequested: boolean;
}

export interface DescriptionBatchJob {
  readonly items: readonly BatchDescriptionItem[];
  readonly running: boolean;
  readonly runId: number;
  readonly cancelRequested: boolean;
  readonly progress: BatchProgress;
  readonly targetDescription?: string;
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
  auto_backup?: boolean;
}

export interface BackupStatus {
  readonly backupFolder: string;
  readonly totalBackedUp: number;
  readonly totalBytes: number;
  readonly lastBackupAt: number;
  readonly enabledFolders: string[];
}

export interface BackupRunResult {
  readonly copiedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly errors: string[];
}

export type ViewMode =
  "grid" | "player" | "channel" | "queue" | "stats" | "steam";
export type PlaylistPrivacy = "public" | "unlisted" | "private";
export type SortMode = "date" | "name" | "size" | "duration" | "episode";
export type LibraryGroupMode = "date" | "game" | "status" | "folder" | "none";
export type ChannelGroupMode = "date" | "playlist" | "game" | "privacy" | "status" | "none";
export type CardDensity = "compact" | "default" | "large";

export interface MatchedExportItem {
  readonly exportId: string;
  readonly sourcePath: string;
  readonly exportedPath: string;
  readonly targetTitle: string;
  readonly description: string;
  readonly privacy: string;
  readonly gameTag: string;
  readonly playlistId: string;
  readonly playlistTitle: string;
  readonly episode: number;
  readonly contentType: string;
  readonly tags: string;
  readonly status: string;
  readonly youtubeId: string;
  readonly errorMsg: string;
  readonly exportedAt: number;
  readonly appliedAt: number;
  readonly youtubeTitle: string;
  readonly youtubePrivacy: string;
  readonly thumbnailUrl: string;
  readonly alreadyInPlaylist: boolean;
  readonly estimatedQuota: number;
}

export interface ApplyMatchedExportsResult {
  readonly applied: readonly string[];
  readonly failed: Readonly<Record<string, string>>;
  readonly skipped: readonly string[];
  readonly cleanedUpPaths: readonly string[];
  readonly stoppedOnQuota: boolean;
}

export interface ExportSyncProgressEvent {
  readonly current: number;
  readonly total: number;
  readonly exportId: string;
  readonly videoId: string;
  readonly title: string;
  readonly percentage: number;
}

export const CARD_DENSITY_CLASSES: Record<CardDensity, string> = {
  compact: "grid-cols-[repeat(auto-fill,minmax(175px,1fr))] gap-4",
  default: "grid-cols-[repeat(auto-fill,minmax(213px,1fr))] gap-5",
  large: "grid-cols-[repeat(auto-fill,minmax(285px,1fr))] gap-6",
};

