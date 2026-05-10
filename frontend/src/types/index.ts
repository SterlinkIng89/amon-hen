export interface VideoFile {
  name: string;
  path: string;
  size: number;
  modTime: number;
  folder: string;
  game?: string;
}

export interface VideoGroup {
  label: string;
  dateKey: string;
  videos: VideoFile[];
}

export type ViewMode = "grid" | "player";
