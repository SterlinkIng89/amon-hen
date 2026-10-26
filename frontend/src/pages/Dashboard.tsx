import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  IsYouTubeAuthed,
  SaveVideoMetadata,
  SyncRecentVideos,
  UploadToYouTube,
  LoadConfig,
  GetUploadSessions,
  OpenFolderInExplorer,
} from "../../wailsjs/go/backend/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

// Types & Utils
import { VideoFile, ViewMode, GameProfile, SortMode } from "../types";
import {
  groupVideos,
  resolveDisplayTitle,
  hasUnfilledPlaceholders,
} from "../utils/videoUtils";

// Global store
import { useAppStore } from "../store/useAppStore";

// Hooks
import { useVideoLibrary } from "../hooks/useVideoLibrary";
import { useAdvancedFilters } from "../components/ui/AdvancedFilters";
import { useStreamPort } from "../hooks/useStreamPort";

// UI
import AppHeader from "../components/layout/AppHeader";
import VideoGrid from "../components/video/VideoGrid";
import PlayerView from "../components/video/PlayerView";
import StreamStatus from "../components/video/StreamStatus";
import ChannelPage from "./ChannelPage";
import QueuePage from "./QueuePage";
import StatsPage from "./StatsPage";
import SteamStats from "./SteamStats";
import UploadDialog, {
  UploadOptions,
} from "../components/youtube/UploadDialog";
import UploadQueue, { QueueItem } from "../components/youtube/UploadQueue";

import SettingsPanel from "../components/layout/SettingsPanel";
import BulkActionBar from "../components/video/BulkActionBar";
import DevLogsPanel from "../components/youtube/DevLogsPanel";
import FolderSettingsDialog from "../components/layout/FolderSettingsDialog";
import LibrarySubHeader from "../components/video/LibrarySubHeader";
import TagManagementModal from "../components/ui/TagManagementModal";
import UploadedCleanupModal from "../components/video/UploadedCleanupModal";
import ErrorBoundary from "../components/ui/ErrorBoundary";

const MAX_CONCURRENT_UPLOADS = 3;

function applySortMode(videos: VideoFile[], mode: SortMode): VideoFile[] {
  const arr = [...videos];
  switch (mode) {
    case "name":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case "size":
      return arr.sort((a, b) => b.size - a.size);
    case "duration":
      return arr.sort((a, b) => (b.durationSecs || 0) - (a.durationSecs || 0));
    case "episode":
      return arr.sort((a, b) => (b.episode || 0) - (a.episode || 0));
    case "date":
    default:
      return arr.sort((a, b) => b.modTime - a.modTime);
  }
}

function matchesTagFilter(
  video: VideoFile,
  tagFilter: string,
  profiles: Record<string, GameProfile>,
): boolean {
  if (!tagFilter) return true;
  if (tagFilter === "__untagged__") {
    return !video.game || video.game.trim() === "";
  }
  if (tagFilter === "__placeholders__") {
    return hasUnfilledPlaceholders(
      video,
      video.game ? profiles[video.game] : undefined,
    );
  }
  return video.game === tagFilter;
}

