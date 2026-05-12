import { useState, useEffect } from "react";
import { YTVideo, YTPlaylist } from "../../types";
import { 
  UpdateYouTubeVideoMetadata, 
  GetChannelPlaylists, 
  AddVideoToPlaylist,
  CreatePlaylist
} from "../../../wailsjs/go/main/App";

interface YouTubeInlinePlayerProps {
  video: YTVideo;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onUpdate?: () => void;
  onEnded?: () => void;
}

export default function YouTubeInlinePlayer({
  video,
  onPrev,
  onNext,
  onUpdate,
  onEnded,
}: YouTubeInlinePlayerProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editableTitle, setEditableTitle] = useState(video.title);
  const [editableDescription, setEditableDescription] = useState(
    video.description,
  );
  const [editablePrivacy, setEditablePrivacy] = useState(video.privacy);
  const [isSaving, setIsSaving] = useState(false);
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");

  const refreshPlaylists = () => {
    GetChannelPlaylists("recent").then(setPlaylists).catch(() => {});
  };

  useEffect(() => {
    refreshPlaylists();
  }, []);
  const [aspectRatio, setAspectRatio] = useState(window.innerWidth / window.innerHeight);

  useEffect(() => {
    const handleResize = () => setAspectRatio(window.innerWidth / window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isWide = aspectRatio >= 2.0;

  useEffect(() => {
    setEditableTitle(video.title);
    setEditableDescription(video.description);
    setEditablePrivacy(video.privacy);
    setIsEditing(false);

    let player: any = null;

    const createPlayer = () => {
      if (!(window as any).YT || !(window as any).YT.Player) return;
      
      // Clear container first
      const container = document.getElementById("yt-player-container");
      if (container) container.innerHTML = '<div id="yt-player-element"></div>';

      player = new (window as any).YT.Player("yt-player-element", {
        height: "100%",
        width: "100%",
        videoId: video.id,
        playerVars: {
          autoplay: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onStateChange: (event: any) => {
            if (event.data === (window as any).YT.PlayerState.ENDED) {
              if (onEnded) onEnded();
            }
          },
        },
      });
    };

    if (!(window as any).YT || !(window as any).YT.Player) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      (window as any).onYouTubeIframeAPIReady = createPlayer;
    } else {
      createPlayer();
    }

    return () => {
      if (player && player.destroy) {
        try {
          player.destroy();
        } catch (e) {}
      }
    };
  }, [video.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await UpdateYouTubeVideoMetadata(
        video.id,
        editableTitle,
        editableDescription,
        editablePrivacy,
      );
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error updating video metadata:", error);
      alert("Failed to update video metadata");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    try {
      await AddVideoToPlaylist(playlistId, video.id);
      setShowPlaylistPicker(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newPlaylistTitle.trim()) return;
    try {
      const id = await CreatePlaylist(newPlaylistTitle, "", editablePrivacy);
      await AddVideoToPlaylist(id, video.id);
      setNewPlaylistTitle("");
      setIsCreatingPlaylist(false);
      setShowPlaylistPicker(false);
      refreshPlaylists();
    } catch (e) {
      console.error(e);
    }
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className={`flex-1 flex overflow-hidden bg-base ${isWide ? "flex-row" : "flex-col"}`}>
      {/* Player Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center group min-w-0">
        <div id="yt-player-container" className="w-full h-full" />

        {/* Navigation Overlays */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Info Panel */}
      <div className={`bg-surface border-border-subtle p-6 overflow-y-auto custom-scrollbar shrink-0 ${isWide ? "border-l w-[450px] h-full" : "border-t flex-1 max-h-[40%]"}`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            {isEditing ? (
              <input
                type="text"
                className="flex-1 bg-elevated border border-border-subtle rounded-md px-3 py-2 text-lg font-bold text-text-primary outline-none focus:border-accent"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
              />
            ) : (
              <h1 className="text-xl font-bold text-text-primary leading-tight">
                {editableTitle}
              </h1>
            )}

            <div className="flex items-center gap-3">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn btn-accent px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                    )}
                    SAVE
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="btn btn-elevated px-4 py-2 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary"
                  >
                    CANCEL
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  title="Edit video details"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary mb-6 pb-6 border-b border-border-subtle">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-text-primary">
                {formatNumber(video.viewCount)}
              </span>
              <span className="text-text-muted text-xs">views</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-text-primary">
                {formatNumber(video.likeCount)}
              </span>
              <span className="text-text-muted text-xs">likes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-text-muted text-xs">
                {formatDate(video.publishedAt)}
              </span>
            </div>
            {isEditing ? (
              <select
                className="bg-elevated border border-border-subtle rounded px-2 py-1 text-xs font-bold text-accent outline-none focus:border-accent ml-auto"
                value={editablePrivacy}
                onChange={(e) => setEditablePrivacy(e.target.value)}
              >
                <option value="public">PUBLIC</option>
                <option value="unlisted">UNLISTED</option>
                <option value="private">PRIVATE</option>
              </select>
            ) : (
              <span
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ml-auto ${
                  editablePrivacy === "public"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : editablePrivacy === "unlisted"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}
              >
                {editablePrivacy}
              </span>
            )}

            {video.playlistTitle && !showPlaylistPicker && (
              <div className="flex items-center gap-1.5 bg-text-muted/10 text-text-muted text-[10px] font-bold py-1 px-3 rounded border border-border-subtle ml-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
                  <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                </svg>
                <span className="truncate max-w-[150px]">{video.playlistTitle}</span>
              </div>
            )}
            
            <div className="relative">
              <button
                onClick={() => setShowPlaylistPicker(!showPlaylistPicker)}
                className="p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-2"
                title="Add to playlist"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
                <span className="text-[10px] font-bold">ADD TO PLAYLIST</span>
              </button>
              
              {showPlaylistPicker && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border-medium rounded-lg shadow-xl z-50 overflow-hidden animate-fadeIn">
                  <div className="p-3 border-b border-border-subtle bg-surface/50 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-text-secondary uppercase">
                      {isCreatingPlaylist ? "Create Playlist" : "Select Playlist"}
                    </span>
                    <button 
                      className="text-[10px] font-bold text-accent hover:underline bg-transparent border-none cursor-pointer"
                      onClick={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
                    >
                      {isCreatingPlaylist ? "CANCEL" : "+ NEW"}
                    </button>
                  </div>
                  
                  {isCreatingPlaylist ? (
                    <div className="p-3 flex flex-col gap-2">
                      <input
                        className="w-full bg-elevated border border-accent rounded-sm px-3 py-2 text-xs text-text-primary outline-none focus:bg-card"
                        type="text"
                        value={newPlaylistTitle}
                        onChange={(e) => setNewPlaylistTitle(e.target.value)}
                        placeholder="New playlist title..."
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
                      />
                      <button 
                        className="btn btn-primary btn-sm w-full"
                        onClick={handleCreateAndAdd}
                        disabled={!newPlaylistTitle.trim()}
                      >
                        CREATE & ADD
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="p-2 border-b border-border-subtle bg-base/30">
                        <div className="relative">
                          <input
                            className="w-full bg-elevated border border-border-subtle rounded-sm pl-8 pr-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent transition-colors"
                            type="text"
                            placeholder="Search playlists..."
                            value={playlistSearch}
                            onChange={(e) => setPlaylistSearch(e.target.value)}
                            autoFocus
                          />
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {playlists
                          .filter((p) =>
                            p.title.toLowerCase().includes(playlistSearch.toLowerCase())
                          )
                          .length === 0 ? (
                          <div className="p-4 text-center text-xs text-text-muted">No playlists found</div>
                        ) : (
                          playlists
                            .filter((p) =>
                              p.title.toLowerCase().includes(playlistSearch.toLowerCase())
                            )
                            .map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleAddToPlaylist(p.id)}
                                className="w-full text-left p-3 hover:bg-accent/10 transition-colors flex items-center justify-between group"
                              >
                                <div className="flex items-center justify-between w-full min-w-0 gap-3">
                                  <span className="text-xs font-bold text-text-primary truncate flex-1">{p.title}</span>
                                  <span className="text-[10px] text-text-muted whitespace-nowrap">{p.videoCount} videos</span>
                                </div>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                                </svg>
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isEditing ? (
            <textarea
              className="w-full h-40 bg-elevated border border-border-subtle rounded-md px-3 py-2 text-sm text-text-secondary outline-none focus:border-accent custom-scrollbar"
              value={editableDescription}
              onChange={(e) => setEditableDescription(e.target.value)}
              placeholder="Enter video description..."
            />
          ) : (
            <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {editableDescription || "No description available."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
