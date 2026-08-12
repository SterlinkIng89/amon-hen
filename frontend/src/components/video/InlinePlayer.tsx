import React, { useEffect, useRef, useState } from "react";
import { VideoFile, YTPlaylist } from "../../types";
import { formatSize, formatDuration, generateYouTubeTitle, extractCustomVars, extractOrderedInputVars } from "../../utils/videoUtils";
import { UploadToYouTube, SaveVideoMetadata, DeleteFiles, GetChannelPlaylists, GetOrCreatePlaylist, RegenerateThumbnail, UpdateYouTubeVideoMetadata, LoadConfig, LogFrontendEvent } from "../../../wailsjs/go/backend/App";
import { QueueItem } from "../youtube/UploadQueue";
import { useRecentTags } from "../../hooks/useRecentTags";
import { useRecentFieldValues } from "../../hooks/useRecentFieldValues";
import TagInput from "../ui/TagInput";
import TagPlaylistModal from "../ui/TagPlaylistModal";
import FieldInput from "../ui/FieldInput";

interface InlinePlayerProps {
  video: VideoFile;
  streamPort: number;
  selectedPaths?: string[];
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onAddToQueue: (item: QueueItem) => void;
  onTagSaved?: () => void;
  onDelete?: () => void;
}

export default function InlinePlayer({ video, streamPort, selectedPaths = [], onPrev, onNext, onAddToQueue, onTagSaved, onDelete }: InlinePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = `http://127.0.0.1:${streamPort}/stream?path=${encodeURIComponent(video.path)}`;

  const STORAGE_VOLUME_KEY = "player_volume";
  const STORAGE_MUTED_KEY  = "player_muted";
  const STORAGE_AUTOPLAY_KEY = "player_autoplay";
  const STORAGE_AUTOREPEAT_KEY = "player_autorepeat";

  const [autoPlayEnabled, setAutoPlayEnabled] = useState(() => localStorage.getItem(STORAGE_AUTOPLAY_KEY) === "true");
  const [autoRepeatEnabled, setAutoRepeatEnabled] = useState(() => localStorage.getItem(STORAGE_AUTOREPEAT_KEY) === "true");

  useEffect(() => {
    localStorage.setItem(STORAGE_AUTOPLAY_KEY, String(autoPlayEnabled));
  }, [autoPlayEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_AUTOREPEAT_KEY, String(autoRepeatEnabled));
  }, [autoRepeatEnabled]);

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

  // Handle true fullscreen — save window geometry before entering and restore on exit.
  // WindowUnfullscreen() alone doesn't restore position/size in Wails v2, so we
  // capture them first and call WindowSetSize + WindowSetPosition on exit.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Snapshot of window state captured just before entering fullscreen.
    let savedX = 0;
    let savedY = 0;
    let savedW = 0;
    let savedH = 0;

    const onFSChange = async () => {
      const rt = (window as any).runtime;
      if (!rt) return;

      if (document.fullscreenElement === el) {
        // --- Entering fullscreen ---
        // Save current position and size so we can restore them on exit.
        try {
          const pos = await rt.WindowGetPosition();
          const size = await rt.WindowGetSize();
          savedX = pos?.x ?? 0;
          savedY = pos?.y ?? 0;
          savedW = size?.w ?? 0;
          savedH = size?.h ?? 0;
        } catch (_) {
          // If the runtime calls fail, we'll just skip restoration.
        }
        LogFrontendEvent(`Video player entering fullscreen. Original window: ${savedW}x${savedH} at ${savedX},${savedY}`);
        rt.WindowFullscreen();
      } else {
        // --- Exiting fullscreen ---
        LogFrontendEvent("Video player exiting fullscreen, restoring window size");
        rt.WindowUnfullscreen();
        // Restore the window to its pre-fullscreen geometry.
        if (savedW > 0 && savedH > 0) {
          // Small delay to let Wails finish unfullscreening before resizing.
          setTimeout(() => {
            rt.WindowSetSize(savedW, savedH);
            rt.WindowSetPosition(savedX, savedY);
          }, 80);
        }
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

  const handleVideoEnded = () => {
    // If auto-repeat is enabled, the `loop` attribute handles looping.
    // If auto-repeat is disabled and auto-play is enabled, go to the next video.
    if (!autoRepeatEnabled && autoPlayEnabled && onNext) {
      onNext();
    }
  };

  // Info panel state
  const [ytTitle, setYtTitle] = useState(video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode, undefined, video.event, video.gameMode, video.customVars));
  const [tagInput, setTagInput] = useState(video.game || "");
  const [episodeInput, setEpisodeInput] = useState<number | "">(video.episode || "");
  const [eventInput, setEventInput] = useState(video.event || "");
  const [gameModeInput, setGameModeInput] = useState(video.gameMode || "");
  const [customVarsInput, setCustomVarsInput] = useState<Record<string, string>>(video.customVars || {});
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
  const [gameProfiles, setGameProfiles] = useState<Record<string, any>>({});
  const [tagPlaylists, setTagPlaylists] = useState<Record<string, string>>({});
  const [pendingTagForModal, setPendingTagForModal] = useState<string | null>(null);

  useEffect(() => {
    LoadConfig().then(cfg => {
      setGameProfiles(cfg.game_profiles || {});
      setTagPlaylists(cfg.tag_playlists || {});
    }).catch(() => {});
  }, []);

  const activeProfile = gameProfiles[tagInput];

  // Sync form state whenever the video prop itself changes (e.g. after a rescan or
  // when the user navigates to a different video with arrow keys).
  // Without this, ytTitle/tagInput etc. would stay stale from the previous mount.
  useEffect(() => {
    const profile = gameProfiles[video.game || ""];
    if (profile?.type === "multiplayer") {
      setYtTitle(generateYouTubeTitle(video.name, video.game, video.episode, profile, video.event, video.gameMode, video.customVars));
    } else {
      setYtTitle(video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode, profile, video.event, video.gameMode, video.customVars));
    }
    setTagInput(video.game || "");
    setEpisodeInput(video.episode || "");
    setEventInput(video.event || "");
    setGameModeInput(video.gameMode || "");
    setDescription(video.description || "");
    setPrivacy((video.privacy as "public" | "unlisted" | "private") || "unlisted");
    setPlaylistId(video.playlistId || "");
    setPlaylistSearch(video.playlistTitle || "");
  }, [video.path, video.youtubeTitle, video.game, video.description, video.privacy, video.playlistId, video.episode, video.event, video.gameMode, gameProfiles]);

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
  const { getRecentValues, addRecentValue } = useRecentFieldValues();

  // --- Auto-save on navigation ---
  // formSnapshotRef is updated inline on EVERY render. When video.path changes
  // the component re-renders with old state (not yet reset), so the snapshot
  // still holds the previous video's form values at the time the effect cleanup runs.
  const formSnapshotRef = useRef({ tagInput, ytTitle, episodeInput, eventInput, gameModeInput, customVarsInput, description, privacy, playlistId });
  formSnapshotRef.current = { tagInput, ytTitle, episodeInput, eventInput, gameModeInput, customVarsInput, description, privacy, playlistId };

  // Tracks the path this snapshot belongs to. Effect body runs AFTER cleanup,
  // so cleanup always reads the OLD path.
  const autoSavePathRef = useRef(video.path);
  useEffect(() => {
    autoSavePathRef.current = video.path;
    return () => {
      const path = autoSavePathRef.current;
      const s = formSnapshotRef.current;
      let ep = s.episodeInput !== "" ? Number(s.episodeInput) : 0;
      if (!ep && !(gameProfiles[s.tagInput]?.type === "multiplayer")) {
        const m = s.ytTitle.match(/ [—\-] (\d+)$/);
        if (m) ep = parseInt(m[1], 10);
      }
      SaveVideoMetadata(path, s.tagInput, s.ytTitle, s.description, s.privacy, s.playlistId, ep, s.eventInput, s.gameModeInput, s.customVarsInput)
        .then(() => onTagSaved?.())
        .catch(console.error);
    };
  }, [video.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when video changes
  useEffect(() => {
    const profile = gameProfiles[video.game || ""];
    if (profile?.type === "multiplayer") {
      setYtTitle(generateYouTubeTitle(video.name, video.game, video.episode, profile, video.event, video.gameMode, video.customVars));
    } else {
      setYtTitle(video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode, profile, video.event, video.gameMode, video.customVars));
    }
    setTagInput(video.game || "");
    setEpisodeInput(video.episode || "");
    setEventInput(video.event || "");
    setGameModeInput(video.gameMode || "");
    setCustomVarsInput(video.customVars || {});
    setDescription(video.description || "");
    setPrivacy((video.privacy as "public" | "unlisted" | "private") || "unlisted");
    setPlaylistId(video.playlistId || "");
    setPlaylistSearch(video.playlistTitle || ""); 
    setInfoSaved(false);
    setConfirmDelete(false);
    setDeleting(false);
  }, [video.path, video.game, video.name, video.youtubeTitle, video.description, video.privacy, video.playlistId, video.episode, video.event, video.gameMode, gameProfiles]);

  // Auto-update YT title when tag changes (if they haven't manually saved a different title yet)
  const handleTagChange = (val: string) => {
    const currentEp = episodeInput !== "" ? Number(episodeInput) : video.episode;
    const oldGenerated = generateYouTubeTitle(video.name, tagInput, currentEp, gameProfiles[tagInput], eventInput, gameModeInput, customVarsInput);
    setTagInput(val);
    
    if (ytTitle === oldGenerated || ytTitle === (video.youtubeTitle || "") || !ytTitle) {
      setYtTitle(generateYouTubeTitle(video.name, val, currentEp, gameProfiles[val], eventInput, gameModeInput, customVarsInput));
    }
  };

  // Auto-update YT title when episode number changes.
  // Instead of regenerating the full title (which would wipe any custom suffix
  // the user added after the episode number, e.g. "— Campaign End"), we
  // surgically replace only the "— N" part inside the current title.
  const handleEpisodeChange = (val: string) => {
    const num = val === "" ? "" : parseInt(val, 10);
    if (val !== "" && isNaN(num as number)) return; // ignore non-numeric input
    setEpisodeInput(num);
    const currentEp = num !== "" ? Number(num) : 0;

    // Episode suffix pattern: " — <digits>" or " - <digits>" NOT followed by a date
    // separator (/ or -), to avoid confusing the date segment "— 28/07/26" with an episode.
    // We look for " — N" where N is pure digits and is NOT followed by "/" (date separator).
    const epRe = /( [—\-] )(\d+)(?![\d/])(.*)?$/;

    if (ytTitle) {
      const m = ytTitle.match(epRe);
      if (m) {
        // Title already has an episode number — replace it, keep anything after it.
        const customSuffix = m[3] ?? "";
        const separator = m[1];
        setYtTitle(
          ytTitle.slice(0, m.index!) +
          (currentEp > 0 ? `${separator}${currentEp}${customSuffix}` : customSuffix)
        );
        return;
      }
    }

    // No episode number in the current title yet — fall back to full regeneration
    // only if the title is still the auto-generated one (user hasn't customised it).
    const oldGenerated = generateYouTubeTitle(video.name, tagInput, video.episode, activeProfile, eventInput, gameModeInput, customVarsInput);
    if (ytTitle === oldGenerated || ytTitle === (video.youtubeTitle || "") || !ytTitle) {
      setYtTitle(generateYouTubeTitle(video.name, tagInput, currentEp, activeProfile, eventInput, gameModeInput, customVarsInput));
    }
  };

  const handleEventChange = (val: string) => {
    setEventInput(val);
    const currentEp = episodeInput !== "" ? Number(episodeInput) : video.episode;
    const oldGenerated = generateYouTubeTitle(video.name, tagInput, currentEp, activeProfile, eventInput, gameModeInput, customVarsInput);
    if (ytTitle === oldGenerated || ytTitle === (video.youtubeTitle || "") || !ytTitle) {
      setYtTitle(generateYouTubeTitle(video.name, tagInput, currentEp, activeProfile, val, gameModeInput, customVarsInput));
    }
  };

  const handleGameModeChange = (val: string) => {
    setGameModeInput(val);
    const currentEp = episodeInput !== "" ? Number(episodeInput) : video.episode;
    const oldGenerated = generateYouTubeTitle(video.name, tagInput, currentEp, activeProfile, eventInput, gameModeInput, customVarsInput);
    if (ytTitle === oldGenerated || ytTitle === (video.youtubeTitle || "") || !ytTitle) {
      setYtTitle(generateYouTubeTitle(video.name, tagInput, currentEp, activeProfile, eventInput, val, customVarsInput));
    }
  };

  const handleCustomVarChange = (key: string, val: string) => {
    const newVars = { ...customVarsInput, [key]: val };
    setCustomVarsInput(newVars);
    const currentEp = episodeInput !== "" ? Number(episodeInput) : video.episode;
    const oldGenerated = generateYouTubeTitle(video.name, tagInput, currentEp, activeProfile, eventInput, gameModeInput, customVarsInput);
    if (ytTitle === oldGenerated || ytTitle === (video.youtubeTitle || "") || !ytTitle) {
      setYtTitle(generateYouTubeTitle(video.name, tagInput, currentEp, activeProfile, eventInput, gameModeInput, newVars));
    }
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    setYtUpdateError(null);

    const tagChanged = tagInput !== (video.game || "");

    // If tag changed and it's not in our tag_playlists map, ask the user to link it first
    if (tagChanged && tagInput && tagPlaylists[tagInput] === undefined) {
      setSavingInfo(false);
      setPendingTagForModal(tagInput);
      return;
    }

    await performSaveInfo(tagChanged);
  };

  const performSaveInfo = async (tagChanged: boolean) => {
    // Resolve episode: prefer explicit Episode # field, then parse from title
    // text (supports the old workflow where users edit "— N" in the title),
    // then fall back to the original prop episode.
    let resolvedEpisode: number;
    if (episodeInput !== "") {
      resolvedEpisode = Number(episodeInput);
    } else {
      const epFromTitle = ytTitle.match(/ [—\-] (\d+)$/);
      resolvedEpisode = epFromTitle ? parseInt(epFromTitle[1], 10) : (video.episode || 0);
    }

    // When the tag changed, blank the persisted title so the backend scanner
    // re-enumerates this video with the correct episode number for the new tag
    // (same mechanism that SetVideoGames / BulkActionBar uses).
    const currentTitle = ytTitle; // capture before we clear it
    const titleToSave = tagChanged ? "" : ytTitle;
    if (tagChanged) {
      setYtTitle(""); // will be re-populated after the next rescan
    }
    
    setSavingInfo(true);
    try {
      // 1. Always save to local config / DB first
      const pathsToSave = selectedPaths.length > 1 && selectedPaths.includes(video.path) 
        ? selectedPaths 
        : [video.path];
      
      for (const p of pathsToSave) {
        await SaveVideoMetadata(p, tagInput, titleToSave, description, privacy, playlistId, resolvedEpisode, eventInput, gameModeInput, customVarsInput);
      }
      
      if (tagInput) addRecentTag(tagInput);

      // Reload config just in case to sync tagPlaylists
      const cfg = await LoadConfig();
      setTagPlaylists(cfg.tag_playlists || {});

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
    await SaveVideoMetadata(video.path, tagInput, ytTitle, description, privacy, playlistId, episodeInput !== "" ? Number(episodeInput) : (video.episode || 0), eventInput, gameModeInput, customVarsInput).catch(console.error);
    onTagSaved?.();

    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      size: video.size,
      title: ytTitle,
      description,
      privacy,
      status: "uploading",
      progress: 0,
      playlistId,
      gameTag: tagInput,
      episode: episodeInput !== "" ? Number(episodeInput) : video.episode,
    };
    onAddToQueue(item);
    UploadToYouTube(video.path, ytTitle, description, privacy, playlistId || "", tagInput, episodeInput !== "" ? Number(episodeInput) : (video.episode || 0)).catch(() => {});
    setTimeout(() => setUploading(false), 1000);
  };

  const handleAddToQueue = async () => {
    if (tagInput) addRecentTag(tagInput);
    
    // Save metadata to local database first
    await SaveVideoMetadata(video.path, tagInput, ytTitle, description, privacy, playlistId, episodeInput !== "" ? Number(episodeInput) : (video.episode || 0), eventInput, gameModeInput, customVarsInput).catch(console.error);
    onTagSaved?.(); // Refresh UI in dashboard

    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      size: video.size,
      title: ytTitle,
      description,
      privacy,
      status: "pending",
      progress: 0,
      playlistId,
      gameTag: tagInput,
      episode: episodeInput !== "" ? Number(episodeInput) : video.episode,
    };
    onAddToQueue(item);
  };

  const isDirty = 
    tagInput !== (video.game || "") ||
    ytTitle !== (video.youtubeTitle || generateYouTubeTitle(video.name, video.game, video.episode, gameProfiles[video.game || ""], video.event, video.gameMode, video.customVars)) ||
    description !== (video.description || "") ||
    privacy !== (video.privacy || "unlisted") ||
    (episodeInput !== "" && Number(episodeInput) !== (video.episode || 0));

  return (
    <div className={`flex h-full overflow-hidden bg-[#0f0f0f] ${isWide ? "flex-row" : "flex-col"}`}>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Video */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[200px]">
          {!deleting ? (
            <video ref={videoRef} key={video.path} src={src} controls className={`w-full h-full object-contain outline-none ${isWide ? "max-h-full" : "max-h-[75vh]"}`} autoPlay loop={autoRepeatEnabled} onEnded={handleVideoEnded} />
          ) : (
            <div className="text-white/60">Deleting...</div>
          )}
          {/* Regenerated thumbnail preview overlay */}
          {regenThumb && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/90 z-20 animate-fadeIn"
              onClick={() => setRegenThumb(null)}
              title="Click to dismiss"
            >
              <div className="flex flex-col items-center gap-3">
                <img src={regenThumb} alt="New thumbnail" className="max-h-[200px] rounded-lg shadow-2xl" />
                <span className="text-[12px] text-green-500 font-medium">Thumbnail regenerated</span>
                <span className="text-[11px] text-white/50">Click anywhere to close</span>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className={`flex items-center px-6 py-3 bg-[#0f0f0f] shrink-0 z-10 relative ${isWide ? "justify-center" : "justify-between"}`}>
          {/* Left: File Info (Only for standard mode) */}
          {!isWide && (
            <div className="flex-1 flex items-center gap-2 overflow-hidden mr-4">
              <span className="font-medium text-sm text-white/90 truncate" title={video.path}>{video.name}</span>
              <span className="text-white/40 shrink-0 text-sm">•</span>
              <span className="text-white/60 text-sm shrink-0">{formatSize(video.size)}</span>
            </div>
          )}

          {/* Center: Controls */}
          <div className="flex items-center gap-2">
            <button 
              className={`p-2.5 rounded-full transition-colors flex items-center justify-center ${autoRepeatEnabled ? "bg-[#3ea6ff]/20 text-[#3ea6ff]" : "text-white/60 hover:bg-white/10 hover:text-white/90"}`}
              onClick={() => {
                setAutoRepeatEnabled(!autoRepeatEnabled);
                if (!autoRepeatEnabled) setAutoPlayEnabled(false); // mutually exclusive
              }}
              title={autoRepeatEnabled ? "Auto-repeat is ON" : "Turn on Auto-repeat"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
            </button>
            <button 
              className="px-5 py-2.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-medium text-white/90 disabled:opacity-30 disabled:hover:bg-transparent" 
              onClick={onPrev ?? undefined} 
              disabled={!onPrev} 
              title="Previous (←)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
              Previous
            </button>
            <button 
              className="px-5 py-2.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-medium text-white/90 disabled:opacity-30 disabled:hover:bg-transparent" 
              onClick={onNext ?? undefined} 
              disabled={!onNext} 
              title="Next (→)"
            >
              Next
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z" /></svg>
            </button>
            <button 
              className={`relative flex items-center h-[26px] w-[46px] rounded-full transition-colors ml-2 ${autoPlayEnabled ? "bg-white" : "bg-white/20 hover:bg-white/30"}`}
              onClick={() => {
                setAutoPlayEnabled(!autoPlayEnabled);
                if (!autoPlayEnabled) setAutoRepeatEnabled(false);
              }}
              title={autoPlayEnabled ? "Autoplay is on" : "Autoplay is off"}
            >
              <div
                className={`absolute w-[20px] h-[20px] rounded-full flex items-center justify-center transition-transform ${autoPlayEnabled ? "translate-x-[22px] bg-black text-white" : "translate-x-[3px] bg-black text-white/70"}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="ml-[1.5px]">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </button>
          </div>

          {/* Right: Toggle (Only for standard mode) */}
          {!isWide && (
            <div className="flex-1 flex justify-end ml-4">
              <button 
                className="flex items-center gap-2 text-sm font-medium text-white/90 hover:bg-white/10 transition-all px-4 py-2 rounded-full"
                onClick={() => setIsInfoExpanded(!isInfoExpanded)}
              >
                {isInfoExpanded ? "Hide Details" : "Show Details"}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${isInfoExpanded ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info & Edit panel */}
      {isWide ? (
        <div className={`bg-[#0f0f0f] border-l border-white/10 shrink-0 transition-all duration-300 flex flex-col ${isInfoExpanded ? "w-[420px] 2xl:w-[480px]" : "w-14 items-center py-4"}`}>
          {isInfoExpanded ? (
            <div className="flex flex-col h-full w-full p-6 gap-6 animate-in fade-in duration-300 text-white">
              {/* Panel Header (Sidebar mode) */}
              <div className="flex items-center gap-4 pb-4 border-b border-white/10 shrink-0">
                <button 
                  className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/90 transition-colors shrink-0"
                  onClick={() => setIsInfoExpanded(false)}
                  title="Hide Details"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-90">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="font-medium text-sm text-white/90 truncate" title={video.path}>{video.name}</span>
                  <span className="text-white/40 shrink-0 text-xs">•</span>
                  <span className="text-white/60 text-xs shrink-0">{formatSize(video.size)}</span>
                </div>
              </div>

              {/* Form Content - Scrollable Middle */}
              <div className="flex-1 flex flex-col gap-6 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
                    <label className="text-sm font-medium text-white/90">Game Profile</label>
                    <select
                      className="w-full bg-[#272727] border border-transparent rounded-lg px-3 py-3 text-sm text-white outline-none focus:border-[#3ea6ff] focus:bg-[#0f0f0f] transition-colors appearance-none cursor-pointer"
                      value={Object.keys(gameProfiles).includes(tagInput) ? tagInput : ""}
                      onChange={(e) => {
                        const tag = e.target.value;
                        if (tag) handleTagChange(tag);
                        else handleTagChange("");
                      }}
                      disabled={savingInfo}
                    >
                      <option value="">Singleplayer</option>
                      {Object.keys(gameProfiles).map(pTag => (
                        <option key={pTag} value={pTag}>{pTag}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
                    <label className="text-sm font-medium text-white/90">Game Tag</label>
                    <div className={`flex-1 ${Object.keys(gameProfiles).includes(tagInput) ? 'opacity-50 pointer-events-none' : ''}`}>
                      <TagInput value={tagInput} onChange={handleTagChange} onEnter={handleSaveInfo} disabled={Object.keys(gameProfiles).includes(tagInput)} />
                    </div>
                  </div>
                  {activeProfile?.type === "multiplayer" ? (
                    <>
                      {extractOrderedInputVars(activeProfile.titleTemplate).map(cv => {
                        if (cv === 'event') {
                          return (
                            <div key="event" className="flex flex-col gap-2 flex-1 min-w-[140px]">
                              <label className="text-sm font-medium text-white/90">Title</label>
                              <FieldInput
                                fieldKey="event"
                                className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                                value={eventInput}
                                onChange={handleEventChange}
                                placeholder="Highlight..."
                              />
                            </div>
                          )
                        } else if (cv === 'gamemode') {
                          return (
                            <div key="gamemode" className="flex flex-col gap-2 flex-1 min-w-[140px]">
                              <label className="text-sm font-medium text-white/90">Game Mode</label>
                              {activeProfile.modes && activeProfile.modes.length > 0 ? (
                                <select
                                  className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] appearance-none cursor-pointer"
                                  value={gameModeInput}
                                  onChange={e => handleGameModeChange(e.target.value)}
                                >
                                  <option value="">Mode...</option>
                                  {activeProfile.modes.map((m: string) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                                  value={gameModeInput}
                                  onChange={e => handleGameModeChange(e.target.value)}
                                  placeholder="Mode..."
                                />
                              )}
                            </div>
                          )
                        } else {
                          return (
                            <div key={cv} className="flex flex-col gap-2 flex-1 min-w-[140px]">
                              <label className="text-sm font-medium text-white/90 capitalize">{cv}</label>
                              <FieldInput
                                fieldKey={cv}
                                className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                                value={customVarsInput[cv] || ""}
                                onChange={val => handleCustomVarChange(cv, val)}
                                placeholder={`${cv.charAt(0).toUpperCase() + cv.slice(1)}...`}
                              />
                            </div>
                          )
                        }
                      })}
                    </>
                  ) : (
                    <div className="flex flex-col gap-2 w-24 shrink-0">
                      <label className="text-sm font-medium text-white/90">Episode #</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] text-center"
                        value={episodeInput}
                        onChange={e => handleEpisodeChange(e.target.value)}
                        placeholder="—"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <div className="flex flex-col gap-2 flex-1">
                    <label className="text-sm font-medium text-white/90">YouTube Title</label>
                    <input type="text" className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]" value={ytTitle} onChange={e => {
                      const val = e.target.value;
                      setYtTitle(val);
                      // Auto-sync Episode # when user types "— N" at end of title
                      const epMatch = val.match(/ [—\-] (\d+)$/);
                      if (epMatch && !(activeProfile?.type === "multiplayer")) setEpisodeInput(parseInt(epMatch[1], 10));
                    }} maxLength={100} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/90">Description</label>
                  <textarea className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] resize-y min-h-[140px]" value={description} onChange={e => setDescription(e.target.value)} rows={5} />
                </div>
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-medium text-white/90">Privacy</label>
                  <div className="flex gap-2">
                    {(["public", "unlisted", "private"] as const).map(p => (
                      <button key={p} className={`flex-1 py-2 rounded-sm text-sm font-medium transition-colors border ${privacy === p ? "bg-card border-accent text-accent shadow-[0_0_0_1px_rgba(249,115,22,0.5)]" : "bg-elevated border-border-subtle text-text-primary hover:border-border-medium hover:bg-card"}`} onClick={() => setPrivacy(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 relative">
                   <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-white/90">Playlist</label>
                      {video.playlistTitle && (
                        <span className="text-xs bg-[#3ea6ff]/10 text-[#3ea6ff] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                          Linked: {video.playlistTitle}
                        </span>
                      )}
                    </div>
                    <button className="text-sm font-medium text-[#3ea6ff] hover:text-[#65b8ff] transition-colors bg-transparent border-none cursor-pointer" onClick={() => { setIsCreatingPlaylist(!isCreatingPlaylist); setPlaylistCreateError(""); }}>
                      {isCreatingPlaylist ? "Cancel" : "New Playlist"}
                    </button>
                  </div>

                  {isCreatingPlaylist ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input className="flex-1 bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]" type="text" value={newPlaylistTitle} onChange={e => setNewPlaylistTitle(e.target.value)} placeholder="Playlist name..." autoFocus disabled={isCreatingPlaylistLoading} onKeyDown={e => e.key === "Enter" && handleCreatePlaylist()} />
                        <button className="bg-white text-black hover:bg-gray-200 rounded-sm px-5 text-sm font-medium transition-colors" onClick={handleCreatePlaylist} disabled={!newPlaylistTitle.trim() || isCreatingPlaylistLoading}>
                          {isCreatingPlaylistLoading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : "Create"}
                        </button>
                      </div>
                      <span className="text-xs text-white/50">Existing playlist with same name will be reused.</span>
                      {playlistCreateError && <span className="text-xs text-red-400">{playlistCreateError}</span>}
                    </div>
                  ) : (
                    <div className="relative">
                      <input className="w-full bg-elevated border border-border-subtle rounded-sm pl-10 pr-10 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]" type="text" value={playlistSearch} onChange={e => { setPlaylistSearch(e.target.value); setIsPlaylistDropdownOpen(true); if(!e.target.value) setPlaylistId(""); }} onFocus={() => setIsPlaylistDropdownOpen(true)} placeholder={playlistId ? playlists.find(p => p.id === playlistId)?.title : "Select playlist..."} />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      </div>
                      {playlistId && (
                        <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors" onClick={() => { setPlaylistId(""); setPlaylistSearch(""); }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                      )}
                      
                      {isPlaylistDropdownOpen && (
                        <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#272727] border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                          {playlists.filter(p => p.title.toLowerCase().includes(playlistSearch.toLowerCase())).map(p => (
                            <button key={p.id} className={`w-full text-left px-4 py-3 hover:bg-white/10 transition-colors flex items-center justify-between ${playlistId === p.id ? "bg-white/5 text-white" : "text-white/90"}`} onClick={() => { setPlaylistId(p.id); setPlaylistSearch(p.title); setIsPlaylistDropdownOpen(false); }}>
                              <span className="text-sm font-medium truncate flex-1">{p.title}</span>
                              {playlistId === p.id && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#3ea6ff]"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                            </button>
                          ))}
                        </div>
                      )}
                      {isPlaylistDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsPlaylistDropdownOpen(false)} />}
                    </div>
                  )}
                </div>
              </div>

              {/* Upload & Save actions - Fixed Bottom */}
              <div className="flex flex-col items-stretch gap-3 shrink-0 pt-4 border-t border-white/10">
                <div className="flex items-center gap-3">
                  <button
                    className="flex-1 py-2.5 rounded-full bg-transparent border border-white/20 text-white/90 hover:bg-white/10 text-sm font-medium transition-colors"
                    onClick={handleRegenerateThumbnail}
                    disabled={regenLoading}
                    title="Re-capture a fresh thumbnail frame from this video"
                  >
                    {regenLoading ? "..." : "Regen Thumb"}
                  </button>
                  <button
                    className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-colors ${confirmDelete ? "bg-red-500 text-white" : "bg-transparent border border-white/20 text-red-400 hover:bg-red-500/10"}`}
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {confirmDelete ? (deleting ? "Deleting..." : "Confirm Delete") : "Delete"}
                  </button>
                </div>
                
                <div className="flex flex-col gap-3">
                  {/* YouTube update status */}
                  {ytUpdateError && (
                    <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-red-400 shrink-0 mt-0.5">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                      </svg>
                      <span className="text-xs text-red-400 leading-tight flex-1" title={ytUpdateError}>
                        Saved locally. YouTube update failed: {ytUpdateError.replace(/^Error: /, "")}
                      </span>
                      <button className="text-red-400/60 hover:text-red-400 shrink-0" onClick={() => setYtUpdateError(null)}>×</button>
                    </div>
                  )}
                  {infoSaved && !ytUpdateError && video.youtubeId && (
                    <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-green-400 shrink-0">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                      <span className="text-xs text-green-400 font-medium">Saved locally and updated on YouTube</span>
                    </div>
                  )}

                  <button 
                    className={`w-full py-3 rounded-full text-sm font-medium transition-colors ${infoSaved || isDirty ? "bg-[#3ea6ff] text-black hover:bg-[#65b8ff]" : "bg-[#272727] text-white/50 cursor-default"}`} 
                    onClick={handleSaveInfo} 
                    disabled={savingInfo || (!isDirty && !infoSaved)}
                  >
                    {infoSaved ? (video.youtubeId ? "Updated!" : "Saved!") : savingInfo ? (video.youtubeId ? "Updating..." : "Saving...") : "Save Info"}
                  </button>
                  <div className="flex gap-2">
                    <button className="flex-1 py-3 rounded-full bg-[#272727] hover:bg-[#3f3f3f] text-white text-sm font-medium transition-colors" onClick={handleAddToQueue}>Add to Queue</button>
                    <button className="flex-1 py-3 rounded-full bg-white text-black hover:bg-gray-200 text-sm font-medium transition-colors" onClick={handleUploadNow} disabled={uploading || !ytTitle.trim()}>Upload Now</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button 
              className="p-3 mt-2 rounded-full hover:bg-white/10 text-white/90 transition-colors group"
              onClick={() => setIsInfoExpanded(true)}
              title="Show Details"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 group-hover:scale-110 transition-transform">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          )}
        </div>
      ) : (
        // Standard View Bottom Panel
        isInfoExpanded && (
          <div className="bg-[#0f0f0f] border-t border-white/10 p-6 overflow-y-auto shrink-0 flex flex-col gap-6 min-h-[300px] animate-in slide-in-from-bottom duration-300 text-white">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
                  <label className="text-sm font-medium text-white/90">Game Profile</label>
                  <select
                    className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] appearance-none cursor-pointer"
                    value={Object.keys(gameProfiles).includes(tagInput) ? tagInput : ""}
                    onChange={(e) => {
                      const tag = e.target.value;
                      if (tag) handleTagChange(tag);
                      else handleTagChange("");
                    }}
                    disabled={savingInfo}
                  >
                    <option value="">Singleplayer</option>
                    {Object.keys(gameProfiles).map(pTag => (
                      <option key={pTag} value={pTag}>{pTag}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
                  <label className="text-sm font-medium text-white/90">Game Tag</label>
                  <div className={`flex-1 ${Object.keys(gameProfiles).includes(tagInput) ? 'opacity-50 pointer-events-none' : ''}`}>
                    <TagInput value={tagInput} onChange={handleTagChange} onEnter={handleSaveInfo} disabled={Object.keys(gameProfiles).includes(tagInput)} />
                  </div>
                </div>
                {activeProfile?.type === "multiplayer" ? (
                  <>
                    {extractOrderedInputVars(activeProfile.titleTemplate).map(cv => {
                      if (cv === 'event') {
                        return (
                          <div key="event" className="flex flex-col gap-2 flex-1 min-w-[140px]">
                            <label className="text-sm font-medium text-white/90">Title</label>
                            <FieldInput
                              fieldKey="event"
                              className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                              value={eventInput}
                              onChange={handleEventChange}
                              placeholder="Highlight..."
                            />
                          </div>
                        )
                      } else if (cv === 'gamemode') {
                        return (
                          <div key="gamemode" className="flex flex-col gap-2 flex-1 min-w-[140px]">
                            <label className="text-sm font-medium text-white/90">Game Mode</label>
                            {activeProfile.modes && activeProfile.modes.length > 0 ? (
                              <select
                                className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] appearance-none cursor-pointer"
                                value={gameModeInput}
                                onChange={e => handleGameModeChange(e.target.value)}
                              >
                                <option value="">Mode...</option>
                                {activeProfile.modes.map((m: string) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                                value={gameModeInput}
                                onChange={e => handleGameModeChange(e.target.value)}
                                placeholder="Mode..."
                              />
                            )}
                          </div>
                        )
                      } else {
                        return (
                          <div key={cv} className="flex flex-col gap-2 flex-1 min-w-[140px]">
                            <label className="text-sm font-medium text-white/90 capitalize">{cv}</label>
                            <FieldInput
                              fieldKey={cv}
                              className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                              value={customVarsInput[cv] || ""}
                              onChange={val => handleCustomVarChange(cv, val)}
                              placeholder={`${cv.charAt(0).toUpperCase() + cv.slice(1)}...`}
                            />
                          </div>
                        )
                      }
                    })}
                  </>
                ) : (
                  <div className="flex flex-col gap-2 w-24 shrink-0">
                    <label className="text-sm font-medium text-white/90">Episode #</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] text-center"
                      value={episodeInput}
                      onChange={e => handleEpisodeChange(e.target.value)}
                      placeholder="—"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-medium text-white/90">YouTube Title</label>
                  <input type="text" className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]" value={ytTitle} onChange={e => {
                    const val = e.target.value;
                    setYtTitle(val);
                    // Auto-sync Episode # when user types "— N" at end of title
                    const epMatch = val.match(/ [—\-] (\d+)$/);
                    if (epMatch && !(activeProfile?.type === "multiplayer")) setEpisodeInput(parseInt(epMatch[1], 10));
                  }} maxLength={100} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/90">Description</label>
                <textarea className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] resize-y min-h-[100px]" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-white/90">Privacy</label>
                <div className="flex gap-2">
                  {(["public", "unlisted", "private"] as const).map(p => (
                    <button key={p} className={`px-6 py-2 rounded-sm text-sm font-medium transition-colors border ${privacy === p ? "bg-card border-accent text-accent shadow-[0_0_0_1px_rgba(249,115,22,0.5)]" : "bg-elevated border-border-subtle text-text-primary hover:border-border-medium hover:bg-card"}`} onClick={() => setPrivacy(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 relative">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-white/90">Playlist</label>
                  <button className="text-sm font-medium text-[#3ea6ff] hover:text-[#65b8ff] transition-colors bg-transparent border-none cursor-pointer" onClick={() => { setIsCreatingPlaylist(!isCreatingPlaylist); setPlaylistCreateError(""); }}>
                    {isCreatingPlaylist ? "Cancel" : "New Playlist"}
                  </button>
                </div>
                {isCreatingPlaylist ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input className="flex-1 bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]" type="text" value={newPlaylistTitle} onChange={e => setNewPlaylistTitle(e.target.value)} placeholder="Playlist name..." autoFocus disabled={isCreatingPlaylistLoading} onKeyDown={e => e.key === "Enter" && handleCreatePlaylist()} />
                      <button className="bg-white text-black hover:bg-gray-200 rounded-sm px-5 text-sm font-medium transition-colors" onClick={handleCreatePlaylist} disabled={!newPlaylistTitle.trim() || isCreatingPlaylistLoading}>
                        {isCreatingPlaylistLoading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : "Create"}
                      </button>
                    </div>
                    {playlistCreateError && <span className="text-xs text-red-400">{playlistCreateError}</span>}
                  </div>
                ) : (
                  <div className="relative">
                    <input className="w-full bg-elevated border border-border-subtle rounded-sm pl-10 pr-10 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]" type="text" value={playlistSearch} onChange={e => { setPlaylistSearch(e.target.value); setIsPlaylistDropdownOpen(true); if(!e.target.value) setPlaylistId(""); }} onFocus={() => setIsPlaylistDropdownOpen(true)} placeholder={playlistId ? playlists.find(p => p.id === playlistId)?.title : "Select playlist..."} />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    {isPlaylistDropdownOpen && (
                      <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#272727] border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                        {playlists.filter(p => p.title.toLowerCase().includes(playlistSearch.toLowerCase())).map(p => (
                          <button key={p.id} className={`w-full text-left px-4 py-3 hover:bg-white/10 transition-colors flex items-center justify-between ${playlistId === p.id ? "bg-white/5 text-white" : "text-white/90"}`} onClick={() => { setPlaylistId(p.id); setPlaylistSearch(p.title); setIsPlaylistDropdownOpen(false); }}>
                            <span className="text-sm font-medium truncate flex-1">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {isPlaylistDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsPlaylistDropdownOpen(false)} />}
                  </div>
                )}
              </div>
            </div>
            
            <div className="h-px bg-white/10 w-full my-4" />
            
            <div className="flex items-center justify-between gap-4">
              <button className={`px-6 py-2.5 rounded-full text-sm font-medium transition-colors ${confirmDelete ? "bg-red-500 text-white" : "bg-transparent border border-white/20 text-red-400 hover:bg-red-500/10"}`} onClick={handleDelete} disabled={deleting}>{confirmDelete ? "Confirm Delete" : "Delete Video"}</button>
              
              <div className="flex items-center gap-3">
                <button
                  className="px-5 py-2.5 rounded-full bg-transparent border border-white/20 text-white/90 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2"
                  onClick={handleRegenerateThumbnail}
                  disabled={regenLoading}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                  </svg>
                  {regenLoading ? "..." : "Regen Thumb"}
                </button>
                <button className={`px-6 py-2.5 rounded-full text-sm font-medium transition-colors ${infoSaved || isDirty ? "bg-[#3ea6ff] text-black hover:bg-[#65b8ff]" : "bg-[#272727] text-white/50 cursor-default"}`} onClick={handleSaveInfo} disabled={savingInfo || (!isDirty && !infoSaved)}>
                  {infoSaved ? (video.youtubeId ? "Updated!" : "Saved!") : savingInfo ? (video.youtubeId ? "Updating..." : "Saving...") : "Save Info"}
                </button>
                <button className="px-6 py-2.5 rounded-full bg-[#272727] hover:bg-[#3f3f3f] text-white text-sm font-medium transition-colors" onClick={handleAddToQueue}>Add to Queue</button>
                {video.youtubeId && (
                  <a href={`https://youtu.be/${video.youtubeId}`} target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded-full bg-transparent border border-white/20 text-white/90 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
                    </svg>
                    View on YT
                  </a>
                )}
                <button className="px-6 py-2.5 rounded-full bg-white text-black hover:bg-gray-200 text-sm font-medium transition-colors" onClick={handleUploadNow} disabled={uploading || !ytTitle.trim()}>
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
