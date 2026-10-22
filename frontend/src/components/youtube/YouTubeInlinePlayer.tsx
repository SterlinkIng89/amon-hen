import { useState, useEffect, useRef } from "react";
import { YTVideo, YTPlaylist, TagPlaylistConfig } from "../../types";
import {
  UpdateYouTubeVideoMetadata,
  GetChannelPlaylists,
  AddVideoToPlaylist,
  GetOrCreatePlaylist,
  SelectCustomThumbnailImage,
  UpdateYouTubeThumbnail,
  LoadConfig,
} from "../../../wailsjs/go/backend/App";
import { parseTagPlaylistConfigs } from "../../utils/tagConfigParser";
import YouTubeThumbnailPicker from "./YouTubeThumbnailPicker";
import VideoStatusBadge from "./VideoStatusBadge";
import {
  resolvePlayerKeyAction,
  clampSeek,
  isTypingTarget,
} from "../../utils/playerKeys";

interface YTPlayerLike {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}

interface YouTubeInlinePlayerProps {
  video: YTVideo;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onUpdate?: () => void;
  onEnded?: () => void;
  onRequestDelete?: (video: YTVideo) => void;
}

const STORAGE_YT_INFO_EXPANDED_KEY = "yt_player_info_expanded";

export default function YouTubeInlinePlayer({
  video,
  onPrev,
  onNext,
  onUpdate,
  onEnded,
  onRequestDelete,
}: YouTubeInlinePlayerProps) {
  const formatNumber = (num: number) => {
    if (!num) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatDate = (isoDate: string) => {
    if (!isoDate) return "";
    return new Date(isoDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const playerRef = useRef<YTPlayerLike | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isWide = windowWidth >= 1280;

  const [isInfoExpanded, setIsInfoExpanded] = useState<boolean>(
    () => localStorage.getItem(STORAGE_YT_INFO_EXPANDED_KEY) !== "false",
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_YT_INFO_EXPANDED_KEY, String(isInfoExpanded));
  }, [isInfoExpanded]);

  const [editableTitle, setEditableTitle] = useState(video.title);
  const [editableDescription, setEditableDescription] = useState(
    video.description,
  );
  const [editablePrivacy, setEditablePrivacy] = useState(video.privacy);
  const [isSaving, setIsSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);

  useEffect(() => {
    setEditableTitle(video.title);
    setEditableDescription(video.description);
    setEditablePrivacy(video.privacy);
  }, [video.id, video.title, video.description, video.privacy]);

  const isDirty =
    editableTitle !== video.title ||
    editableDescription !== video.description ||
    editablePrivacy !== video.privacy;

  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [isCreatingPlaylistLoading, setIsCreatingPlaylistLoading] =
    useState(false);
  const [playlistCreateError, setPlaylistCreateError] = useState("");

  const [tagPlaylistConfigs, setTagPlaylistConfigs] = useState<
    Record<string, TagPlaylistConfig>
  >({});
  const [isUploadingCustom, setIsUploadingCustom] = useState(false);
  const [uploadCustomError, setUploadCustomError] = useState("");

  const refreshPlaylists = () => {
    GetChannelPlaylists("recent")
      .then(setPlaylists)
      .catch(() => {});
  };

  useEffect(() => {
    refreshPlaylists();
    LoadConfig()
      .then((cfg) => {
        if (cfg) {
          const raw = cfg.tag_playlist_configs || {};
          const legacy = cfg.tag_playlists || {};
          setTagPlaylistConfigs(parseTagPlaylistConfigs(raw, legacy));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let player: YTPlayerLike | null = null;

    const createPlayer = () => {
      if (!(window as any).YT || !(window as any).YT.Player) return;

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
          onStateChange: (event: { data: number }) => {
            if (event.data === (window as any).YT.PlayerState.ENDED) {
              if (onEnded) onEnded();
            }
          },
        },
      });
      playerRef.current = player;
    };

    if (!(window as any).YT || !(window as any).YT.Player) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head?.appendChild(tag);
      }
      (window as any).onYouTubeIframeAPIReady = createPlayer;
    } else {
      createPlayer();
    }

    return () => {
      playerRef.current = null;
      if (player && player.destroy) {
        try {
          player.destroy();
        } catch (e) {}
      }
    };
  }, [video.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) {
        return;
      }

      const action = resolvePlayerKeyAction(e);
      if (!action) return;

      const p = playerRef.current;

      if (action.type === "seek") {
        if (!p) return;
        e.preventDefault();
        try {
          p.seekTo(clampSeek(p.getCurrentTime(), action.delta, p.getDuration()), true);
        } catch {
          // Player iframe may not be ready
        }
        return;
      }

      if (action.type === "nav") {
        if (action.dir === "prev" && onPrev) {
          e.preventDefault();
          onPrev();
        } else if (action.dir === "next" && onNext) {
          e.preventDefault();
          onNext();
        }
        return;
      }

      if (action.type === "toggle-play") {
        if (!p) return;
        e.preventDefault();
        try {
          if (p.getPlayerState() === 1) {
            p.pauseVideo();
          } else {
            p.playVideo();
          }
        } catch {
          // Player iframe may not be ready
        }
        return;
      }

      if (action.type === "toggle-mute") {
        if (!p) return;
        e.preventDefault();
        try {
          if (p.isMuted()) {
            p.unMute();
          } else {
            p.mute();
          }
        } catch {
          // Player iframe may not be ready
        }
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onPrev, onNext]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await UpdateYouTubeVideoMetadata(
        video.id,
        editableTitle,
        editableDescription,
        editablePrivacy,
      );
      setInfoSaved(true);
      setTimeout(() => setInfoSaved(false), 3000);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error updating video metadata:", error);
      alert("Failed to update video metadata");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadCustomImage = async () => {
    setUploadCustomError("");
    try {
      const selected = await SelectCustomThumbnailImage();
      if (!selected) return;

      setIsUploadingCustom(true);
      await UpdateYouTubeThumbnail(video.id, selected);
      if (onUpdate) onUpdate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadCustomError(msg);
    } finally {
      setIsUploadingCustom(false);
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
      const id = await GetOrCreatePlaylist(
        newPlaylistTitle.trim(),
        "",
        editablePrivacy,
      );
      await AddVideoToPlaylist(id, video.id);
      setNewPlaylistTitle("");
      setIsCreatingPlaylist(false);
      setShowPlaylistPicker(false);
      refreshPlaylists();
    } catch (e: unknown) {
      setPlaylistCreateError(e instanceof Error ? e.message : String(e ?? "Failed"));
    } finally {
      setIsCreatingPlaylistLoading(false);
    }
  };

  const renderMetadataForm = () => (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Title</label>
        <input
          type="text"
          className="w-full bg-[#272727] border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white outline-none focus:border-[#3ea6ff] transition-colors"
          value={editableTitle}
          onChange={(e) => setEditableTitle(e.target.value)}
          placeholder="Video title..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Description</label>
        <textarea
          className="w-full h-36 bg-[#272727] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] custom-scrollbar transition-colors resize-y"
          value={editableDescription}
          onChange={(e) => setEditableDescription(e.target.value)}
          placeholder="Enter video description..."
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-white/60">Visibility:</label>
          <select
            className="bg-[#272727] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-[#3ea6ff] cursor-pointer"
            value={editablePrivacy}
            onChange={(e) => setEditablePrivacy(e.target.value)}
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPlaylistPicker(!showPlaylistPicker)}
            className="px-3 py-1.5 rounded-lg bg-[#272727] hover:bg-white/10 border border-white/10 text-white/90 transition-colors flex items-center gap-1.5 text-xs font-medium"
            title="Add to playlist"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 5L6 9H2V15H6L11 19V5Z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            <span>Add to Playlist</span>
          </button>

          {showPlaylistPicker && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-[#272727] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-white/10 bg-[#0f0f0f]/50 flex items-center justify-between">
                <span className="text-xs font-medium text-white/90">
                  {isCreatingPlaylist
                    ? "Create playlist"
                    : "Select playlist"}
                </span>
                <button
                  type="button"
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
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreateAndAdd()
                    }
                  />
                  <span className="text-[10px] text-white/50">
                    Existing playlist with same name will be reused.
                  </span>
                  {playlistCreateError && (
                    <span className="text-[10px] text-red-400">
                      {playlistCreateError}
                    </span>
                  )}
                  <button
                    type="button"
                    className="w-full py-2 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-medium transition-colors"
                    onClick={handleCreateAndAdd}
                    disabled={
                      !newPlaylistTitle.trim() || isCreatingPlaylistLoading
                    }
                  >
                    {isCreatingPlaylistLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin mx-auto" />
                    ) : (
                      "Create & Add"
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="p-2 border-b border-white/10">
                    <div className="relative">
                      <input
                        className="w-full bg-[#0f0f0f] border border-transparent rounded-lg pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-[#3ea6ff]"
                        type="text"
                        placeholder="Search playlists..."
                        value={playlistSearch}
                        onChange={(e) => setPlaylistSearch(e.target.value)}
                        autoFocus
                      />
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto custom-scrollbar">
                    {playlists.filter((p) =>
                      p.title
                        .toLowerCase()
                        .includes(playlistSearch.toLowerCase()),
                    ).length === 0 ? (
                      <div className="p-4 text-center text-xs text-white/50">
                        No playlists found
                      </div>
                    ) : (
                      playlists
                        .filter((p) =>
                          p.title
                            .toLowerCase()
                            .includes(playlistSearch.toLowerCase()),
                        )
                        .map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => handleAddToPlaylist(p.id)}
                            className="w-full text-left p-2.5 hover:bg-white/10 transition-colors flex items-center justify-between group"
                          >
                            <div className="flex items-center justify-between w-full min-w-0 gap-2">
                              <span className="text-xs font-medium text-white/90 truncate flex-1">
                                {p.title}
                              </span>
                              <span className="text-[10px] text-white/50 whitespace-nowrap">
                                {p.videoCount} videos
                              </span>
                            </div>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-[#3ea6ff] opacity-0 group-hover:opacity-100 transition-opacity ml-1.5"
                            >
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

      {video.playlistTitle && (
        <div className="flex items-center gap-1.5 bg-[#3ea6ff]/10 text-[#3ea6ff] text-xs font-medium py-1 px-3 rounded-full self-start">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
          <span className="truncate max-w-[200px]">{video.playlistTitle}</span>
        </div>
      )}

      {/* Thumbnail Management */}
      <div className="flex flex-col gap-3 p-3 rounded-lg bg-[#141416] border border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/90">
            Thumbnail Management
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-xs text-xs px-2.5 py-1"
              onClick={handleUploadCustomImage}
              disabled={isUploadingCustom}
            >
              {isUploadingCustom ? "Uploading..." : "Upload Image File..."}
            </button>
          </div>
        </div>

        {uploadCustomError && (
          <p role="alert" className="text-xs text-red-400">
            {uploadCustomError}
          </p>
        )}

        <YouTubeThumbnailPicker
          videoPath={video.localFile || `yt:${video.id}`}
          gameTag={video.gameTag || ""}
          episodeNumber={video.episode || 1}
          tagThumbnailConfig={
            video.gameTag
              ? tagPlaylistConfigs[video.gameTag]?.thumbnail_config
              : undefined
          }
          youtubeId={video.id}
          onYouTubeUpdated={() => onUpdate?.()}
        />
      </div>
    </>
  );

  return (
    <div
      className={`flex-1 flex overflow-hidden bg-[#0f0f0f] ${isWide ? "flex-row" : "flex-col"}`}
    >
      {/* Player Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center group min-w-0">
        <div id="yt-player-container" className="w-full h-full" />

        {/* Navigation Overlays */}
        {onPrev && (
          <button
            type="button"
            onClick={onPrev}
            title="Previous (Shift+←)"
            aria-label="Previous (Shift+←)"
            className="absolute left-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-black/90 hover:scale-110"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            title="Next (Shift+→)"
            aria-label="Next (Shift+→)"
            className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-black/90 hover:scale-110"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Info & Inspector Panel */}
      {isWide ? (
        <div
          className={`bg-[#0f0f0f] border-l border-white/10 shrink-0 transition-all duration-300 flex flex-col ${
            isInfoExpanded
              ? "w-[380px] xl:w-[420px] 2xl:w-[480px] h-full"
              : "w-14 items-center py-4 gap-4"
          }`}
        >
          {isInfoExpanded ? (
            <div className="flex flex-col h-full w-full p-5 gap-5 animate-in fade-in duration-300 text-white overflow-hidden">
              {/* Sticky Header */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                  <button
                    type="button"
                    className="p-1.5 -ml-1 rounded-full hover:bg-white/10 text-white/90 transition-colors shrink-0"
                    onClick={() => setIsInfoExpanded(false)}
                    title="Hide Details"
                    aria-label="Hide Details"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="rotate-90"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <div className="flex items-center gap-2 text-xs text-white/60 truncate">
                    <span className="font-bold text-white/90">
                      {formatNumber(video.viewCount)}
                    </span>
                    <span>views</span>
                    <span className="text-white/40">•</span>
                    <span className="font-bold text-white/90">
                      {formatNumber(video.likeCount)}
                    </span>
                    <span>likes</span>
                    <span className="text-white/40">•</span>
                    <span className="truncate">{formatDate(video.publishedAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <VideoStatusBadge
                    monetizationStatus={video.monetizationStatus}
                    rejectionReason={video.rejectionReason}
                    statusIssues={video.statusIssues}
                  />
                </div>
              </div>

              {/* Scrollable Middle Content */}
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
                {renderMetadataForm()}
              </div>

              {/* Sticky Footer */}
              <div className="flex flex-col items-stretch gap-2.5 shrink-0 pt-3 border-t border-white/10">
                {onRequestDelete && (
                  <button
                    type="button"
                    onClick={() => onRequestDelete(video)}
                    className="w-full py-2 rounded-full text-xs font-medium transition-colors bg-transparent border border-white/20 text-red-400 hover:bg-red-500/10"
                    title="Delete video from YouTube"
                  >
                    Delete Video
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <a
                    href={`https://youtu.be/${video.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 rounded-full bg-transparent border border-white/20 text-white/90 hover:bg-white/10 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shrink-0"
                    title="View on YouTube"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
                    </svg>
                    <span>View on YT</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || (!isDirty && !infoSaved)}
                    className={`flex-1 py-2 rounded-full text-xs font-bold transition-colors ${
                      infoSaved || isDirty
                        ? "bg-[#3ea6ff] text-black hover:bg-[#65b8ff]"
                        : "bg-[#272727] text-white/50 cursor-default"
                    }`}
                  >
                    {infoSaved ? "Saved!" : isSaving ? "Saving..." : "Save Info"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="p-3 rounded-full hover:bg-white/10 text-white/90 transition-colors group"
                onClick={() => setIsInfoExpanded(true)}
                title="Show Details"
                aria-label="Show Details"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="rotate-90 group-hover:scale-110 transition-transform"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <VideoStatusBadge
                monetizationStatus={video.monetizationStatus}
                rejectionReason={video.rejectionReason}
                statusIssues={video.statusIssues}
                compact
              />
            </>
          )}
        </div>
      ) : (
        <div className="bg-[#0f0f0f] border-t border-white/10 p-4 overflow-y-auto max-h-[42vh] shrink-0 flex flex-col gap-4 text-white custom-scrollbar">
          {/* Header with stats and status badge */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-xs text-white/60 flex-wrap">
              <span className="font-bold text-white/90">
                {formatNumber(video.viewCount)}
              </span>
              <span>views</span>
              <span className="text-white/40">•</span>
              <span className="font-bold text-white/90">
                {formatNumber(video.likeCount)}
              </span>
              <span>likes</span>
              <span className="text-white/40">•</span>
              <span>{formatDate(video.publishedAt)}</span>
            </div>
            <VideoStatusBadge
              monetizationStatus={video.monetizationStatus}
              rejectionReason={video.rejectionReason}
              statusIssues={video.statusIssues}
            />
          </div>

          {renderMetadataForm()}

          {/* Actions footer */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
            {onRequestDelete && (
              <button
                type="button"
                onClick={() => onRequestDelete(video)}
                className="px-4 py-2 rounded-full text-xs font-medium transition-colors bg-transparent border border-white/20 text-red-400 hover:bg-red-500/10"
                title="Delete video from YouTube"
              >
                Delete Video
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <a
                href={`https://youtu.be/${video.id}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-full bg-transparent border border-white/20 text-white/90 hover:bg-white/10 text-xs font-medium transition-colors flex items-center gap-1.5"
                title="View on YouTube"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
                </svg>
                <span>View on YT</span>
              </a>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || (!isDirty && !infoSaved)}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-colors ${
                  infoSaved || isDirty
                    ? "bg-[#3ea6ff] text-black hover:bg-[#65b8ff]"
                    : "bg-[#272727] text-white/50 cursor-default"
                }`}
              >
                {infoSaved ? "Saved!" : isSaving ? "Saving..." : "Save Info"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
