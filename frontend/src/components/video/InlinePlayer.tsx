import React, { useEffect, useRef, useState } from "react";
import { VideoFile, YTPlaylist } from "../../types";
import { formatSize, formatDuration, generateYouTubeTitle } from "../../utils/videoUtils";
import { UploadToYouTube, SaveVideoMetadata, DeleteFiles, GetChannelPlaylists, GetOrCreatePlaylist, RegenerateThumbnail, UpdateYouTubeVideoMetadata } from "../../../wailsjs/go/backend/App";
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
      // Do not fire shortcuts when user is typing
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
        return;
      }
      const el = videoRef.current;
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
      if (e.key === " " || e.key === "Spacebar") {
        // Prevent page scroll
        e.preventDefault();
        if (!el) return;
        if (el.paused) el.play().catch(() => {});
        else el.pause();
      }
      if (e.key === "m" || e.key === "M") {
        if (!el) return;
        el.muted = !el.muted;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  // Info panel state
  const [ytTitle, setYtTitle] = useState(video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode));
  const [tagInput, setTagInput] = useState(video.game || "");
  const [description, setDescription] = useState(video.description || "");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">(
    (video.privacy as "public" | "unlisted" | "private") || "unlisted"
  );
  const [playlistId, setPlaylistId] = useState(video.playlistId || "");
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState(video.playlistTitle || "");
  const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
  const [isCreatingPlaylistLoading, setIsCreatingPlaylistLoading] = useState(false);
  const [playlistCreateError, setPlaylistCreateError] = useState("");

  // Sync form state whenever the video prop itself changes (e.g. after a rescan or
  // when the user navigates to a different video with arrow keys).
  // Without this, ytTitle/tagInput etc. would stay stale from the previous mount.
  useEffect(() => {
    setYtTitle(video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode));
    setTagInput(video.game || "");
    setDescription(video.description || "");
    setPrivacy((video.privacy as "public" | "unlisted" | "private") || "unlisted");
    setPlaylistId(video.playlistId || "");
    setPlaylistSearch(video.playlistTitle || "");
  }, [video.path, video.youtubeTitle, video.game, video.description, video.privacy, video.playlistId]);

  useEffect(() => {
    if (playlistId && playlists.length > 0) {
      const p = playlists.find(p => p.id === playlistId);
      if (p) setPlaylistSearch(p.title);
    }
  }, [playlists, playlistId]);
  
  const refreshPlaylists = () => {
    GetChannelPlaylists("recent")
      .then(setPlaylists)
      .catch(() => {});
  };

  useEffect(() => {
    refreshPlaylists();
  }, []);

  const handleCreatePlaylist = async () => {
    if (!newPlaylistTitle.trim()) return;
    setIsCreatingPlaylistLoading(true);
    setPlaylistCreateError("");
    try {
      const id = await GetOrCreatePlaylist(newPlaylistTitle.trim(), "", privacy);
      setNewPlaylistTitle("");
      setIsCreatingPlaylist(false);
      setPlaylistId(id);
      setPlaylistSearch(newPlaylistTitle.trim());
      refreshPlaylists();
    } catch (e: any) {
      setPlaylistCreateError(e?.toString() ?? "Failed to get or create playlist");
    } finally {
      setIsCreatingPlaylistLoading(false);
    }
  };
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [ytUpdateError, setYtUpdateError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [regenThumb, setRegenThumb] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);

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
    setYtTitle(video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode));
    setTagInput(video.game || "");
    setDescription(video.description || "");
    setPrivacy((video.privacy as "public" | "unlisted" | "private") || "unlisted");
    setPlaylistId(video.playlistId || "");
    setPlaylistSearch(video.playlistTitle || ""); 
    setInfoSaved(false);
    setConfirmDelete(false);
    setDeleting(false);
  }, [video.path, video.game, video.name, video.youtubeTitle, video.description, video.privacy, video.playlistId, video.episode]);

  // Auto-update YT title when tag changes (if they haven't manually saved a different title yet)
  const handleTagChange = (val: string) => {
    const oldGenerated = generateYouTubeTitle(video.name, tagInput, video.episode);
    setTagInput(val);
    
    // If current title is the one we auto-generated for the old tag, or if it matches the current video's saved title, update it
    // This allows the title to "follow" the tag unless the user has typed something custom
    if (ytTitle === oldGenerated || ytTitle === (video.youtubeTitle || "") || !ytTitle) {
      setYtTitle(generateYouTubeTitle(video.name, val, video.episode));
    }
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    setYtUpdateError(null);

    const tagChanged = tagInput !== (video.game || "");

    // When the tag changed, blank the persisted title so the backend scanner
    // re-enumerates this video with the correct episode number for the new tag
    // (same mechanism that SetVideoGames / BulkActionBar uses).
    const currentTitle = ytTitle; // capture before we clear it
    const titleToSave = tagChanged ? "" : ytTitle;
    if (tagChanged) {
      setYtTitle(""); // will be re-populated after the next rescan
    }
    try {
      // 1. Always save to local config / DB first
      await SaveVideoMetadata(video.path, tagInput, titleToSave, description, privacy, playlistId, video.episode || 0);
      if (tagInput) addRecentTag(tagInput);

      // 2. If video is already on YouTube, push the metadata update to the API
      if (video.youtubeId) {
        try {
          await UpdateYouTubeVideoMetadata(video.youtubeId, currentTitle, description, privacy);
        } catch (ytErr: any) {
          // Don't block local save — just surface the error
          setYtUpdateError(ytErr?.toString() ?? "Failed to update on YouTube");
        }
      }

      setInfoSaved(true);
      onTagSaved?.();
      setTimeout(() => setInfoSaved(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingInfo(false);
    }
  };

  const handleRegenerateThumbnail = async () => {
    setRegenLoading(true);
    try {
      const fresh = await RegenerateThumbnail(video.path);
      if (fresh) setRegenThumb(fresh);
    } catch (e) {
      console.error("Failed to regenerate thumbnail", e);
    } finally {
      setRegenLoading(false);
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

  const handleUploadNow = async () => {
    if (tagInput) addRecentTag(tagInput);
    setUploading(true);
    
    // Save metadata to local database first
    await SaveVideoMetadata(video.path, tagInput, ytTitle, description, privacy, playlistId, video.episode || 0).catch(console.error);
    onTagSaved?.(); // Refresh UI in dashboard

    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      title: ytTitle,
      description,
      privacy,
      status: "uploading",
      progress: 0,
      playlistId,
      gameTag: tagInput,
      episode: video.episode,
    };
    onAddToQueue(item);
    UploadToYouTube(video.path, ytTitle, description, privacy, playlistId || "", tagInput, video.episode || 0).catch(() => {});
    setTimeout(() => setUploading(false), 1000);
  };

  const handleAddToQueue = async () => {
    if (tagInput) addRecentTag(tagInput);
    
    // Save metadata to local database first
    await SaveVideoMetadata(video.path, tagInput, ytTitle, description, privacy, playlistId, video.episode || 0).catch(console.error);
    onTagSaved?.(); // Refresh UI in dashboard

    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      title: ytTitle,
      description,
      privacy,
      status: "pending",
      progress: 0,
      playlistId,
      gameTag: tagInput,
      episode: video.episode,
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
          {/* Regenerated thumbnail preview overlay — fades in briefly after regen */}
          {regenThumb && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-20 animate-fadeIn"
              onClick={() => setRegenThumb(null)}
              title="Click to dismiss"
            >
              <div className="flex flex-col items-center gap-2">
                <img src={regenThumb} alt="New thumbnail" className="max-h-[200px] rounded-md border border-white/20 shadow-xl" />
                <span className="text-[11px] text-green-400 font-bold">Thumbnail regenerated</span>
                <span className="text-[10px] text-text-muted">Click anywhere to close</span>
              </div>
            </div>
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

                <div className="flex flex-col gap-1.5 relative">
                   <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-text-secondary">Playlist (Optional)</label>
                      {video.playlistTitle && (
                        <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                          Linked: {video.playlistTitle}
                        </span>
                      )}
                    </div>
                    <button className="text-[10px] font-bold text-accent hover:underline bg-transparent border-none cursor-pointer" onClick={() => { setIsCreatingPlaylist(!isCreatingPlaylist); setPlaylistCreateError(""); }}>
                      {isCreatingPlaylist ? "Cancel" : "+ Get or create"}
                    </button>
                  </div>

                  {isCreatingPlaylist ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-2">
                        <input className="flex-1 bg-elevated border border-accent rounded-md px-3 py-1.5 text-xs text-text-primary outline-none focus:bg-card" type="text" value={newPlaylistTitle} onChange={e => setNewPlaylistTitle(e.target.value)} placeholder="Playlist name..." autoFocus disabled={isCreatingPlaylistLoading} onKeyDown={e => e.key === "Enter" && handleCreatePlaylist()} />
                        <button className="btn btn-primary btn-sm px-3 min-w-[42px]" onClick={handleCreatePlaylist} disabled={!newPlaylistTitle.trim() || isCreatingPlaylistLoading}>
                          {isCreatingPlaylistLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "OK"}
                        </button>
                      </div>
                      <span className="text-[10px] text-text-muted">Existing playlist with same name will be reused.</span>
                      {playlistCreateError && <span className="text-[10px] text-red-400">{playlistCreateError}</span>}
                    </div>
                  ) : (
                    <div className="relative">
                      <input className="w-full bg-elevated border border-border-subtle rounded-md pl-9 pr-3 py-2 text-xs text-text-primary outline-none hover:border-border-medium focus:border-accent" type="text" value={playlistSearch} onChange={e => { setPlaylistSearch(e.target.value); setIsPlaylistDropdownOpen(true); if(!e.target.value) setPlaylistId(""); }} onFocus={() => setIsPlaylistDropdownOpen(true)} placeholder={playlistId ? playlists.find(p => p.id === playlistId)?.title : "Search or select playlist..."} />
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      </div>
                      {playlistId && (
                        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary" onClick={() => { setPlaylistId(""); setPlaylistSearch(""); }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                      )}
                      
                      {isPlaylistDropdownOpen && (
                        <div className="absolute left-0 right-0 bottom-full mb-1 bg-card border border-border-medium rounded-md shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar animate-fadeIn">
                          {playlists.filter(p => p.title.toLowerCase().includes(playlistSearch.toLowerCase())).map(p => (
                            <button key={p.id} className={`w-full text-left px-3 py-2 hover:bg-accent/10 transition-colors flex items-center justify-between ${playlistId === p.id ? "bg-accent/5 text-accent" : "text-text-primary"}`} onClick={() => { setPlaylistId(p.id); setPlaylistSearch(p.title); setIsPlaylistDropdownOpen(false); }}>
                              <span className="text-xs font-bold truncate flex-1">{p.title}</span>
                              {playlistId === p.id && <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-accent"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                            </button>
                          ))}
                        </div>
                      )}
                      {isPlaylistDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsPlaylistDropdownOpen(false)} />}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-border-subtle w-full shrink-0" />

              {/* Upload & Save actions - Fixed Bottom */}
              <div className="flex flex-col items-stretch gap-3 shrink-0">
                {/* Thumbnail regen */}
                <button
                  className="btn bg-elevated border border-border-subtle text-text-secondary hover:border-border-medium hover:text-text-primary py-2 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  onClick={handleRegenerateThumbnail}
                  disabled={regenLoading}
                  title="Re-capture a fresh thumbnail frame from this video"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                  </svg>
                  {regenLoading ? "Regenerating..." : "Regenerate Thumbnail"}
                </button>
                <button
                  className={`btn transition-colors py-2 text-xs font-bold ${confirmDelete ? "bg-red-500/20 text-red-500" : "bg-red-500/5 text-red-500/70 hover:bg-red-500/10 hover:text-red-500"}`}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  {confirmDelete ? (deleting ? "Deleting..." : "Confirm Delete?") : "Delete Video"}
                </button>
                <div className="flex flex-col gap-2.5">
                  {/* YouTube update status */}
                  {ytUpdateError && (
                    <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-md">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-red-400 shrink-0 mt-0.5">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                      </svg>
                      <span className="text-[10px] text-red-400 leading-tight flex-1" title={ytUpdateError}>
                        Saved locally. YouTube update failed: {ytUpdateError.replace(/^Error: /, "")}
                      </span>
                      <button className="text-red-400/60 hover:text-red-400 shrink-0" onClick={() => setYtUpdateError(null)}>×</button>
                    </div>
                  )}
                  {infoSaved && !ytUpdateError && video.youtubeId && (
                    <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-md">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-green-400 shrink-0">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                      <span className="text-[10px] text-green-400 font-medium">Saved locally and updated on YouTube</span>
                    </div>
                  )}
                  <button 
                    className={`btn transition-colors py-2.5 shadow-sm text-xs font-bold ${infoSaved || isDirty ? "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20" : "bg-elevated border border-border-subtle text-text-muted opacity-50 cursor-default"}`} 
                    onClick={handleSaveInfo} 
                    disabled={savingInfo || (!isDirty && !infoSaved)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    {infoSaved ? (video.youtubeId ? "Updated!" : "Saved!") : savingInfo ? (video.youtubeId ? "Updating..." : "Saving...") : "Save Info"}
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
              <div className="flex flex-col gap-1.5 relative">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-text-secondary">Playlist</label>
                  <button className="text-[10px] font-bold text-accent hover:underline bg-transparent border-none cursor-pointer" onClick={() => { setIsCreatingPlaylist(!isCreatingPlaylist); setPlaylistCreateError(""); }}>
                    {isCreatingPlaylist ? "Cancel" : "+ Get or create"}
                  </button>
                </div>
                {isCreatingPlaylist ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <input className="flex-1 bg-elevated border border-accent rounded-md px-3 py-1.5 text-xs text-text-primary outline-none focus:bg-card" type="text" value={newPlaylistTitle} onChange={e => setNewPlaylistTitle(e.target.value)} placeholder="Playlist name..." autoFocus disabled={isCreatingPlaylistLoading} onKeyDown={e => e.key === "Enter" && handleCreatePlaylist()} />
                      <button className="btn btn-primary btn-sm px-3 min-w-[42px]" onClick={handleCreatePlaylist} disabled={!newPlaylistTitle.trim() || isCreatingPlaylistLoading}>
                        {isCreatingPlaylistLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "OK"}
                      </button>
                    </div>
                    <span className="text-[10px] text-text-muted">Existing playlist with same name will be reused.</span>
                    {playlistCreateError && <span className="text-[10px] text-red-400">{playlistCreateError}</span>}
                  </div>
                ) : (
                  <div className="relative">
                    <input className="w-full bg-elevated border border-border-subtle rounded-md pl-9 pr-3 py-2 text-xs text-text-primary outline-none focus:border-accent" type="text" value={playlistSearch} onChange={e => { setPlaylistSearch(e.target.value); setIsPlaylistDropdownOpen(true); if(!e.target.value) setPlaylistId(""); }} onFocus={() => setIsPlaylistDropdownOpen(true)} placeholder={playlistId ? playlists.find(p => p.id === playlistId)?.title : "Select playlist..."} />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    {isPlaylistDropdownOpen && (
                      <div className="absolute left-0 right-0 bottom-full mb-1 bg-card border border-border-medium rounded-md shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar animate-fadeIn">
                        {playlists.filter(p => p.title.toLowerCase().includes(playlistSearch.toLowerCase())).map(p => (
                          <button key={p.id} className={`w-full text-left px-3 py-2 hover:bg-accent/10 transition-colors flex items-center justify-between ${playlistId === p.id ? "bg-accent/5 text-accent" : "text-text-primary"}`} onClick={() => { setPlaylistId(p.id); setPlaylistSearch(p.title); setIsPlaylistDropdownOpen(false); }}>
                            <span className="text-xs font-bold truncate flex-1">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {isPlaylistDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsPlaylistDropdownOpen(false)} />}
                  </div>
                )}
              </div>
            </div>
            <div className="h-px bg-border-subtle w-full my-1" />
            <div className="flex items-center justify-between gap-4 mt-1">
              <button className={`btn transition-colors py-2 text-xs font-bold ${confirmDelete ? "bg-red-500/20 text-red-500" : "bg-red-500/5 text-red-500/70 hover:bg-red-500/10 hover:text-red-500"}`} onClick={handleDelete} disabled={deleting}>{confirmDelete ? "Confirm Delete?" : "Delete Video"}</button>
              <div className="flex items-center gap-3">
                <button
                  className="btn bg-elevated border border-border-subtle text-text-secondary hover:border-border-medium hover:text-text-primary py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  onClick={handleRegenerateThumbnail}
                  disabled={regenLoading}
                  title="Re-capture thumbnail from video"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                  </svg>
                  {regenLoading ? "..." : "Regen Thumb"}
                </button>
                <button className={`btn transition-colors py-2.5 shadow-sm text-xs font-bold ${infoSaved || isDirty ? "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20" : "bg-elevated border border-border-subtle text-text-muted opacity-50 cursor-default"}`} onClick={handleSaveInfo} disabled={savingInfo || (!isDirty && !infoSaved)}>
                  {infoSaved ? (video.youtubeId ? "Updated!" : "Saved!") : savingInfo ? (video.youtubeId ? "Updating..." : "Saving...") : "Save Info"}
                </button>
                <button className="btn btn-ghost bg-elevated border border-border-subtle hover:border-border-medium py-2.5 text-xs font-bold" onClick={handleAddToQueue}>Add to Queue</button>
                {video.youtubeId && (
                  <a href={`https://youtu.be/${video.youtubeId}`} target="_blank" rel="noreferrer" className="btn bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600/20 py-2.5 text-xs font-bold flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
                    </svg>
                    View on YouTube
                  </a>
                )}
                <button className="btn btn-primary py-3 shadow-md hover:shadow-lg transition-all text-xs font-bold" onClick={handleUploadNow} disabled={uploading || !ytTitle.trim()}>
                  {video.youtubeId ? "Re-upload" : "Upload Now"}
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
