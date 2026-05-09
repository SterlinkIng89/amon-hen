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

  const openVideo = (sortedIdx: number) => {
    setSelectedIndex(sortedIdx);
    setView("player");
  };

  const goTo = (i: number) => {
    if (i >= 0 && i < sortedVideos.length) setSelectedIndex(i);
  };

  const handleUploadNow = (video: VideoFile, opts: UploadOptions) => {
    UploadToYouTube(video.path, opts.title, opts.description, opts.privacy).catch(() => {});
  };

  const handleAddToQueue = (video: VideoFile, opts: UploadOptions) => {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoPath: video.path,
      videoName: video.name,
      title: opts.title,
      description: opts.description,
      privacy: opts.privacy,
      status: "pending",
      progress: 0,
    };
    setQueue(q => [...q, item]);
    setQueueOpen(true);
  };

  const pendingCount = queue.filter(i => i.status === "pending").length;

  return (
    <div className="app-shell">
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

      <div className="app-body">
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
            onToggleFolder={toggleFolder}
            onRemoveFolder={handleRemoveFolder}
            onOpenVideo={openVideo}
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
            onGoTo={goTo}
            onUploadTarget={setUploadTarget}
          />
        )}
      </div>

      {uploadTarget && (
        <UploadDialog
          video={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploadNow={opts => handleUploadNow(uploadTarget, opts)}
          onAddToQueue={opts => handleAddToQueue(uploadTarget, opts)}
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