export default function Dashboard() {
  // ── Global store ────────────────────────────────────────────────────────────
  const {
    queue,
    setQueue,
    queueRunning,
    setQueueRunning,
    queueAddedAt,
    bumpQueueAdded,
    queueDoneAt,
    bumpQueueDone,
    ytAuthed,
    setYtAuthed,
    view,
    setView,
    sortMode,
    setSortMode,
    groupMode,
    setGroupMode,
    filterUploaded,
    setFilterUploaded,
    selectedIndex,
    setSelectedIndex,
  } = useAppStore();

  // ── Video library hook ───────────────────────────────────────────────────────
  const {
    videos,
    folders,
    activeFolders,
    scanning,
    error,
    isDraggingOver,
    handleAddFolder,
    handleRemoveFolder,
    handleRescan,
    toggleFolder,
  } = useVideoLibrary();

  // ── Local UI state ───────────────────────────────────────────────────────────
  const { streamPort, streamError, retryStream } = useStreamPort(
    view === "player",
  );
  const [uploadTarget, setUploadTarget] = useState<VideoFile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const lastSelectedPath = useRef<string | null>(null);
  const [devLogsOpen, setDevLogsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [settingsFolder, setSettingsFolder] = useState<string | null>(null);
  const [tagManagementOpen, setTagManagementOpen] = useState(false);
  const [gameProfiles, setGameProfiles] = useState<Record<string, GameProfile>>(
    {},
  );
  const [tagPlaylists, setTagPlaylists] = useState<Record<string, string>>({});
  const [titleSeparator, setTitleSeparator] = useState(" — ");
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const cleanupPromptShownRef = useRef(false);

  // Prompt cleanup modal on initial folder scan completion if uploaded videos exist
  useEffect(() => {
    if (!scanning && videos.length > 0 && !cleanupPromptShownRef.current) {
      cleanupPromptShownRef.current = true;
      const uploaded = videos.filter((v) => Boolean(v.youtubeId));
      if (uploaded.length > 0) {
        setCleanupModalOpen(true);
      }
    }
  }, [scanning, videos]);

  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        setGameProfiles(cfg.game_profiles || {});
        setTagPlaylists(cfg.tag_playlists || {});
        if (cfg.title_separator) setTitleSeparator(cfg.title_separator);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    GetUploadSessions()
      .then((sessions) => {
        if (!sessions || sessions.length === 0) return;
        setQueue((currQueue) => {
          const newItems: QueueItem[] = [];
          sessions.forEach((s) => {
            if (currQueue.some((q) => q.videoPath === s.videoPath)) return;
            const pct =
              s.totalBytes > 0
                ? Math.round((s.bytesUploaded / s.totalBytes) * 100)
                : 0;
            const fileName = s.videoPath.split(/[/\\]/).pop() || "Video";
            newItems.push({
              id: `session-${s.videoPath}`,
              videoPath: s.videoPath,
              videoName: fileName,
              size: s.totalBytes,
              title: s.title || fileName,
              description: s.description || "",
              privacy:
                s.privacy === "public" || s.privacy === "private"
                  ? s.privacy
                  : "unlisted",
              status: "interrupted",
              progress: pct,
              playlistId: s.playlistId,
              gameTag: s.gameTag,
              episode: s.episode,
              resumable: true,
              resumedFrom: s.bytesUploaded,
            });
          });
          return newItems.length > 0 ? [...currQueue, ...newItems] : currQueue;
        });
      })
      .catch(() => {});
  }, []);

  // ── Advanced library filters ─────────────────────────────────────────────────
  const libFilters = useAdvancedFilters();

  const restoredIndexRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [listRoot, setListRoot] = useState<HTMLElement | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const runningRef = useRef(queueRunning);
  runningRef.current = queueRunning;

  useEffect(() => {
    if (listRef.current) setListRoot(listRef.current);
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────
  const availableTags = useMemo(
    () => Array.from(new Set(videos.map((v) => v.game).filter(Boolean))).sort(),
    [videos],
  );

  const sortedVideos = useMemo(
    () => applySortMode(videos, sortMode),
    [videos, sortMode],
  );

  const filteredVideos = useMemo(() => {
    const filteredByFolder =
      activeFolders.length === 0
        ? sortedVideos
        : sortedVideos.filter((v) => activeFolders.includes(v.folder));

    const filteredByTag = tagFilter
      ? filteredByFolder.filter((v) =>
          matchesTagFilter(v, tagFilter, gameProfiles),
        )
      : filteredByFolder;

    const filteredByUpload = filterUploaded
      ? filteredByTag.filter((v) => !v.youtubeId)
      : filteredByTag;

    const filteredBySearch = searchQuery
      ? filteredByUpload.filter((v) => {
          const sq = searchQuery.toLowerCase();
          return (
            v.name.toLowerCase().includes(sq) ||
            (v.game && v.game.toLowerCase().includes(sq)) ||
            (v.event && v.event.toLowerCase().includes(sq)) ||
            (v.gameMode && v.gameMode.toLowerCase().includes(sq)) ||
            (v.customVars &&
              Object.values(v.customVars).some((val) =>
                val.toLowerCase().includes(sq),
              ))
          );
        })
      : filteredByUpload;

    const filteredByDate =
      libFilters.dateFrom || libFilters.dateTo
        ? filteredBySearch.filter((v) => {
            const d = new Date(v.modTime * 1000).toISOString().substring(0, 10);
            if (libFilters.dateFrom && d < libFilters.dateFrom) return false;
            if (libFilters.dateTo && d > libFilters.dateTo) return false;
            return true;
          })
        : filteredBySearch;

    if (libFilters.excludeWords.length === 0) return filteredByDate;

    const lowerWords = libFilters.excludeWords.map((w) => w.toLowerCase());
    return filteredByDate.filter((v) => {
      const haystack = [
        v.name,
        v.game || "",
        v.event || "",
        v.gameMode || "",
      ]
        .join(" ")
        .toLowerCase();
      return !lowerWords.some((w) => haystack.includes(w));
    });
  }, [
    sortedVideos,
    activeFolders,
    tagFilter,
    gameProfiles,
    filterUploaded,
    searchQuery,
    libFilters.dateFrom,
    libFilters.dateTo,
    libFilters.excludeWords,
  ]);

  const queuedPathsSet = useMemo(
    () =>
      new Set(
        queue
          .filter((item) => item.status === "pending")
          .map((item) => item.videoPath),
      ),
    [queue],
  );

  const groups = useMemo(
    () => groupVideos(filteredVideos, groupMode, queuedPathsSet),
    [filteredVideos, groupMode, queuedPathsSet],
  );
  const selectedVideo = selectedIndex >= 0 ? sortedVideos[selectedIndex] : null;

  // ── Init: YouTube auth ──────────────────────────────────────────────────────
  useEffect(() => {
    IsYouTubeAuthed()
      .then(setYtAuthed)
      .catch(() => {});

    const unsubAuth = EventsOn("youtube:auth-complete", () => setYtAuthed(true));
    return () => {
      unsubAuth();
    };
  }, []);

  // ── Restore selectedIndex once videos are loaded (once only) ─────────────────
  useEffect(() => {
    if (videos.length === 0 || restoredIndexRef.current) return;
    restoredIndexRef.current = true;
    if (
      view === "player" &&
      selectedIndex >= 0 &&
      selectedIndex < sortedVideos.length
    ) {
      // Already restored from store — nothing to do
    } else {
      setView(
        view === "channel"
          ? "channel"
          : view === "stats"
            ? "stats"
            : view === "player"
              ? "grid"
              : view,
      );
    }
  }, [videos]);

  // ── Clear selection on view change away from library ────────────────────────
  useEffect(() => {
    if (view !== "grid" && view !== "player") {
      if (selectedPaths.length > 0) {
        setSelectedPaths([]);
        lastSelectedPath.current = null;
      }
    }
  }, [view]);

  // ── Escape key: clear selection or search ────────────────────────────────────
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedPaths.length > 0) {
          setSelectedPaths([]);
          lastSelectedPath.current = null;
        } else if (searchQuery) {
          setSearchQuery("");
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedPaths.length, searchQuery]);

  // ── Video click and select handlers ──────────────────────────────────────────
  const togglePathSelection = (path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
    lastSelectedPath.current = path;
  };

  const handleSelectToggle = (filteredIdx: number) => {
    const video = filteredVideos[filteredIdx];
    if (video) togglePathSelection(video.path);
  };

  const handleSelectGroup = (paths: string[], select: boolean) => {
    setSelectedPaths((prev) => {
      if (select) {
        const next = new Set(prev);
        paths.forEach((p) => next.add(p));
        return Array.from(next);
      } else {
        const toRemove = new Set(paths);
        return prev.filter((p) => !toRemove.has(p));
      }
    });
  };

  const handleVideoClick = (filteredIdx: number, e: React.MouseEvent) => {
    const video = filteredVideos[filteredIdx];
    if (!video) return;

    const sortedIdx = sortedVideos.findIndex((v) => v.path === video.path);

    let currentPaths = [...selectedPaths];
    if (
      view === "player" &&
      currentPaths.length === 0 &&
      (e.shiftKey || e.ctrlKey || e.metaKey)
    ) {
      if (selectedIndex !== -1 && sortedVideos[selectedIndex]) {
        currentPaths.push(sortedVideos[selectedIndex].path);
      }
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      togglePathSelection(video.path);
      return;
    }

    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const anchorPath =
        lastSelectedPath.current ||
        (selectedIndex !== -1 ? sortedVideos[selectedIndex]?.path : null) ||
        filteredVideos[0]?.path;

      const visibleStartIdx = filteredVideos.findIndex(
        (v) => v.path === anchorPath,
      );
      const visibleEndIdx = filteredIdx;

      if (visibleStartIdx !== -1 && visibleEndIdx !== -1) {
        const start = Math.min(visibleStartIdx, visibleEndIdx);
        const end = Math.max(visibleStartIdx, visibleEndIdx);
        const next = new Set(currentPaths);
        for (let i = start; i <= end; i++) {
          next.add(filteredVideos[i].path);
        }
        setSelectedPaths(Array.from(next));
      }
      lastSelectedPath.current = video.path;
      return;
    }

    const inSelectionMode =
      view === "player" ? currentPaths.length > 1 : currentPaths.length > 0;
    if (inSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      togglePathSelection(video.path);
      return;
    }

    lastSelectedPath.current = video.path;
    setSelectedPaths([]);
    setSelectedIndex(sortedIdx);
    setView("player");
  };

  const goTo = (i: number) => {
    if (i >= 0 && i < sortedVideos.length) setSelectedIndex(i);
  };

  // ── processQueue (local, mirrors UploadQueue.tsx logic) ──────────────────────
  const processQueue = (currentQueue: QueueItem[]) => {
    if (!runningRef.current) return;

    const uploadingCount = currentQueue.filter(
      (i) => i.status === "uploading",
    ).length;
    if (uploadingCount >= MAX_CONCURRENT_UPLOADS) return;

    const pendingItems = currentQueue.filter((i) => i.status === "pending");
    if (pendingItems.length === 0 && uploadingCount === 0) {
      setQueueRunning(false);
      return;
    }

    const slotsAvailable = MAX_CONCURRENT_UPLOADS - uploadingCount;
    const itemsToStart = pendingItems.slice(0, slotsAvailable);
    if (itemsToStart.length === 0) return;

    const updatedQueue = [...currentQueue];
    itemsToStart.forEach((item) => {
      const idx = updatedQueue.findIndex((i) => i.id === item.id);
      if (idx !== -1)
        updatedQueue[idx] = {
          ...updatedQueue[idx],
          status: "uploading",
          startedAt: Date.now(),
        };
      UploadToYouTube(
        item.videoPath,
        item.title,
        item.description,
        item.privacy,
        item.playlistId || "",
        item.gameTag || "",
        item.episode || 0,
        item.thumbnailPath || "",
      ).catch(() => {});
    });

    setQueue(updatedQueue);
  };

  // ── Upload helpers ───────────────────────────────────────────────────────────
  const handleAddToQueue = (item: QueueItem) => {
    // No auto-open — just add and bump the badge
    if (item.status === "uploading") {
      setQueue((q) => [item, ...q]);
      setQueueRunning(true);
    } else {
      setQueue((q) => [...q, item]);
    }
    bumpQueueAdded();
  };

  const handleUploadNow = async (video: VideoFile, opts: UploadOptions) => {
    await SaveVideoMetadata(
      video.path,
      video.game || "",
      opts.title,
      opts.description,
      opts.privacy,
      opts.playlistId || "",
      video.episode || 0,
      video.event || "",
      video.gameMode || "",
      video.customVars || {},
    ).catch(console.error);

    handleAddToQueue({
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      size: video.size,
      title: opts.title,
      description: opts.description,
      privacy: opts.privacy,
      status: "uploading",
      progress: 0,
      playlistId: opts.playlistId,
      gameTag: video.game,
      episode: video.episode,
    });

    UploadToYouTube(
      video.path,
      opts.title,
      opts.description,
      opts.privacy,
      opts.playlistId || "",
      video.game || "",
      video.episode || 0,
      "",
    ).catch(() => {});

    handleRescan();
  };

  const handleAddToQueueModal = async (
    video: VideoFile,
    opts: UploadOptions,
  ) => {
    await SaveVideoMetadata(
      video.path,
      video.game || "",
      opts.title,
      opts.description,
      opts.privacy,
      opts.playlistId || "",
      video.episode || 0,
      video.event || "",
      video.gameMode || "",
      video.customVars || {},
    ).catch(console.error);

    setQueue((q) => [
      ...q,
      {
        id: crypto.randomUUID(),
        videoPath: video.path,
        videoName: video.name,
        size: video.size,
        title: opts.title,
        description: opts.description,
        privacy: opts.privacy,
        status: "pending",
        progress: 0,
        playlistId: opts.playlistId,
        gameTag: video.game,
        episode: video.episode,
      },
    ]);
    bumpQueueAdded();
    handleRescan();
  };

  const handleQuickQueue = (video: VideoFile) => {
    if (video.youtubeId) return;

    const resolvedPlaylistId =
      video.playlistId ||
      (video.game && tagPlaylists[video.game] && tagPlaylists[video.game] !== "none"
        ? tagPlaylists[video.game]
        : "");

    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      size: video.size,
      title: resolveDisplayTitle(video, gameProfiles, titleSeparator),
      description: video.description || "",
      privacy: (video.privacy as "public" | "unlisted" | "private") || "unlisted",
      status: "pending",
      progress: 0,
      playlistId: resolvedPlaylistId,
      gameTag: video.game || "",
      episode: video.episode || 0,
    };

    handleAddToQueue(item);
  };

  const handleOpenInExplorer = (video: VideoFile) => {
    if (video.path) {
      OpenFolderInExplorer(video.path).catch((err) => {
        console.error("Failed to open file in explorer:", err);
      });
    }
  };

  // ── Queue stats for header ───────────────────────────────────────────────────
  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const uploadingCount = queue.filter((i) => i.status === "uploading").length;
  const queueCount = pendingCount + uploadingCount;

  // Global upload progress (average of all uploading items)
  const uploadingItems = queue.filter((i) => i.status === "uploading");
  const uploadProgress =
    uploadingItems.length > 0
      ? uploadingItems.reduce((sum, i) => sum + (i.progress || 0), 0) /
        uploadingItems.length
      : 0;

  // ── QueuePage handlers ───────────────────────────────────────────────────────
  const handleQueueStart = () => {
    setQueueRunning(true);
    runningRef.current = true;
    processQueue(queue);
  };

  const isSelecting =
    (view === "grid" || view === "player") &&
    selectedPaths.length > (view === "player" ? 1 : 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Hidden logic component — drives upload events */}
      <UploadQueue
        queue={queue}
        running={queueRunning}
        onUpdateQueue={(q) => setQueue(q)}
        onSetRunning={setQueueRunning}
        onUploadDone={() => {
          bumpQueueDone();
          handleRescan();
          // Refresh YT data after each upload so the upload-arrow icon
          // updates to the YouTube link icon automatically in the Library
          if (ytAuthed) {
            SyncRecentVideos(5).catch(() => {});
          }
        }}
      />

      <AppHeader
        view={view as ViewMode}
        foldersCount={folders.length}
        scanning={scanning}
        queueCount={queueCount}
        uploadingCount={uploadingCount}
        uploadProgress={uploadProgress}
        queueAddedAt={queueAddedAt}
        queueDoneAt={queueDoneAt}
        ytAuthed={ytAuthed}
        onSetView={setView}
        onRescan={handleRescan}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddFolder={handleAddFolder}
        onOpenDevLogs={() => setDevLogsOpen(true)}
      />

      {(view === "grid" || view === "player") && (
        <LibrarySubHeader
          folders={folders}
          activeFolders={activeFolders}
          filteredVideos={filteredVideos}
          searchQuery={searchQuery}
          sortMode={sortMode}
          groupMode={groupMode}
          onSearchChange={setSearchQuery}
          onSortChange={setSortMode}
          onGroupChange={setGroupMode}
          onToggleFolder={toggleFolder}
          onOpenFolderSettings={setSettingsFolder}
          filterUploaded={filterUploaded}
          onToggleFilterUploaded={() => setFilterUploaded(!filterUploaded)}
          onOpenCleanup={() => setCleanupModalOpen(true)}
          advancedFilters={libFilters.value}
          onAdvancedFiltersChange={libFilters.onChange}
          onOpenTagManagement={() => setTagManagementOpen(true)}
          availableTags={availableTags}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
        />
      )}

      {/* Bulk action bar */}
      {isSelecting && (
        <BulkActionBar
          selectedPaths={selectedPaths}
          selectedVideos={selectedPaths
            .map((p) => sortedVideos.find((v) => v.path === p))
            .filter((v): v is VideoFile => v !== undefined)}
          onClearSelection={() => {
            setSelectedPaths([]);
            lastSelectedPath.current = null;
          }}
          onRescanOnly={() => handleRescan()}
          onTagsSaved={() => {
            setSelectedPaths([]);
            lastSelectedPath.current = null;
            handleRescan();
          }}
          onFilesDeleted={() => {
            setSelectedPaths([]);
            lastSelectedPath.current = null;
            setSelectedIndex(-1);
            handleRescan();
          }}
          onAddToQueue={(items) => {
            setQueue((q) => [...q, ...items]);
            bumpQueueAdded();
          }}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {error && (
          <div
            style={{
              padding: "16px",
              color: "#f87171",
              background: "rgba(248,113,113,0.1)",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {view === "grid" && (
          <ErrorBoundary area="Video Grid">
            <VideoGrid
              folders={folders}
              activeFolders={activeFolders}
              groups={groups}
              allVideos={sortedVideos}
              sortedVideos={filteredVideos}
              sortMode={sortMode}
              groupMode={groupMode}
              selectedPaths={selectedPaths}
              onOpenVideo={handleVideoClick}
              onSelectToggle={handleSelectToggle}
              onSelectGroup={handleSelectGroup}
              onUploadTarget={setUploadTarget}
              onQuickQueue={handleQuickQueue}
              onOpenInExplorer={handleOpenInExplorer}
            />
          </ErrorBoundary>
        )}

        {view === "player" &&
          (streamPort > 0 ? (
            <ErrorBoundary area="Player">
              <PlayerView
                sortedVideos={filteredVideos}
                allVideos={sortedVideos}
                selectedVideo={selectedVideo}
                selectedIndex={selectedIndex}
                streamPort={streamPort}
                listRef={listRef}
                listRoot={listRoot}
                selectedPaths={selectedPaths}
                onGoTo={goTo}
                onVideoClick={handleVideoClick}
                onUploadTarget={setUploadTarget}
                onTagSaved={handleRescan}
                onFilesDeleted={() => {
                  setSelectedIndex(-1);
                  handleRescan();
                }}
                onAddToQueue={handleAddToQueue}
              />
            </ErrorBoundary>
          ) : (
            <StreamStatus
              error={streamError}
              onRetry={retryStream}
              onBackToLibrary={() => setView("grid")}
            />
          ))}

        {view === "channel" && (
          <ErrorBoundary area="Channel">
            <ChannelPage />
          </ErrorBoundary>
        )}

        {view === "stats" && (
          <ErrorBoundary area="Stats">
            <StatsPage />
          </ErrorBoundary>
        )}

        {view === "steam" && (
          <ErrorBoundary area="SteamStats">
            <SteamStats />
          </ErrorBoundary>
        )}

        {view === "queue" && (
          <ErrorBoundary area="Queue">
            <QueuePage
              queue={queue}
              running={queueRunning}
              onUpdateQueue={(q) => setQueue(q)}
              onSetRunning={setQueueRunning}
              onStart={handleQueueStart}
            />
          </ErrorBoundary>
        )}

        {/* Drag & drop overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm pointer-events-none animate-fadeIn">
            <div className="flex flex-col items-center gap-3 p-10 bg-surface/90 border-2 border-dashed border-accent rounded-2xl shadow-2xl">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-accent"
              >
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
              <p className="text-lg font-bold text-text-primary">
                Drop folder here
              </p>
              <p className="text-sm text-text-secondary">
                Release to add as a video source
              </p>
            </div>
          </div>
        )}
      </div>

      {uploadTarget && (
        <UploadDialog
          video={uploadTarget}
          queueStatus={
            queue.find((i) => i.videoPath === uploadTarget.path)?.status
          }
          gameProfiles={gameProfiles}
          onClose={() => setUploadTarget(null)}
          onUploadNow={(opts) => handleUploadNow(uploadTarget, opts)}
          onAddToQueue={(opts) => handleAddToQueueModal(uploadTarget, opts)}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenTagManagement={() => {
          setSettingsOpen(false);
          setTagManagementOpen(true);
        }}
        onOpenDevLogs={() => {
          setSettingsOpen(false);
          setDevLogsOpen(true);
        }}
      />
      <DevLogsPanel open={devLogsOpen} onClose={() => setDevLogsOpen(false)} />
      <FolderSettingsDialog
        folder={settingsFolder || ""}
        open={settingsFolder !== null}
        onClose={() => setSettingsFolder(null)}
        onSaved={() => {
          setSettingsFolder(null);
          handleRescan();
        }}
        onRemoveFolder={handleRemoveFolder}
      />
      {tagManagementOpen && (
        <TagManagementModal onClose={() => setTagManagementOpen(false)} />
      )}
      {cleanupModalOpen && (
        <UploadedCleanupModal
          open={cleanupModalOpen}
          uploadedVideos={videos.filter((v) => Boolean(v.youtubeId))}
          onClose={() => setCleanupModalOpen(false)}
          onDeleted={() => {
            setSelectedPaths([]);
            setSelectedIndex(-1);
            handleRescan();
            setCleanupModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
