import { useState, useEffect } from "react";
import { YTVideo, YTPlaylist } from "../../types";
import { 
  UpdateYouTubeVideoMetadata, 
  GetChannelPlaylists, 
  AddVideoToPlaylist,
  GetOrCreatePlaylist
} from "../../../wailsjs/go/backend/App";

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
  const [isCreatingPlaylistLoading, setIsCreatingPlaylistLoading] = useState(false);
  const [playlistCreateError, setPlaylistCreateError] = useState("");

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
    setIsCreatingPlaylistLoading(true);
    setPlaylistCreateError("");
    try {
      const id = await GetOrCreatePlaylist(newPlaylistTitle.trim(), "", editablePrivacy);
      await AddVideoToPlaylist(id, video.id);
      setNewPlaylistTitle("");
      setIsCreatingPlaylist(false);
      setShowPlaylistPicker(false);
      refreshPlaylists();
    } catch (e: any) {
      setPlaylistCreateError(e?.toString() ?? "Failed");
    } finally {
      setIsCreatingPlaylistLoading(false);
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
    <div className={`flex-1 flex overflow-hidden bg-[#0f0f0f] ${isWide ? "flex-row" : "flex-col"}`}>
      {/* Player Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center group min-w-0">
        <div id="yt-player-container" className="w-full h-full" />

        {/* Navigation Overlays */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-black/90 hover:scale-110"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-black/90 hover:scale-110"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Info Panel */}
      <div className={`bg-[#0f0f0f] border-white/10 overflow-y-auto custom-scrollbar shrink-0 text-white ${isWide ? "border-l w-[420px] h-full p-6" : "border-t max-h-[280px] p-4"}`}>
        <div className={`max-w-4xl mx-auto flex flex-col ${isWide ? "gap-6" : "gap-3"}`}>
          <div className="flex items-start justify-between gap-4">
            {isEditing ? (
              <input
                type="text"
                className="flex-1 bg-[#272727] border border-transparent rounded-lg px-4 py-3 text-lg font-bold text-white outline-none focus:border-[#3ea6ff]"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
              />
            ) : (
              <h1 className="text-xl font-bold text-white leading-tight">
                {editableTitle}
              </h1>
            )}

            <div className="flex items-center gap-3 shrink-0 mt-1">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-full bg-[#3ea6ff] hover:bg-[#65b8ff] text-black text-sm font-bold flex items-center gap-2 transition-colors"
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                    )}
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-full bg-transparent hover:bg-white/10 text-white/90 text-sm font-bold transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2.5 rounded-full bg-transparent hover:bg-white/10 text-white/90 transition-colors"
                  title="Edit video details"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className={`flex flex-wrap items-center gap-4 text-sm text-white/60 border-b border-white/10 ${isWide ? "pb-5" : "pb-3"}`}>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white/90">
                {formatNumber(video.viewCount)}
              </span>
              <span className="text-white/50 text-xs">views</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white/90">
                {formatNumber(video.likeCount)}
              </span>
              <span className="text-white/50 text-xs">likes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/50 text-xs">
                {formatDate(video.publishedAt)}
              </span>
            </div>
            {isEditing ? (
              <select
                className="bg-[#272727] border border-transparent rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-[#3ea6ff] ml-auto cursor-pointer"
                value={editablePrivacy}
                onChange={(e) => setEditablePrivacy(e.target.value)}
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            ) : (
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ml-auto ${
                  editablePrivacy === "public"
                    ? "bg-green-500 text-white"
                    : editablePrivacy === "unlisted"
                      ? "bg-[#272727] text-white/90"
                      : "bg-red-500 text-white"
                }`}
              >
                {editablePrivacy.charAt(0).toUpperCase() + editablePrivacy.slice(1)}
              </span>
            )}

            {video.playlistTitle && !showPlaylistPicker && (
              <div className="flex items-center gap-1.5 bg-[#3ea6ff]/10 text-[#3ea6ff] text-xs font-medium py-1 px-3 rounded-full ml-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                </svg>
                <span className="truncate max-w-[150px]">{video.playlistTitle}</span>
              </div>
            )}
            
            <div className="relative">
              <button
                onClick={() => setShowPlaylistPicker(!showPlaylistPicker)}
                className="px-3 py-1.5 rounded-full bg-transparent hover:bg-white/10 text-white/90 transition-colors flex items-center gap-2"
                title="Add to playlist"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
                <span className="text-xs font-bold">Add</span>
              </button>
              
              {showPlaylistPicker && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#272727] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-slideDown">
                  <div className="p-3 border-b border-white/10 bg-[#0f0f0f]/50 flex items-center justify-between">
                    <span className="text-xs font-medium text-white/90">
                      {isCreatingPlaylist ? "Create playlist" : "Select playlist"}
                    </span>
                    <button 
                      className="text-xs font-medium text-[#3ea6ff] hover:text-[#65b8ff] transition-colors bg-transparent border-none cursor-pointer"
                      onClick={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
                    >
                      {isCreatingPlaylist ? "Cancel" : "+ New"}
                    </button>
                  </div>
                  
                  {isCreatingPlaylist ? (
                    <div className="p-4 flex flex-col gap-3">
                      <input
                        className="w-full bg-[#0f0f0f] border border-transparent rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#3ea6ff]"
                        type="text"
                        value={newPlaylistTitle}
                        onChange={(e) => setNewPlaylistTitle(e.target.value)}
                        placeholder="Playlist name..."
                        autoFocus
                        disabled={isCreatingPlaylistLoading}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
                      />
                      <span className="text-[10px] text-white/50">Existing playlist with same name will be reused.</span>
                      {playlistCreateError && (
                        <span className="text-[10px] text-red-400">{playlistCreateError}</span>
                      )}
                      <button 
                        className="w-full py-2.5 rounded-full bg-white text-black hover:bg-gray-200 text-sm font-medium transition-colors"
                        onClick={handleCreateAndAdd}
                        disabled={!newPlaylistTitle.trim() || isCreatingPlaylistLoading}
                      >
                        {isCreatingPlaylistLoading ? (
                          <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mx-auto" />
                        ) : "Create & Add"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="p-2 border-b border-white/10">
                        <div className="relative">
                          <input
                            className="w-full bg-[#0f0f0f] border border-transparent rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-[#3ea6ff]"
                            type="text"
                            placeholder="Search playlists..."
                            value={playlistSearch}
                            onChange={(e) => setPlaylistSearch(e.target.value)}
                            autoFocus
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                          <div className="p-4 text-center text-sm text-white/50">No playlists found</div>
                        ) : (
                          playlists
                            .filter((p) =>
                              p.title.toLowerCase().includes(playlistSearch.toLowerCase())
                            )
                            .map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleAddToPlaylist(p.id)}
                                className="w-full text-left p-3 hover:bg-white/10 transition-colors flex items-center justify-between group"
                              >
                                <div className="flex items-center justify-between w-full min-w-0 gap-3">
                                  <span className="text-sm font-medium text-white/90 truncate flex-1">{p.title}</span>
                                  <span className="text-xs text-white/50 whitespace-nowrap">{p.videoCount} videos</span>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#3ea6ff] opacity-0 group-hover:opacity-100 transition-opacity ml-2">
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
              className="w-full h-48 bg-[#272727] border border-transparent rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#3ea6ff] custom-scrollbar"
              value={editableDescription}
              onChange={(e) => setEditableDescription(e.target.value)}
              placeholder="Enter video description..."
            />
          ) : (
            <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
              {editableDescription || "No description available."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
