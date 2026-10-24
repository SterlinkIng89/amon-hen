import { useState, useEffect, useRef } from "react";
import {
  YTVideo,
  TagPlaylistConfig,
  GameProfile,
} from "../../types";
import {
  UpdateYouTubeVideoMetadata,
  UpdateYouTubeVideoGameMeta,
  SelectCustomThumbnailImage,
  UpdateYouTubeThumbnail,
  LoadConfig,
} from "../../../wailsjs/go/backend/App";
import { parseTagPlaylistConfigs } from "../../utils/tagConfigParser";
import { extractEpisodeFromTitle } from "../../utils/videoUtils";
import TagInput from "../ui/TagInput";
import TagPlaylistModal from "../ui/TagPlaylistModal";
import YouTubeThumbnailPicker from "./YouTubeThumbnailPicker";
import YouTubePlaylistPicker from "./YouTubePlaylistPicker";
import VideoStatusBadge from "./VideoStatusBadge";
import YouTubeTransportBar from "./YouTubeTransportBar";
import {
  resolvePlayerKeyAction,
  clampSeek,
  isTypingTarget,
  stepPlaybackSpeed,
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
  getPlaybackRate?(): number;
  setPlaybackRate?(suggestedRate: number): void;
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
const STORAGE_YT_PLAYBACK_RATE_KEY = "yt_player_playback_rate";

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

  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_YT_PLAYBACK_RATE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2) return parsed;
    }
    return 1;
  });
  const playbackRateRef = useRef(playbackRate);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  const applyPlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    localStorage.setItem(STORAGE_YT_PLAYBACK_RATE_KEY, String(rate));
    try {
      playerRef.current?.setPlaybackRate?.(rate);
    } catch {
      // Player iframe may not be ready
    }
  };

  const [editableTitle, setEditableTitle] = useState(video.title);
  const [editableDescription, setEditableDescription] = useState(
    video.description,
  );
  const [editablePrivacy, setEditablePrivacy] = useState(video.privacy);
  const [tagInput, setTagInput] = useState(video.gameTag || "");
  const [episodeInput, setEpisodeInput] = useState<number | string>(
    typeof video.episode === "number" && video.episode > 0
      ? video.episode
      : extractEpisodeFromTitle(video.title) || "",
  );
  const [gameProfiles, setGameProfiles] = useState<Record<string, GameProfile>>({});
  const [pendingTagForModal, setPendingTagForModal] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);

  useEffect(() => {
    setEditableTitle(video.title);
    setEditableDescription(video.description);
    setEditablePrivacy(video.privacy);
    setTagInput(video.gameTag || "");
    setEpisodeInput(
      typeof video.episode === "number" && video.episode > 0
        ? video.episode
        : extractEpisodeFromTitle(video.title) || "",
    );
  }, [video.id, video.title, video.description, video.privacy, video.gameTag, video.episode]);

  const currentEpisodeNum = episodeInput !== "" ? Number(episodeInput) : 0;
  const initialEpNum = typeof video.episode === "number" && video.episode > 0 ? video.episode : 0;
  const isDirty =
    editableTitle !== video.title ||
    editableDescription !== video.description ||
    editablePrivacy !== video.privacy ||
    tagInput !== (video.gameTag || "") ||
    currentEpisodeNum !== initialEpNum;

  const handleEpisodeChange = (val: string) => {
    const num = val === "" ? "" : parseInt(val, 10);
    if (val !== "" && isNaN(num as number)) return;
    setEpisodeInput(num);
    const currentEp = num !== "" ? Number(num) : 0;

    const epRe = /( [—\-] )(\d+)(?![\d/])(.*)?$/;
    if (editableTitle) {
      const m = editableTitle.match(epRe);
      if (m) {
        const customSuffix = m[3] ?? "";
        const separator = m[1];
        setEditableTitle(
          editableTitle.slice(0, m.index!) +
            (currentEp > 0
              ? `${separator}${currentEp}${customSuffix}`
              : customSuffix),
        );
        return;
      }
      if (currentEp > 0 && editableTitle.trim().length > 0) {
        setEditableTitle(`${editableTitle.trim()} — ${currentEp}`);
      }
    }
  };

  const handleStepEpisode = (delta: -1 | 1) => {
    const next = Math.max(1, currentEpisodeNum + delta);
    handleEpisodeChange(String(next));
  };

  const [tagPlaylistConfigs, setTagPlaylistConfigs] = useState<
    Record<string, TagPlaylistConfig>
  >({});
  const [isUploadingCustom, setIsUploadingCustom] = useState(false);
  const [uploadCustomError, setUploadCustomError] = useState("");

  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        if (cfg) {
          const raw = cfg.tag_playlist_configs || {};
          const legacy = cfg.tag_playlists || {};
          setTagPlaylistConfigs(parseTagPlaylistConfigs(raw, legacy));
          if (cfg.game_profiles) {
            setGameProfiles(cfg.game_profiles);
          }
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
          onReady: () => {
            try {
              if (playbackRateRef.current !== 1) {
                player?.setPlaybackRate?.(playbackRateRef.current);
              }
            } catch {
              // Ignore if not supported
            }
          },
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

      if (action.type === "speed") {
        e.preventDefault();
        const next = stepPlaybackSpeed(playbackRateRef.current, action.dir);
        const clamped = Math.min(2, Math.max(0.5, next));
        applyPlaybackRate(clamped);
        return;
      }

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
      await UpdateYouTubeVideoGameMeta(
        video.id,
        tagInput,
        currentEpisodeNum,
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

  const renderMetadataForm = () => (
    <>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
          <label htmlFor="yt-game-profile-select" className="text-sm font-medium text-white/90">
            Game Profile
          </label>
          <select
            id="yt-game-profile-select"
            aria-label="Game Profile"
            className="w-full bg-[#272727] border border-white/10 rounded-sm px-3 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] appearance-none cursor-pointer"
            value={
              Object.keys(gameProfiles).includes(tagInput)
                ? tagInput
                : ""
            }
            onChange={(e) => {
              const tag = e.target.value;
              setTagInput(tag);
            }}
            disabled={isSaving}
          >
            <option value="">Singleplayer</option>
            {Object.keys(gameProfiles).map((pTag) => (
              <option key={pTag} value={pTag}>
                {pTag}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
          <label className="text-sm font-medium text-white/90">
            Game Tag
          </label>
          <div
            className={`flex-1 ${Object.keys(gameProfiles).includes(tagInput) ? "opacity-50 pointer-events-none" : ""}`}
          >
            <TagInput
              value={tagInput}
              onChange={(val) => setTagInput(val)}
              onEnter={handleSave}
              disabled={Object.keys(gameProfiles).includes(tagInput)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 w-32 shrink-0">
          <label className="text-sm font-medium text-white/90">
            Episode #
          </label>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Decrease episode"
              disabled={currentEpisodeNum <= 1}
              onClick={() => handleStepEpisode(-1)}
              className="h-9 px-2.5 bg-[#272727] border border-r-0 border-white/10 rounded-l-sm text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center font-medium select-none"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              className="w-full min-w-0 h-9 bg-[#272727] border border-white/10 rounded-none px-1 text-sm text-white outline-none focus:border-[#3ea6ff] focus:z-10 text-center"
              value={episodeInput}
              onChange={(e) => handleEpisodeChange(e.target.value)}
              placeholder="—"
            />
            <button
              type="button"
              aria-label="Increase episode"
              onClick={() => handleStepEpisode(1)}
              className="h-9 px-2.5 bg-[#272727] border border-l-0 border-white/10 rounded-r-sm text-white hover:bg-white/10 transition-colors flex items-center justify-center font-medium select-none"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-white/60">YouTube Title</label>
          <span
            className={`text-xs tabular-nums transition-colors ${
              editableTitle.length >= 100
                ? "text-[#3ea6ff] font-medium"
                : "text-white/40"
            }`}
          >
            {editableTitle.length}/100
          </span>
        </div>
        <input
          type="text"
          className="w-full bg-[#272727] border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white outline-none focus:border-[#3ea6ff] transition-colors"
          value={editableTitle}
          onChange={(e) => {
            const val = e.target.value;
            setEditableTitle(val);
            const epMatch = extractEpisodeFromTitle(val);
            if (epMatch > 0) {
              setEpisodeInput(epMatch);
            }
          }}
          maxLength={100}
          placeholder="Video title..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Description</label>
        <textarea
          rows={2}
          className="w-full min-h-[68px] bg-[#272727] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] custom-scrollbar transition-colors resize-y"
          value={editableDescription}
          onChange={(e) => setEditableDescription(e.target.value)}
          placeholder="Enter video description..."
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-white/60">Privacy</label>
        <div className="flex gap-2">
          {(["public", "unlisted", "private"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`flex-1 py-2 rounded-sm text-sm font-medium transition-colors border ${
                editablePrivacy === p
                  ? "bg-card border-accent text-accent font-medium"
                  : "bg-elevated border-border-subtle text-text-primary hover:border-border-medium hover:bg-card"
              }`}
              onClick={() => setEditablePrivacy(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <YouTubePlaylistPicker
        videoId={video.id}
        playlistTitle={video.playlistTitle}
        defaultPrivacy={editablePrivacy}
        onPlaylistAdded={() => onUpdate?.()}
      />

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
          gameTag={tagInput}
          episodeNumber={currentEpisodeNum > 0 ? currentEpisodeNum : 1}
          tagThumbnailConfig={
            tagInput
              ? tagPlaylistConfigs[tagInput]?.thumbnail_config
              : undefined
          }
          onOpenTagSettings={() =>
            setPendingTagForModal(tagInput || video.gameTag || "")
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
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
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

        <YouTubeTransportBar
          videoId={video.id}
          videoTitle={video.title}
          localFile={video.localFile}
          isWide={isWide}
          isInfoExpanded={isInfoExpanded}
          playbackRate={playbackRate}
          onPlaybackRateChange={applyPlaybackRate}
          onPrev={onPrev}
          onNext={onNext}
          onToggleInfoExpanded={() => setIsInfoExpanded(!isInfoExpanded)}
        />
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
      {pendingTagForModal !== null && (
        <TagPlaylistModal
          tag={pendingTagForModal}
          onClose={() => setPendingTagForModal(null)}
          onSaved={() => {
            setPendingTagForModal(null);
            LoadConfig()
              .then((cfg) => {
                if (cfg) {
                  const raw = cfg.tag_playlist_configs || {};
                  const legacy = cfg.tag_playlists || {};
                  setTagPlaylistConfigs(parseTagPlaylistConfigs(raw, legacy));
                  if (cfg.game_profiles) {
                    setGameProfiles(cfg.game_profiles);
                  }
                }
              })
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
