import { useState, useEffect, useRef, useCallback } from "react";
import {
  GetVideosFromFolders,
  GetStreamPort,
  AddFolder,
  RemoveFolder,
  LoadConfig,
  IsYouTubeAuthed,
  UploadToYouTube,
} from "../../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

// Types & Utils
import { VideoFile, ViewMode } from "../types";
import { groupByDay } from "../utils/videoUtils";

// Sub-components
import AppHeader from "../components/layout/AppHeader";
import VideoGrid from "../components/video/VideoGrid";
import PlayerView from "../components/video/PlayerView";
import UploadDialog, { UploadOptions } from "../components/youtube/UploadDialog";
import UploadQueue, { QueueItem } from "../components/youtube/UploadQueue";
import SettingsPanel from "../components/layout/SettingsPanel";
import BulkActionBar from "../components/video/BulkActionBar";

export default function Dashboard() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolders, setActiveFolders] = useState<string[]>([]);
  const [streamPort, setStreamPort] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [uploadTarget, setUploadTarget] = useState<VideoFile | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ytAuthed, setYtAuthed] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [lastSelectedIdx, setLastSelectedIdx] = useState(-1);

  const listRef = useRef<HTMLDivElement>(null);
  const [listRoot, setListRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (listRef.current) setListRoot(listRef.current);
  }, []);

  // Derived state
  const sortedVideos = [...videos].sort((a, b) => b.modTime - a.modTime);
  const filteredVideos =
    activeFolders.length === 0
      ? sortedVideos
      : sortedVideos.filter(v => activeFolders.includes(v.folder));
  const groups = groupByDay(filteredVideos);
  const selectedVideo = selectedIndex >= 0 ? sortedVideos[selectedIndex] : null;

  // Load config on mount
  useEffect(() => {
    GetStreamPort().then(setStreamPort).catch(console.error);
    IsYouTubeAuthed().then(setYtAuthed).catch(() => {});
    LoadConfig()
      .then(cfg => {
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

  const scanFolders = useCallback(async (foldersToScan: string[]) => {
    if (foldersToScan.length === 0) return;
    setScanning(true);
    setError("");
    try {
      const result = await GetVideosFromFolders(foldersToScan);
      const list = result ?? [];
      setVideos(list);
      if (list.length === 0) setError("No videos found in the selected folders.");
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
    const updated = folders.filter(f => f !== path);
    setFolders(updated);
    setActiveFolders(a => a.filter(f => f !== path));
    await scanFolders(updated);
  };

  const handleRescan = () => scanFolders(folders);

  const toggleFolder = (path: string) => {
    setActiveFolders(prev =>
      prev.includes(path) ? prev.filter(f => f !== path) : [...prev, path]
    );
  };

  // Unified click handler used in BOTH grid and player views
  const handleVideoClick = (sortedIdx: number, e: React.MouseEvent) => {
    const video = sortedVideos[sortedIdx];
    if (e.shiftKey && lastSelectedIdx !== -1) {
      const start = Math.min(lastSelectedIdx, sortedIdx);
      const end = Math.max(lastSelectedIdx, sortedIdx);
      const newPaths = [...selectedPaths];
      for (let i = start; i <= end; i++) {
        const p = sortedVideos[i].path;
        if (!newPaths.includes(p)) newPaths.push(p);
      }
      setSelectedPaths(newPaths);
    } else if (e.ctrlKey || e.metaKey) {
      if (selectedPaths.includes(video.path)) {
        setSelectedPaths(selectedPaths.filter(p => p !== video.path));
      } else {
        setSelectedPaths([...selectedPaths, video.path]);
      }
      setLastSelectedIdx(sortedIdx);
    } else {
      // Plain click: clear selection, open player
      setSelectedPaths([]);
      setSelectedIndex(sortedIdx);
      setView("player");
    }
  };

  const goTo = (i: number) => {
    if (i >= 0 && i < sortedVideos.length) setSelectedIndex(i);
  };

  const handleAddToQueue = (item: QueueItem) => {
    if (item.status === "uploading") {
      setQueue(q => [item, ...q]);
      setQueueOpen(true);
      setQueueRunning(true);
    } else {
      setQueue(q => [...q, item]);
      setQueueOpen(true);
    }
  };

  // Legacy modal path (used from grid card hover button)
  const handleUploadNow = (video: VideoFile, opts: UploadOptions) => {
    handleAddToQueue({
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      title: opts.title,
      description: opts.description,
      privacy: opts.privacy,
      status: "uploading",
      progress: 0,
    });
    UploadToYouTube(video.path, opts.title, opts.description, opts.privacy).catch(() => {});
  };

  const handleAddToQueueModal = (video: VideoFile, opts: UploadOptions) => {
    handleAddToQueue({
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      title: opts.title,
      description: opts.description,
      privacy: opts.privacy,
      status: "pending",
      progress: 0,
    });
  };

  const pendingCount = queue.filter(i => i.status === "pending").length;
  const isSelecting = selectedPaths.length > 0;

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
        onToggleQueue={() => setQueueOpen(o => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddFolder={handleAddFolder}
      />

      {/* Bulk action bar — shown in BOTH views when items are selected */}
      {isSelecting && (
        <BulkActionBar
          selectedPaths={selectedPaths}
          onClearSelection={() => { setSelectedPaths([]); setLastSelectedIdx(-1); }}
          onTagsSaved={() => { setSelectedPaths([]); handleRescan(); }}
          onFilesDeleted={() => { setSelectedPaths([]); setSelectedIndex(-1); handleRescan(); }}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {error && (
          <div style={{ padding: "16px", color: "#f87171", background: "rgba(248,113,113,0.1)", textAlign: "center" }}>
            {error}
          </div>
        )}

        {view === "grid" && (
          <VideoGrid
            folders={folders}
            activeFolders={activeFolders}
            groups={groups}
            sortedVideos={sortedVideos}
            selectedPaths={selectedPaths}
            onToggleFolder={toggleFolder}
            onRemoveFolder={handleRemoveFolder}
            onOpenVideo={handleVideoClick}
            onUploadTarget={setUploadTarget}
          />
        )}

        {view === "player" && streamPort > 0 && (
          <PlayerView
            sortedVideos={sortedVideos}
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
            onAddToQueue={handleAddToQueue}
          />
        )}
      </div>

      {uploadTarget && (
        <UploadDialog
          video={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploadNow={opts => handleUploadNow(uploadTarget, opts)}
          onAddToQueue={opts => handleAddToQueueModal(uploadTarget, opts)}
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

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
