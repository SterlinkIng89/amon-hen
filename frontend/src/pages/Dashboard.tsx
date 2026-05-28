import { useState, useEffect, useRef } from "react";
import {
  GetStreamPort,
  IsYouTubeAuthed,
  SaveVideoMetadata,
  UploadToYouTube,
} from "../../wailsjs/go/backend/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

// Types & Utils
import { VideoFile, ViewMode } from "../types";
import { groupByDay } from "../utils/videoUtils";

// Global store
import { useAppStore } from "../store/useAppStore";

// Hooks
import { useVideoLibrary } from "../hooks/useVideoLibrary";

// UI
import AppHeader from "../components/layout/AppHeader";
import VideoGrid from "../components/video/VideoGrid";
import PlayerView from "../components/video/PlayerView";
import ChannelPage from "./ChannelPage";
import UploadDialog, { UploadOptions } from "../components/youtube/UploadDialog";
import UploadQueue, { QueueItem } from "../components/youtube/UploadQueue";

import SettingsPanel from "../components/layout/SettingsPanel";
import BulkActionBar from "../components/video/BulkActionBar";
import DevLogsPanel from "../components/youtube/DevLogsPanel";
import FolderSettingsDialog from "../components/layout/FolderSettingsDialog";
import LibrarySubHeader from "../components/video/LibrarySubHeader";
import ErrorBoundary from "../components/ui/ErrorBoundary";

