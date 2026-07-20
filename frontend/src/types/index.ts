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
	event?: string;
	gameMode?: string;
	customVars?: Record<string, string>;
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
	watch_folder_enabled: boolean;
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
}

export interface YTPlaylist {
  id: string;
  title: string;
  description: string;
  videoCount: number;
  thumbnailUrl: string;
  publishedAt: string;
}

export interface VideoGroup {
  label: string;
  dateKey: string;
  videos: VideoFile[];
}

export interface FolderConfig {
  recursive: boolean;
  max_duration_secs: number;
}

export type ViewMode = "grid" | "player" | "channel" | "queue";
