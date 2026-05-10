import React, { useEffect, useRef, useState } from "react";
import { VideoFile } from "../../types";
import { formatSize, formatDuration, generateYouTubeTitle } from "../../utils/videoUtils";
import { SetVideoGames, UploadToYouTube } from "../../../wailsjs/go/main/App";
import { QueueItem } from "../youtube/UploadQueue";

interface InlinePlayerProps {
  video: VideoFile;
  streamPort: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onAddToQueue: (item: QueueItem) => void;
  onTagSaved?: () => void;
}

export default function InlinePlayer({ video, streamPort, onPrev, onNext, onAddToQueue, onTagSaved }: InlinePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = `http://127.0.0.1:${streamPort}/stream?path=${encodeURIComponent(video.path)}`;

  const STORAGE_VOLUME_KEY = "player_volume";
  const STORAGE_MUTED_KEY  = "player_muted";

  // Restore saved volume + mute when loading a new video
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const savedVolume = localStorage.getItem(STORAGE_VOLUME_KEY);
    const savedMuted  = localStorage.getItem(STORAGE_MUTED_KEY);
    if (savedVolume !== null) el.volume = parseFloat(savedVolume);
    if (savedMuted  !== null) el.muted  = savedMuted === "true";
    el.load();
    el.play().catch(() => {});
  }, [video.path]);

  // Persist whenever the user adjusts the volume or mutes
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onVolumeChange = () => {
      localStorage.setItem(STORAGE_VOLUME_KEY, String(el.volume));
      localStorage.setItem(STORAGE_MUTED_KEY,  String(el.muted));
    };
    el.addEventListener("volumechange", onVolumeChange);
    return () => el.removeEventListener("volumechange", onVolumeChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  // Info panel state
  const [ytTitle, setYtTitle] = useState(generateYouTubeTitle(video.name, video.game));
  const [tagInput, setTagInput] = useState(video.game || "");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("unlisted");
  const [savingTag, setSavingTag] = useState(false);
  const [tagSaved, setTagSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Reset when video changes
  useEffect(() => {
    setYtTitle(generateYouTubeTitle(video.name, video.game));
    setTagInput(video.game || "");
    setDescription("");
    setTagSaved(false);
  }, [video.path]);

  // Auto-update YT title when tag changes
  const handleTagChange = (val: string) => {
    setTagInput(val);
    setYtTitle(generateYouTubeTitle(video.name, val));
  };

  const handleSaveTag = async () => {
    setSavingTag(true);
    try {
      await SetVideoGames([video.path], tagInput);
      setTagSaved(true);
      onTagSaved?.();
      setTimeout(() => setTagSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingTag(false);
    }
  };

  const handleUploadNow = () => {
    setUploading(true);
    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      title: ytTitle,
      description,
      privacy,
      status: "uploading",
      progress: 0,
    };
    onAddToQueue(item);
    UploadToYouTube(video.path, ytTitle, description, privacy).catch(() => {});
    setTimeout(() => setUploading(false), 1000);
  };

  const handleAddToQueue = () => {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      title: ytTitle,
      description,
      privacy,
      status: "pending",
      progress: 0,
    };
    onAddToQueue(item);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-base">
      {/* Video */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[300px]">
        <video ref={videoRef} key={video.path} src={src} controls className="w-full h-full object-contain outline-none max-h-[65vh]" autoPlay />
      </div>

      {/* Nav */}
      <div className="flex items-center justify-center gap-2 py-3 bg-surface border-y border-border-subtle shrink-0">
        <button className="btn btn-ghost w-32 justify-center" onClick={onPrev ?? undefined} disabled={!onPrev} title="Previous (←)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
          Previous
        </button>
        <button className="btn btn-ghost w-32 justify-center" onClick={onNext ?? undefined} disabled={!onNext} title="Next (→)">
          Next
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z" /></svg>
        </button>
      </div>

      {/* Info & Edit panel */}
      <div className="bg-surface border-t border-border-subtle p-5 overflow-y-auto shrink-0 flex flex-col gap-4 min-h-[250px]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">File</span>
            <span className="font-mono text-xs text-text-muted truncate" title={video.path}>{video.name}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Size</span>
            <span className="text-sm text-text-primary">{formatSize(video.size)}</span>
          </div>
        </div>

        <div className="h-px bg-border-subtle w-full" />

        <div className="flex flex-col gap-3">
          {/* Game tag */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Game Tag</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                placeholder="e.g. Hollow Knight"
                value={tagInput}
                onChange={e => handleTagChange(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveTag()}
              />
              <button
                className={`btn btn-sm ${tagSaved ? "btn-success" : "btn-ghost"}`}
                onClick={handleSaveTag}
                disabled={savingTag}
              >
                {tagSaved ? "Saved!" : savingTag ? "..." : "Save"}
              </button>
            </div>
          </div>

          {/* YouTube title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">YouTube Title</label>
            <input
              type="text"
              className="flex-1 bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
              value={ytTitle}
              onChange={e => setYtTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Description</label>
            <textarea
              className="flex-1 bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] resize-y min-h-[60px] font-sans"
              placeholder="Optional description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Privacy */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Privacy</label>
            <div className="flex gap-2">
              {(["public", "unlisted", "private"] as const).map(p => (
                <button
                  key={p}
                  className={`flex-1 py-1.5 rounded-sm text-xs font-medium cursor-pointer transition-colors ${privacy === p ? "bg-accent text-white border-accent" : "bg-elevated border border-border-subtle text-text-secondary hover:bg-card hover:text-text-primary"}`}
                  onClick={() => setPrivacy(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-px bg-border-subtle w-full" />

        {/* Upload actions */}
        <div className="flex items-center justify-end gap-3 mt-2">
          <button className="btn btn-ghost btn-sm" onClick={handleAddToQueue}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
            </svg>
            Add to Queue
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleUploadNow} disabled={uploading || !ytTitle.trim()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
            </svg>
            {uploading ? "Starting..." : "Upload Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
