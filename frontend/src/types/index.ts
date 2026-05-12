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

export type ViewMode = "grid" | "player" | "channel";