type SortMode = "date" | "name" | "size";

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
    queue, setQueue, addToQueue, queueOpen, setQueueOpen, queueRunning, setQueueRunning,
    ytAuthed, setYtAuthed,
    view, setView,
    sortMode, setSortMode,
    filterUploaded, setFilterUploaded,
    selectedIndex, setSelectedIndex,
  } = useAppStore();

  // ── Video library hook ───────────────────────────────────────────────────────
  const {
    videos, folders, activeFolders, scanning, error,
    isDraggingOver, handleAddFolder, handleRemoveFolder, handleRescan, toggleFolder,
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

  const restoredIndexRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [listRoot, setListRoot] = useState<HTMLElement | null>(null);

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

  const filteredVideos = searchQuery
    ? filteredByUpload.filter(
        (v) =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.game && v.game.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : filteredByUpload;

  const groups = groupByDay(filteredVideos);
  const selectedVideo = selectedIndex >= 0 ? sortedVideos[selectedIndex] : null;

  // ── Init: stream port + YouTube auth ────────────────────────────────────────
  useEffect(() => {
    GetStreamPort().then(setStreamPort).catch(console.error);
    IsYouTubeAuthed().then(setYtAuthed).catch(() => {});

    EventsOn("youtube:auth-complete", () => setYtAuthed(true));
    return () => { EventsOff("youtube:auth-complete"); };
  }, []);

  // ── Restore selectedIndex once videos are loaded (once only) ─────────────────
  useEffect(() => {
    if (videos.length === 0 || restoredIndexRef.current) return;
    restoredIndexRef.current = true;
    if (view === "player" && selectedIndex >= 0 && selectedIndex < sortedVideos.length) {
      // Already restored from store — nothing to do
    } else {
      setView(view === "channel" ? "channel" : view === "player" ? "grid" : view);
    }
  }, [videos]);

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
  const handleVideoClick = (sortedIdx: number, e: React.MouseEvent) => {
    const video = sortedVideos[sortedIdx];

    let currentPaths = [...selectedPaths];
    if (
      view === "player" &&
      currentPaths.length === 0 &&
      (e.shiftKey || e.ctrlKey || e.metaKey)
    ) {
      if (selectedIndex !== -1) {
        currentPaths.push(sortedVideos[selectedIndex].path);
      }
    }

    if (e.shiftKey) {
      const anchorIdx =
        lastSelectedIdx !== -1 ? lastSelectedIdx : selectedIndex !== -1 ? selectedIndex : 0;
      const start = Math.min(anchorIdx, sortedIdx);
      const end = Math.max(anchorIdx, sortedIdx);
      for (let i = start; i <= end; i++) {
        const p = sortedVideos[i].path;
        if (!currentPaths.includes(p)) currentPaths.push(p);
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

  // ── Upload helpers ───────────────────────────────────────────────────────────
  const handleAddToQueue = (item: QueueItem) => {

    if (item.status === "uploading") {
      setQueue((q) => [item, ...q]);
      setQueueOpen(true);
      setQueueRunning(true);
    } else {
      setQueue((q) => [...q, item]);
      setQueueOpen(true);
    }
  };

  const handleUploadNow = async (video: VideoFile, opts: UploadOptions) => {
    await SaveVideoMetadata(
      video.path, video.game || "", opts.title, opts.description,
      opts.privacy, opts.playlistId || "", video.episode || 0,
    ).catch(console.error);

    handleAddToQueue({
      id: crypto.randomUUID(), videoPath: video.path, videoName: video.name,
      title: opts.title, description: opts.description, privacy: opts.privacy,
      status: "uploading", progress: 0, playlistId: opts.playlistId,
      gameTag: video.game, episode: video.episode,
    });

    UploadToYouTube(
      video.path, opts.title, opts.description, opts.privacy,
      opts.playlistId || "", video.game || "", video.episode || 0,
    ).catch(() => {});

    handleRescan();
  };

  const handleAddToQueueModal = async (video: VideoFile, opts: UploadOptions) => {
    await SaveVideoMetadata(
      video.path, video.game || "", opts.title, opts.description,
      opts.privacy, opts.playlistId || "", video.episode || 0,
    ).catch(console.error);

    setQueue((q) => [
      ...q,
      {
        id: crypto.randomUUID(), videoPath: video.path, videoName: video.name,
        title: opts.title, description: opts.description, privacy: opts.privacy,
        status: "pending", progress: 0, playlistId: opts.playlistId,
        gameTag: video.game, episode: video.episode,
      },
    ]);
    handleRescan();
  };

  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const isSelecting = selectedPaths.length > (view === "player" ? 1 : 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        view={view as ViewMode}
        foldersCount={folders.length}
        scanning={scanning}
        pendingCount={pendingCount}
        ytAuthed={ytAuthed}
        onSetView={setView}
        onRescan={handleRescan}
        onToggleQueue={() => setQueueOpen(!queueOpen)}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddFolder={handleAddFolder}
        onOpenDevLogs={() => setDevLogsOpen(true)}
      />

      {(view === "grid" || view === "player") && (
        <LibrarySubHeader
          folders={folders}
          activeFolders={activeFolders}
          allVideos={sortedVideos}
          searchQuery={searchQuery}
          sortMode={sortMode as SortMode}
          onSearchChange={setSearchQuery}
          onSortChange={setSortMode}
          onToggleFolder={toggleFolder}
          onRemoveFolder={handleRemoveFolder}
          onOpenFolderSettings={setSettingsFolder}
          filterUploaded={filterUploaded}
          onToggleFilterUploaded={() => setFilterUploaded(!filterUploaded)}
        />
      )}

      {/* Bulk action bar */}
      {isSelecting && (
        <BulkActionBar
          selectedPaths={selectedPaths}
          selectedVideos={selectedPaths.map(p => sortedVideos.find(v => v.path === p)).filter((v): v is VideoFile => v !== undefined)}
          onClearSelection={() => { setSelectedPaths([]); setLastSelectedIdx(-1); }}
          onTagsSaved={() => { setSelectedPaths([]); handleRescan(); }}
          onFilesDeleted={() => { setSelectedPaths([]); setSelectedIndex(-1); handleRescan(); }}
          onAddToQueue={(items) => { setQueue(q => [...q, ...items]); setQueueOpen(true); }}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {error && (
          <div style={{ padding: "16px", color: "#f87171", background: "rgba(248,113,113,0.1)", textAlign: "center" }}>
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
              onFilesDeleted={() => { setSelectedIndex(-1); handleRescan(); }}
              onAddToQueue={handleAddToQueue}
            />
          </ErrorBoundary>
        )}

        {view === "channel" && (
          <ErrorBoundary area="Channel">
            <ChannelPage />
          </ErrorBoundary>
        )}

        {/* Drag & drop overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm pointer-events-none animate-fadeIn">
            <div className="flex flex-col items-center gap-3 p-10 bg-surface/90 border-2 border-dashed border-accent rounded-2xl shadow-2xl">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
              <p className="text-lg font-bold text-text-primary">Drop folder here</p>
              <p className="text-sm text-text-secondary">Release to add as a video source</p>
            </div>
          </div>
        )}
      </div>

      {uploadTarget && (
        <UploadDialog
          video={uploadTarget}
          queueStatus={queue.find(i => i.videoPath === uploadTarget.path)?.status}
          onClose={() => setUploadTarget(null)}
          onUploadNow={(opts) => handleUploadNow(uploadTarget, opts)}
          onAddToQueue={(opts) => handleAddToQueueModal(uploadTarget, opts)}
        />
      )}

      {queueOpen && (
        <UploadQueue
          open={queueOpen}
          queue={queue}
          running={queueRunning}
          onClose={() => setQueueOpen(false)}
          onUpdateQueue={(q) => setQueue(q)}
          onSetRunning={setQueueRunning}
        />
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <DevLogsPanel open={devLogsOpen} onClose={() => setDevLogsOpen(false)} />

      <FolderSettingsDialog
        folder={settingsFolder || ""}
        open={settingsFolder !== null}
        onClose={() => setSettingsFolder(null)}
        onSaved={() => { setSettingsFolder(null); handleRescan(); }}
      />
    </div>
  );
}
