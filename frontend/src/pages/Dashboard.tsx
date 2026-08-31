import React, { useState, useEffect, useRef } from "react";
import {
  GetStreamPort,
  IsYouTubeAuthed,
  SaveVideoMetadata,
  SyncRecentVideos,
  UploadToYouTube,
  LoadConfig,
} from "../../wailsjs/go/backend/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

// Types & Utils
import { VideoFile, ViewMode, GameProfile } from "../types";
import { groupByDay } from "../utils/videoUtils";

// Global store
import { useAppStore } from "../store/useAppStore";

// Hooks
import { useVideoLibrary } from "../hooks/useVideoLibrary";
import { useAdvancedFilters } from "../components/ui/AdvancedFilters";

// UI
import AppHeader from "../components/layout/AppHeader";
import VideoGrid from "../components/video/VideoGrid";
import PlayerView from "../components/video/PlayerView";
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
import ErrorBoundary from "../components/ui/ErrorBoundary";

type SortMode = "date" | "name" | "size";

const MAX_CONCURRENT_UPLOADS = 3;

function applySortMode(videos: VideoFile[], mode: SortMode): VideoFile[] {
  const arr = [...videos];
  switch (mode) {
    case "name":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case "size":
      return arr.sort((a, b) => b.size - a.size);
    case "date":
    default:
      return arr.sort((a, b) => b.modTime - a.modTime);
  }
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
  const [streamPort, setStreamPort] = useState(0);
  const [uploadTarget, setUploadTarget] = useState<VideoFile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [lastSelectedIdx, setLastSelectedIdx] = useState(-1);
  const [devLogsOpen, setDevLogsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsFolder, setSettingsFolder] = useState<string | null>(null);
  const [gameProfiles, setGameProfiles] = useState<Record<string, GameProfile>>(
    {},
  );

  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        setGameProfiles(cfg.game_profiles || {});
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
  const sortedVideos = applySortMode(videos, sortMode as SortMode);

  const filteredByFolder =
    activeFolders.length === 0
      ? sortedVideos
      : sortedVideos.filter((v) => activeFolders.includes(v.folder));

  const filteredByUpload = filterUploaded
    ? filteredByFolder.filter((v) => !v.youtubeId)
    : filteredByFolder;

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

  // Apply date range filter (uses modTime unix timestamp → date string)
  const filteredByDate =
    libFilters.dateFrom || libFilters.dateTo
      ? filteredBySearch.filter((v) => {
          const d = new Date(v.modTime * 1000).toISOString().substring(0, 10);
          if (libFilters.dateFrom && d < libFilters.dateFrom) return false;
          if (libFilters.dateTo && d > libFilters.dateTo) return false;
          return true;
        })
      : filteredBySearch;

  // Apply exclude words filter (name, game, event)
  const filteredVideos =
    libFilters.excludeWords.length > 0
      ? filteredByDate.filter((v) => {
          const lowerWords = libFilters.excludeWords.map((w) =>
            w.toLowerCase(),
          );
          const haystack = [
            v.name,
            v.game || "",
            v.event || "",
            v.gameMode || "",
          ]
            .join(" ")
            .toLowerCase();
          return !lowerWords.some((w) => haystack.includes(w));
        })
      : filteredByDate;

  const groups = groupByDay(filteredVideos);
  const selectedVideo = selectedIndex >= 0 ? sortedVideos[selectedIndex] : null;

  // ── Init: stream port + YouTube auth ────────────────────────────────────────
  useEffect(() => {
    GetStreamPort().then(setStreamPort).catch(console.error);
    IsYouTubeAuthed()
      .then(setYtAuthed)
      .catch(() => {});

    const unsub = EventsOn("youtube:auth-complete", () => setYtAuthed(true));
    return () => {
      unsub();
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
        setLastSelectedIdx(-1);
      }
    }
  }, [view]);

  // ── Escape key: clear selection or search ────────────────────────────────────
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedPaths.length > 0) {
          setSelectedPaths([]);
          setLastSelectedIdx(-1);
        } else if (searchQuery) {
          setSearchQuery("");
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedPaths.length, searchQuery]);

  // ── Video click handler ──────────────────────────────────────────────────────
  const handleVideoClick = (filteredIdx: number, e: React.MouseEvent) => {
    const video = filteredVideos[filteredIdx];
    if (!video) return;

    // selectedIndex always tracks position in sortedVideos (the full list)
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

    if (e.shiftKey) {
      const anchorSortedIdx =
        lastSelectedIdx !== -1
          ? lastSelectedIdx
          : selectedIndex !== -1
            ? selectedIndex
            : 0;
      const anchorVideo = sortedVideos[anchorSortedIdx];

      const visibleStartIdx = filteredVideos.findIndex(
        (v) => v.path === anchorVideo?.path,
      );
      const visibleEndIdx = filteredIdx;

      if (visibleStartIdx !== -1 && visibleEndIdx !== -1) {
        const start = Math.min(visibleStartIdx, visibleEndIdx);
        const end = Math.max(visibleStartIdx, visibleEndIdx);
        for (let i = start; i <= end; i++) {
          const p = filteredVideos[i].path;
          if (!currentPaths.includes(p)) currentPaths.push(p);
        }
      }
      setSelectedPaths(currentPaths);
    } else if (e.ctrlKey || e.metaKey) {
      if (currentPaths.includes(video.path)) {
        currentPaths = currentPaths.filter((p) => p !== video.path);
      } else {
        currentPaths.push(video.path);
      }
      setSelectedPaths(currentPaths);
      setLastSelectedIdx(sortedIdx);
    } else {
      setSelectedPaths([]);
      setSelectedIndex(sortedIdx);
      setLastSelectedIdx(sortedIdx);
      setView("player");
    }
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
          sortMode={sortMode as SortMode}
          onSearchChange={setSearchQuery}
          onSortChange={setSortMode}
          onToggleFolder={toggleFolder}
          onOpenFolderSettings={setSettingsFolder}
          filterUploaded={filterUploaded}
          onToggleFilterUploaded={() => setFilterUploaded(!filterUploaded)}
          advancedFilters={libFilters.value}
          onAdvancedFiltersChange={libFilters.onChange}
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
            setLastSelectedIdx(-1);
          }}
          onRescanOnly={() => handleRescan()}
          onTagsSaved={() => {
            setSelectedPaths([]);
            handleRescan();
          }}
          onFilesDeleted={() => {
            setSelectedPaths([]);
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
              sortMode={sortMode as SortMode}
              selectedPaths={selectedPaths}
              onOpenVideo={handleVideoClick}
              onUploadTarget={setUploadTarget}
            />
          </ErrorBoundary>
        )}

        {view === "player" && streamPort > 0 && (
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
        )}

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
    </div>
  );
}
