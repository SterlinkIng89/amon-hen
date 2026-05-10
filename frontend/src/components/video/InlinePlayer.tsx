import React, { useEffect, useRef, useState } from "react";
import { VideoFile } from "../../types";
import { formatSize, formatDuration, generateYouTubeTitle } from "../../utils/videoUtils";
import { UploadToYouTube, SaveVideoMetadata, DeleteFiles } from "../../../wailsjs/go/main/App";
import { QueueItem } from "../youtube/UploadQueue";
import { useRecentTags } from "../../hooks/useRecentTags";
import TagInput from "../ui/TagInput";

interface InlinePlayerProps {
  video: VideoFile;
  streamPort: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onAddToQueue: (item: QueueItem) => void;
  onTagSaved?: () => void;
  onDelete?: () => void;
}

export default function InlinePlayer({ video, streamPort, onPrev, onNext, onAddToQueue, onTagSaved, onDelete }: InlinePlayerProps) {
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

  // Handle true fullscreen
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onFSChange = () => {
      if (document.fullscreenElement === el) {
        // @ts-ignore
        window.runtime?.WindowFullscreen();
      } else {
        // @ts-ignore
        window.runtime?.WindowUnfullscreen();
      }
    };
    el.addEventListener("fullscreenchange", onFSChange);
    el.addEventListener("webkitfullscreenchange", onFSChange);
    return () => {
      el.removeEventListener("fullscreenchange", onFSChange);
      el.removeEventListener("webkitfullscreenchange", onFSChange);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      // Do not navigate if user is interacting with an input, textarea, or the video element
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "VIDEO") {
        return;
      }
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  // Info panel state
  const [ytTitle, setYtTitle] = useState(video.youtubeTitle || generateYouTubeTitle(video.name, video.game));
  const [tagInput, setTagInput] = useState(video.game || "");
  const [description, setDescription] = useState(video.description || "");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">(
    (video.privacy as "public" | "unlisted" | "private") || "unlisted"
  );
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [isInfoExpanded, setIsInfoExpanded] = useState(() => {
    return localStorage.getItem("player_info_expanded") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("player_info_expanded", String(isInfoExpanded));
  }, [isInfoExpanded]);

  const [aspectRatio, setAspectRatio] = useState(window.innerWidth / window.innerHeight);

  useEffect(() => {
    const handleResize = () => setAspectRatio(window.innerWidth / window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isWide = aspectRatio >= 2.0;

  const { addRecentTag } = useRecentTags();

  // Reset when video changes
  useEffect(() => {
    setYtTitle(video.youtubeTitle || generateYouTubeTitle(video.name, video.game));
    setTagInput(video.game || "");
    setDescription(video.description || "");
    setPrivacy((video.privacy as "public" | "unlisted" | "private") || "unlisted");
    setInfoSaved(false);
    setConfirmDelete(false);
    setDeleting(false);
  }, [video.path, video.game, video.name, video.youtubeTitle, video.description, video.privacy]);

  // Auto-update YT title when tag changes (if they haven't manually saved a different title yet)
  const handleTagChange = (val: string) => {
    setTagInput(val);
    if (!video.youtubeTitle) {
      setYtTitle(generateYouTubeTitle(video.name, val));
    }
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    try {
      await SaveVideoMetadata(video.path, tagInput, ytTitle, description, privacy);
      if (tagInput) addRecentTag(tagInput);
      setInfoSaved(true);
      onTagSaved?.();
      setTimeout(() => setInfoSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingInfo(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await DeleteFiles([video.path]);
      onDelete?.();
    } catch (e: any) {
      alert(e?.message || e || "Failed to delete file");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleUploadNow = () => {
    if (tagInput) addRecentTag(tagInput);
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
    if (tagInput) addRecentTag(tagInput);
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

  const isDirty = 
    tagInput !== (video.game || "") ||
    ytTitle !== (video.youtubeTitle || generateYouTubeTitle(video.name, video.game)) ||
    description !== (video.description || "") ||
    privacy !== (video.privacy || "unlisted");

  return (
    <div className={`flex h-full overflow-hidden bg-base ${isWide ? "flex-row" : "flex-col"}`}>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Video */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[200px]">
          {!deleting ? (
            <video ref={videoRef} key={video.path} src={src} controls className={`w-full h-full object-contain outline-none ${isWide ? "max-h-full" : "max-h-[75vh]"}`} autoPlay />
          ) : (
            <div className="text-text-muted">Deleting...</div>
          )}
        </div>

        {/* Nav */}
        <div className={`flex items-center px-6 py-2.5 bg-surface border-t border-border-subtle shrink-0 shadow-sm z-10 relative ${isWide ? "justify-center" : "justify-between"}`}>
          {/* Left: File Info (Only for standard mode) */}
          {!isWide && (
            <div className="flex-1 flex items-center gap-2 overflow-hidden mr-4">
              <span className="font-mono text-xs text-text-muted truncate" title={video.path}>{video.name}</span>
              <span className="text-text-secondary/40 shrink-0 text-xs">•</span>
              <span className="text-text-secondary text-xs shrink-0">{formatSize(video.size)}</span>
            </div>
          )}

          {/* Center: Controls */}
          <div className="flex items-center gap-2">
            <button 
              className="btn btn-ghost px-5 py-2 hover:bg-elevated rounded-md transition-colors flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-30" 
              onClick={onPrev ?? undefined} 
              disabled={!onPrev} 
              title="Previous (←)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
              Previous
            </button>
            <button 
              className="btn btn-ghost px-5 py-2 hover:bg-elevated rounded-md transition-colors flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-30" 
              onClick={onNext ?? undefined} 
              disabled={!onNext} 
              title="Next (→)"
            >
              Next
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z" /></svg>
            </button>
          </div>

          {/* Right: Toggle (Only for standard mode) */}
          {!isWide && (
            <div className="flex-1 flex justify-end ml-4">
              <button 
                className="flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition-all px-3 py-1.5 rounded-md hover:bg-elevated border border-border-subtle shadow-sm"
                onClick={() => setIsInfoExpanded(!isInfoExpanded)}
              >
                {isInfoExpanded ? "Hide Details" : "Show Details"}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${isInfoExpanded ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info & Edit panel */}
      {isWide ? (
        <div className={`bg-surface border-l border-border-subtle shrink-0 transition-all duration-300 flex flex-col ${isInfoExpanded ? "w-[400px] 2xl:w-[480px]" : "w-12 items-center py-4"}`}>
          {isInfoExpanded ? (
            <div className="flex flex-col h-full w-full p-6 gap-5 animate-in fade-in duration-300">
              {/* Panel Header (Sidebar mode) */}
              <div className="flex items-center gap-4 pb-5 border-b border-border-subtle shrink-0">
                <button 
                  className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-elevated shrink-0"
                  onClick={() => setIsInfoExpanded(false)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-90">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  Hide
                </button>
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="font-mono text-xs text-text-muted truncate" title={video.path}>{video.name}</span>
                  <span className="text-text-secondary/40 shrink-0 text-xs">•</span>
                  <span className="text-text-secondary text-xs shrink-0">{formatSize(video.size)}</span>
                </div>
              </div>

              {/* Form Content - Scrollable Middle */}
              <div className="flex-1 flex flex-col gap-6 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Game Tag</label>
                  <TagInput value={tagInput} onChange={handleTagChange} onEnter={handleSaveInfo} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">YouTube Title</label>
                  <input type="text" className="flex-1 bg-elevated border border-border-subtle rounded-md px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent" value={ytTitle} onChange={e => setYtTitle(e.target.value)} maxLength={100} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Description</label>
                  <textarea className="flex-1 bg-elevated border border-border-subtle rounded-md px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent resize-y min-h-[120px]" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-text-secondary">Privacy</label>
                  <div className="flex gap-2">
                    {(["public", "unlisted", "private"] as const).map(p => (
                      <button key={p} className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${privacy === p ? "bg-accent/10 text-accent border-accent/50 border" : "bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary"}`} onClick={() => setPrivacy(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-px bg-border-subtle w-full shrink-0" />

              {/* Upload & Save actions - Fixed Bottom */}
              <div className="flex flex-col items-stretch gap-3 shrink-0">
                <button 
                  className={`btn ${confirmDelete ? "bg-red-500/20 text-red-500" : "bg-red-500/5 text-red-500/70 hover:bg-red-500/10 hover:text-red-500"} transition-colors py-2 text-xs font-bold`} 
                  onClick={handleDelete} 
                  disabled={deleting}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  {confirmDelete ? (deleting ? "Deleting..." : "Confirm Delete?") : "Delete Video"}
                </button>
                <div className="flex flex-col gap-2.5">
                  <button 
                    className={`btn transition-colors py-2.5 shadow-sm text-xs font-bold ${infoSaved || isDirty ? "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20" : "bg-elevated border border-border-subtle text-text-muted opacity-50 cursor-default"}`} 
                    onClick={handleSaveInfo} 
                    disabled={savingInfo || (!isDirty && !infoSaved)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    {infoSaved ? "Saved!" : savingInfo ? "Saving..." : "Save Info"}
                  </button>
                  <button className="btn btn-ghost bg-elevated border border-border-subtle hover:border-border-medium py-2.5 text-xs font-bold" onClick={handleAddToQueue}>Add to Queue</button>
                  <button className="btn btn-primary py-3 shadow-md hover:shadow-lg transition-all text-xs font-bold" onClick={handleUploadNow} disabled={uploading || !ytTitle.trim()}>Upload Now</button>
                </div>
              </div>
            </div>
          ) : (
            <button 
              className="p-3 hover:bg-elevated rounded-md transition-colors text-text-secondary hover:text-text-primary group"
              onClick={() => setIsInfoExpanded(true)}
              title="Show Details"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 group-hover:scale-110 transition-transform">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          )}
        </div>
      ) : (
        isInfoExpanded && (
          <div className="bg-surface border-t border-border-subtle p-6 overflow-y-auto shrink-0 flex flex-col gap-6 min-h-[300px] animate-in slide-in-from-bottom duration-300">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Game Tag</label>
                <TagInput value={tagInput} onChange={handleTagChange} onEnter={handleSaveInfo} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">YouTube Title</label>
                <input type="text" className="flex-1 bg-elevated border border-border-subtle rounded-md px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent" value={ytTitle} onChange={e => setYtTitle(e.target.value)} maxLength={100} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Description</label>
                <textarea className="flex-1 bg-elevated border border-border-subtle rounded-md px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent resize-y min-h-[80px]" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-text-secondary">Privacy</label>
                <div className="flex gap-2">
                  {(["public", "unlisted", "private"] as const).map(p => (
                    <button key={p} className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${privacy === p ? "bg-accent/10 text-accent border-accent/50 border" : "bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary"}`} onClick={() => setPrivacy(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-px bg-border-subtle w-full my-1" />
            <div className="flex items-center justify-between gap-4 mt-1">
              <button className={`btn transition-colors py-2 text-xs font-bold ${confirmDelete ? "bg-red-500/20 text-red-500" : "bg-red-500/5 text-red-500/70 hover:bg-red-500/10 hover:text-red-500"}`} onClick={handleDelete} disabled={deleting}>{confirmDelete ? "Confirm Delete?" : "Delete Video"}</button>
              <div className="flex items-center gap-3">
                <button className={`btn transition-colors py-2.5 shadow-sm text-xs font-bold ${infoSaved || isDirty ? "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20" : "bg-elevated border border-border-subtle text-text-muted opacity-50 cursor-default"}`} onClick={handleSaveInfo} disabled={savingInfo || (!isDirty && !infoSaved)}>{infoSaved ? "Saved!" : "Save Info"}</button>
                <button className="btn btn-ghost bg-elevated border border-border-subtle hover:border-border-medium py-2.5 text-xs font-bold" onClick={handleAddToQueue}>Add to Queue</button>
                <button className="btn btn-primary py-3 shadow-md hover:shadow-lg transition-all text-xs font-bold" onClick={handleUploadNow} disabled={uploading || !ytTitle.trim()}>Upload Now</button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
