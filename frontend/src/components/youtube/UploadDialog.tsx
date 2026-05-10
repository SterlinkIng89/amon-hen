import { useState } from "react";
import { VideoFile } from "../../types";
import { generateYouTubeTitle } from "../../utils/videoUtils";

export interface UploadOptions {
  title: string;
  description: string;
  privacy: "public" | "unlisted" | "private";
}

interface Props {
  video: VideoFile;
  onClose: () => void;
  onUploadNow: (opts: UploadOptions) => void;
  onAddToQueue: (opts: UploadOptions) => void;
}

export default function UploadDialog({ video, onClose, onUploadNow, onAddToQueue }: Props) {
  const [title, setTitle] = useState(generateYouTubeTitle(video.name, video.game));
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("unlisted");

  const opts = (): UploadOptions => ({ title, description, privacy });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-[500px] bg-card border border-border-subtle rounded-md shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface">
          <h3 className="m-0 text-base font-bold text-text-primary">Upload to YouTube</h3>
          <button className="p-1 bg-transparent border-none text-text-secondary cursor-pointer rounded-sm hover:bg-black/10 hover:text-text-primary transition-colors flex items-center justify-center" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
          <p className="m-0 text-xs font-mono text-text-muted p-2 bg-elevated rounded-sm border border-border-subtle break-words" title={video.name}>{video.name}</p>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Title</label>
            <input
              className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Video title"
              maxLength={100}
            />
            <span className="absolute top-0 right-0 text-[10px] text-text-muted font-medium">{title.length}/100</span>
            <span className="text-[10px] text-text-muted mt-0.5">Pattern: <em>Game - YYYY MM DD - Ep#</em></span>
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Description</label>
            <textarea
              className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] resize-y min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              maxLength={5000}
            />
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Privacy</label>
            <div className="flex gap-2">
              {(["public", "unlisted", "private"] as const).map((p) => (
                <button
                  key={p}
                  className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-sm text-xs font-semibold cursor-pointer transition-colors ${privacy === p ? "bg-accent text-white border border-accent hover:bg-accent" : "bg-elevated border border-border-subtle text-text-secondary hover:bg-card hover:border-border-medium hover:text-text-primary"}`}
                  onClick={() => setPrivacy(p)}
                >
                  {p === "public" && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                  )}
                  {p === "unlisted" && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </svg>
                  )}
                  {p === "private" && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                    </svg>
                  )}
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border-subtle bg-surface">
          <button className="btn btn-ghost" onClick={() => { onAddToQueue(opts()); onClose(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
            </svg>
            Add to Queue
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { onUploadNow(opts()); onClose(); }}
            disabled={!title.trim()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
            </svg>
            Upload Now
          </button>
        </div>
      </div>
    </div>
  );
}
