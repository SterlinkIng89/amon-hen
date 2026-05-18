import { useState, useEffect, useRef, useCallback } from "react";
import {
  GetVideosFromFolders,
  GetStreamPort,
  AddFolder,
  RemoveFolder,
  LoadConfig,
  IsYouTubeAuthed,
  UploadToYouTube,
  SaveVideoMetadata,
  SaveFolders,
} from "../../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

// Types & Utils
import { VideoFile, ViewMode } from "../types";
import { groupByDay } from "../utils/videoUtils";

import AppHeader from "../components/layout/AppHeader";
import VideoGrid from "../components/video/VideoGrid";
import PlayerView from "../components/video/PlayerView";
import ChannelPage from "./ChannelPage";
import UploadDialog, {
  UploadOptions,
} from "../components/youtube/UploadDialog";
import UploadQueue, { QueueItem } from "../components/youtube/UploadQueue";
import SettingsPanel from "../components/layout/SettingsPanel";
import BulkActionBar from "../components/video/BulkActionBar";
import DevLogsPanel from "../components/youtube/DevLogsPanel";
import FolderSettingsDialog from "../components/layout/FolderSettingsDialog";
import LibrarySubHeader from "../components/video/LibrarySubHeader";

type SortMode = "date" | "name" | "size";

// ─── Persistence helpers ────────────────────────────────────────────────────

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

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
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolders, setActiveFolders] = useState<string[]>([]);
  const [streamPort, setStreamPort] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>(() => loadPref("pref_view", "grid" as ViewMode));
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [uploadTarget, setUploadTarget] = useState<VideoFile | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ytAuthed, setYtAuthed] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [lastSelectedIdx, setLastSelectedIdx] = useState(-1);
  const [devLogsOpen, setDevLogsOpen] = useState(false);
  const [filterUploaded, setFilterUploaded] = useState(() => loadPref("pref_filter_uploaded", false));
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(() => loadPref("pref_sort_mode", "date" as SortMode));
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [settingsFolder, setSettingsFolder] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const listRef = useRef<HTMLDivElement>(null);
  const [listRoot, setListRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (listRef.current) setListRoot(listRef.current);
  }, []);

  // Persist view + filter preferences whenever they change
  useEffect(() => { savePref("pref_view", view); }, [view]);
  useEffect(() => { savePref("pref_filter_uploaded", filterUploaded); }, [filterUploaded]);
  useEffect(() => { savePref("pref_sort_mode", sortMode); }, [sortMode]);

  // Restore selectedIndex after first successful scan
  const restoredIndexRef = useRef(false);

  // Derived state — apply sort + search + folder + upload filters
  const sortedVideos = applySortMode(videos, sortMode);

  const filteredByFolder =
    activeFolders.length === 0
      ? sortedVideos
      : sortedVideos.filter((v) => activeFolders.includes(v.folder));

  const filteredByUpload = filterUploaded
    ? filteredByFolder.filter((v) => !v.youtubeId)
    : filteredByFolder;

  const filteredVideos = searchQuery
    ? filteredByUpload.filter(v =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.game && v.game.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : filteredByUpload;

  const groups = groupByDay(filteredVideos);
  const selectedVideo = selectedIndex >= 0 ? sortedVideos[selectedIndex] : null;

  // Load config on mount
  useEffect(() => {
    GetStreamPort().then(setStreamPort).catch(console.error);
    IsYouTubeAuthed()
      .then(setYtAuthed)
      .catch(() => {});
    LoadConfig()
      .then((cfg) => {
        const savedFolders = cfg.folders ?? [];
        if (savedFolders.length > 0) {
          setFolders(savedFolders);
          scanFolders(savedFolders);
        }
      })
      .catch(console.error);

    EventsOn("youtube:auth-complete", () => setYtAuthed(true));
    return () => {
      EventsOff("youtube:auth-complete");
    };
  }, []);

  // Restore selectedIndex once videos are loaded (only once)
  useEffect(() => {
    if (videos.length === 0 || restoredIndexRef.current) return;
    restoredIndexRef.current = true;
    const saved = loadPref("pref_selected_index", -1);
    const savedView = loadPref<ViewMode>("pref_view", "grid");
    if (savedView === "player" && saved >= 0 && saved < sortedVideos.length) {
      setSelectedIndex(saved);
      setView("player");
    } else {
      // Fallback to grid if index is out of range
      setView(savedView === "channel" ? "channel" : "grid");
    }
  }, [videos]);

  // Persist selectedIndex on change
  useEffect(() => {
    savePref("pref_selected_index", selectedIndex);
  }, [selectedIndex]);

  // Clear selection + search on Escape
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

  // ─── Drag & drop folder support ──────────────────────────────────────────

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      // Only react to file drags
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCounterRef.current += 1;
      setIsDraggingOver(true);
    };
    const onDragLeave = () => {
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      const items = Array.from(e.dataTransfer?.items ?? []);
      const dirs: string[] = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          // In Wails/Electron the full path is available via .file()
          const file = item.getAsFile();
          if (file) {
            // @ts-ignore — Wails exposes the real FS path
            const p: string = file.path ?? "";
            if (p) dirs.push(p);
          }
        }
      }
      if (dirs.length === 0) return;
      const updated = [...folders];
      for (const d of dirs) {
        if (!updated.includes(d)) updated.push(d);
      }
      await SaveFolders(updated);
      setFolders(updated);
      await scanFolders(updated);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [folders]);

  const scanFolders = useCallback(async (foldersToScan: string[]) => {
    if (foldersToScan.length === 0) return;
    setScanning(true);
    setError("");
    try {
      const result = await GetVideosFromFolders(foldersToScan);
      const list = result ?? [];
      setVideos(list);
      if (list.length === 0)
        setError("No videos found in the selected folders.");
    } catch (e: any) {
      setError(`Scan failed: ${e?.message ?? e}`);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleAddFolder = async () => {
    try {
      const dir = await AddFolder();
      if (!dir) return;
      const updated = folders.includes(dir) ? folders : [...folders, dir];
      setFolders(updated);
      await scanFolders(updated);
    } catch {
      setError("Failed to add folder.");
    }
  };

  const handleRemoveFolder = async (path: string) => {
    await RemoveFolder(path);
    const updated = folders.filter((f) => f !== path);
    setFolders(updated);
    setActiveFolders((a) => a.filter((f) => f !== path));
    await scanFolders(updated);
  };

  const handleRescan = () => scanFolders(folders);

  const toggleFolder = (path: string) => {
    setActiveFolders((prev) =>
      prev.includes(path) ? prev.filter((f) => f !== path) : [...prev, path],
    );
  };

  // Unified click handler used in BOTH grid and player views
  const handleVideoClick = (sortedIdx: number, e: React.MouseEvent) => {
    const video = sortedVideos[sortedIdx];

    // Auto-include the currently playing video if we are in player view and starting a multi-selection
    let currentPaths = [...selectedPaths];
    if (
      view === "player" &&
      currentPaths.length === 0 &&
      (e.shiftKey || e.ctrlKey || e.metaKey)
    ) {
      if (selectedIndex !== -1) {
        const currentPlaying = sortedVideos[selectedIndex].path;
        currentPaths.push(currentPlaying);
      }
    }

    if (e.shiftKey) {
      const anchorIdx =
        lastSelectedIdx !== -1
          ? lastSelectedIdx
          : selectedIndex !== -1
            ? selectedIndex
            : 0;
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
      // Plain click: clear selection, open player
      setSelectedPaths([]);
      setSelectedIndex(sortedIdx);
      setLastSelectedIdx(sortedIdx);
      setView("player");
    }
  };

  const goTo = (i: number) => {
    if (i >= 0 && i < sortedVideos.length) setSelectedIndex(i);
  };

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

  // Legacy modal path (used from grid card hover button)
  const handleUploadNow = async (video: VideoFile, opts: UploadOptions) => {
    await SaveVideoMetadata(
      video.path,
      video.game || "",
      opts.title,
      opts.description,
      opts.privacy,
      opts.playlistId || "",
      video.episode || 0,
    ).catch(console.error);

    handleAddToQueue({
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
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

  const handleAddToQueueModal = async (video: VideoFile, opts: UploadOptions) => {
    await SaveVideoMetadata(
      video.path,
      video.game || "",
      opts.title,
      opts.description,
      opts.privacy,
      opts.playlistId || "",
      video.episode || 0,
    ).catch(console.error);

    setQueue((q) => [
      ...q,
      {
        id: crypto.randomUUID(),
        videoPath: video.path,
        videoName: video.name,
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
    handleRescan();
  };

  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const isSelecting = selectedPaths.length > (view === "player" ? 1 : 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        view={view}
        foldersCount={folders.length}
        scanning={scanning}
        pendingCount={pendingCount}
        ytAuthed={ytAuthed}
        onSetView={setView}
        onRescan={handleRescan}
        onToggleQueue={() => setQueueOpen((o) => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddFolder={handleAddFolder}
        onOpenDevLogs={() => setDevLogsOpen(true)}
      />

      {/* Bulk action bar — shown in BOTH views when items are selected */}
      {isSelecting && (
        <BulkActionBar
          selectedPaths={selectedPaths}
          selectedVideos={sortedVideos.filter((v) => selectedPaths.includes(v.path))}
          onClearSelection={() => {
            setSelectedPaths([]);
            setLastSelectedIdx(-1);
          }}
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
            setQueue((prev) => [...prev, ...items]);
            setQueueOpen(true);
          }}
        />
      )}

      {(view === "grid" || view === "player") && (
        <LibrarySubHeader
          folders={folders}
          activeFolders={activeFolders}
          allVideos={sortedVideos}
          searchQuery={searchQuery}
          sortMode={sortMode}
          onSearchChange={setSearchQuery}
          onSortChange={setSortMode}
          onToggleFolder={toggleFolder}
          onRemoveFolder={handleRemoveFolder}
          onOpenFolderSettings={setSettingsFolder}
          filterUploaded={filterUploaded}
          onToggleFilterUploaded={() => setFilterUploaded((u) => !u)}
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
        )}

        {view === "player" && streamPort > 0 && (
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
        )}

        {view === "channel" && <ChannelPage />}

        {/* Drag & drop overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm pointer-events-none animate-fadeIn">
            <div className="flex flex-col items-center gap-3 p-10 bg-surface/90 border-2 border-dashed border-accent rounded-2xl shadow-2xl">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
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
          onUpdateQueue={setQueue}
          onSetRunning={setQueueRunning}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <DevLogsPanel
        open={devLogsOpen}
        onClose={() => setDevLogsOpen(false)}
      />

      <FolderSettingsDialog
        folder={settingsFolder || ""}
        open={settingsFolder !== null}
        onClose={() => setSettingsFolder(null)}
        onSaved={() => {
          setSettingsFolder(null);
          handleRescan();
        }}
      />
    </div>
  );
}
