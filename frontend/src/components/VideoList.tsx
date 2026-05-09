import { useState, useEffect, useRef, useCallback } from "react";
import {
  GetVideosFromFolders, GetVideoPreview, GetThumbnail,
  GetStreamPort, AddFolder, RemoveFolder, LoadConfig,
  IsYouTubeAuthed, UploadToYouTube,
} from "../../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import UploadDialog, { UploadOptions } from "./UploadDialog";
import UploadQueue, { QueueItem } from "./UploadQueue";
import SettingsPanel from "./SettingsPanel";

interface VideoFile {
  name: string; path: string; size: number; modTime: number; folder: string;
}
interface VideoGroup { label: string; dateKey: string; videos: VideoFile[]; }

function formatSize(b: number) {
  return b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB" : (b / 1048576).toFixed(2) + " MB";
}
function formatName(n: string) { return n.replace(/\.[^/.]+$/, ""); }
function toLocalDateKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatGroupLabel(k: string) {
  const today = toLocalDateKey(Date.now());
  const yesterday = toLocalDateKey(Date.now() - 86400000);
  if (k === today) return "Today";
  if (k === yesterday) return "Yesterday";
  const [y,m,d] = k.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
function groupByDay(videos: VideoFile[]): VideoGroup[] {
  const sorted = [...videos].sort((a,b) => b.modTime - a.modTime);
  const map = new Map<string, VideoFile[]>();
  for (const v of sorted) {
    const k = toLocalDateKey(v.modTime);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(v);
  }
  return Array.from(map.entries()).map(([dateKey, vs]) => ({ dateKey, label: formatGroupLabel(dateKey), videos: vs }));
}
function useInView(ref: React.RefObject<HTMLElement|null>, root?: HTMLElement|null) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { root: root??null, rootMargin:"300px 0px" });
    obs.observe(el); return () => obs.disconnect();
  }, [root]);
  return inView;
}

// --- VideoCard ---
const VideoCard = ({ video, onClick, onUpload }: { video: VideoFile; onClick: () => void; onUpload: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [sprite, setSprite] = useState(""); const [thumb, setThumb] = useState(""); const [bgPos, setBgPos] = useState("0% 0%");
  const [hovered, setHovered] = useState(false); const [thumbLoaded, setThumbLoaded] = useState(false); const [spriteLoaded, setSpriteLoaded] = useState(false);
  useEffect(() => {
    if (!inView) return;
    GetThumbnail(video.path).then(d => { if (d) setThumb(d); }).catch(()=>{}).finally(()=>setThumbLoaded(true));
    GetVideoPreview(video.path).then(d => { if (d) setSprite(d); }).catch(()=>{}).finally(()=>setSpriteLoaded(true));
  }, [inView, video.path]);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sprite) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const frame = Math.floor(pct * 25); const col = frame % 5; const row = Math.floor(frame / 5);
    setBgPos(`${(col/4)*100}% ${(row/4)*100}%`);
  };
  return (
    <div ref={ref} className="video-card" onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setBgPos("0% 0%"); }}>
      <div className="video-card-thumb" onMouseMove={handleMouseMove}>
        {!thumbLoaded && <div className="thumb-skeleton" />}
        {sprite && hovered ? (
          <div className="thumb-sprite" style={{ backgroundImage:`url(${sprite})`, backgroundSize:"500% 500%", backgroundPosition:bgPos }} />
        ) : thumb ? <img src={thumb} alt={video.name} className="thumb-img" /> : null}
        <div className={`play-overlay ${hovered?"visible":""}`}><div className="play-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div>
        {hovered && !spriteLoaded && thumbLoaded && <div className="sprite-loading"><div className="spinner-sm"/></div>}
        {hovered && (
          <button className="card-upload-btn" title="Upload to YouTube" onClick={e => { e.stopPropagation(); onUpload(); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
          </button>
        )}
      </div>
      <div className="video-card-info">
        <p className="video-title" title={formatName(video.name)}>{formatName(video.name)}</p>
        <p className="video-meta">{formatSize(video.size)}</p>
      </div>
    </div>
  );
};

// --- VideoListItem ---
const VideoListItem = ({ video, index, selected, scrollRoot, onClick }: { video: VideoFile; index: number; selected: boolean; scrollRoot: HTMLElement|null; onClick: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, scrollRoot);
  const [thumb, setThumb] = useState(""); const [thumbLoaded, setThumbLoaded] = useState(false);
  useEffect(() => {
    if (!inView) return;
    GetThumbnail(video.path).then(d => { if (d) setThumb(d); }).catch(()=>{}).finally(()=>setThumbLoaded(true));
  }, [inView, video.path]);
  return (
    <div ref={ref} className={`list-item ${selected?"list-item--selected":""}`} onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key==="Enter"&&onClick()}>
      <span className="list-item-index">{index+1}</span>
      <div className="list-item-thumb">
        {thumbLoaded && thumb ? <img src={thumb} alt={video.name} className="list-item-img"/> : <div className={`list-item-skeleton ${thumbLoaded?"loaded":""}`}/>}
        {selected && <div className="list-item-playing"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>}
      </div>
      <div className="list-item-info">
        <span className="list-item-name" title={formatName(video.name)}>{formatName(video.name)}</span>
        <div className="list-item-meta"><span>{formatSize(video.size)}</span></div>
      </div>
    </div>
  );
};

// --- InlinePlayer ---
const InlinePlayer = ({ video, streamPort, onPrev, onNext, onUpload }: { video: VideoFile; streamPort: number; onPrev: (()=>void)|null; onNext: (()=>void)|null; onUpload: ()=>void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = `http://127.0.0.1:${streamPort}/stream?path=${encodeURIComponent(video.path)}`;
  useEffect(() => { const el = videoRef.current; if (!el) return; el.load(); el.play().catch(()=>{}); }, [video.path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key==="ArrowLeft"&&onPrev) onPrev(); if (e.key==="ArrowRight"&&onNext) onNext(); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);
  return (
    <div className="player-wrap">
      <div className="player-video-area">
        <video ref={videoRef} key={video.path} src={src} controls className="player-video" autoPlay/>
      </div>
      <div className="player-info">
        <h2 className="player-title" title={video.name}>{formatName(video.name)}</h2>
        <div className="player-meta-row">
          <span className="player-meta-size">{formatSize(video.size)}</span>
          <span className="player-meta-path" title={video.path}>{video.path}</span>
          <button className="btn btn-ghost btn-sm player-upload-btn" onClick={onUpload} title="Upload to YouTube">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
            Upload
          </button>
        </div>
      </div>
      <div className="player-nav">
        <button className="btn btn-ghost player-nav-btn" onClick={onPrev??undefined} disabled={!onPrev} title="Previous (←)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          Previous
        </button>
        <button className="btn btn-ghost player-nav-btn" onClick={onNext??undefined} disabled={!onNext} title="Next (→)">
          Next
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z"/></svg>
        </button>
      </div>
    </div>
  );
};

// --- Main ---
type ViewMode = "grid"|"player";

export default function VideoList() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolders, setActiveFolders] = useState<string[]>([]);
  const [streamPort, setStreamPort] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [uploadTarget, setUploadTarget] = useState<VideoFile|null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ytAuthed, setYtAuthed] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const [listRoot, setListRoot] = useState<HTMLElement|null>(null);
  useEffect(() => { if (listRef.current) setListRoot(listRef.current); }, []);

  const sortedVideos = [...videos].sort((a,b) => b.modTime - a.modTime);
  const filteredVideos = activeFolders.length === 0
    ? sortedVideos
    : sortedVideos.filter(v => activeFolders.includes(v.folder));
  const groups = groupByDay(filteredVideos);
  const selectedVideo = selectedIndex >= 0 ? sortedVideos[selectedIndex] : null;

  // Load config on mount
  useEffect(() => {
    GetStreamPort().then(setStreamPort).catch(console.error);
    IsYouTubeAuthed().then(setYtAuthed).catch(()=>{});
    LoadConfig().then(cfg => {
      const savedFolders = cfg.folders ?? [];
      if (savedFolders.length > 0) {
        setFolders(savedFolders);
        scanFolders(savedFolders);
      }
    }).catch(console.error);

    EventsOn("youtube:auth-complete", () => setYtAuthed(true));
    return () => { EventsOff("youtube:auth-complete"); };
  }, []);

  const scanFolders = useCallback(async (foldersToScan: string[]) => {
    if (foldersToScan.length === 0) return;
    setScanning(true); setError("");
    try {
      const result = await GetVideosFromFolders(foldersToScan);
      const list = result ?? [];
      setVideos(list);
      if (list.length === 0) setError("No videos found in the selected folders.");
    } catch (e: any) { setError(`Scan failed: ${e?.message ?? e}`); }
    finally { setScanning(false); }
  }, []);

  const handleAddFolder = async () => {
    try {
      const dir = await AddFolder();
      if (!dir) return;
      const updated = folders.includes(dir) ? folders : [...folders, dir];
      setFolders(updated);
      await scanFolders(updated);
    } catch { setError("Failed to add folder."); }
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
    setActiveFolders(prev => prev.includes(path) ? prev.filter(f=>f!==path) : [...prev, path]);
  };

  const openVideo = (sortedIdx: number) => { setSelectedIndex(sortedIdx); setView("player"); };
  const goTo = (i: number) => { if (i>=0 && i<sortedVideos.length) setSelectedIndex(i); };

  const handleUploadNow = (video: VideoFile, opts: UploadOptions) => {
    UploadToYouTube(video.path, opts.title, opts.description, opts.privacy).catch(()=>{});
  };

  const handleAddToQueue = (video: VideoFile, opts: UploadOptions) => {
    const item: QueueItem = {
      id: crypto.randomUUID(), videoPath: video.path, videoName: video.name,
      title: opts.title, description: opts.description, privacy: opts.privacy,
      status: "pending", progress: 0,
    };
    setQueue(q => [...q, item]);
    setQueueOpen(true);
  };

  const pendingCount = queue.filter(i => i.status === "pending").length;

  // Header left slot
  const headerLeft = view === "player" ? (
    <button className="back-btn" onClick={() => setView("grid")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      <span className="back-label">Library</span>
    </button>
  ) : (
    <div className="header-brand">
      <div className="brand-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg></div>
      <span className="brand-name">Amon Hen</span>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        {headerLeft}
        <div className="header-actions">
          {folders.length > 0 && !scanning && (
            <button className="btn btn-ghost" onClick={handleRescan}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
              Rescan
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setQueueOpen(o => !o)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
            Queue{pendingCount > 0 && <span className="header-badge">{pendingCount}</span>}
          </button>
          <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            {ytAuthed && <span className="yt-dot" title="YouTube connected" />}
          </button>
          <button className="btn btn-primary" onClick={handleAddFolder} disabled={scanning}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            {scanning ? "Scanning..." : "Add Folder"}
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* GRID VIEW */}
        {view === "grid" && (
          <div className="grid-view">
            {folders.length === 0 && !scanning && (
              <div className="app-center">
                <div className="empty-state">
                  <div className="empty-icon"><svg width="50" height="50" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg></div>
                  <h2 className="empty-title">No folders added</h2>
                  <p className="empty-desc">Add a folder to scan for videos</p>
                  <button className="btn btn-primary btn-lg" onClick={handleAddFolder}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                    Add Folder
                  </button>
                </div>
              </div>
            )}
            {scanning && <div className="app-center"><div className="scanning-state"><div className="spinner"/><p>Scanning...</p></div></div>}
            {error && !scanning && (
              <div className="app-center">
                <div className="state-with-error">
                  <div className="error-banner"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>{error}</div>
                </div>
              </div>
            )}

            {folders.length > 0 && !scanning && (
              <>
                {/* Folder filter bar */}
                <div className="folder-bar">
                  <button className={`folder-chip ${activeFolders.length===0?"folder-chip--all-active":""}`} onClick={() => setActiveFolders([])}>
                    All ({videos.length})
                  </button>
                  {folders.map(f => {
                    const count = videos.filter(v => v.folder === f).length;
                    const isActive = activeFolders.includes(f);
                    return (
                      <div key={f} className={`folder-chip ${isActive?"folder-chip--active":""}`}>
                        <button onClick={() => toggleFolder(f)}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                          {f.split(/[\\/]/).pop()} ({count})
                        </button>
                        <button className="folder-chip-remove" onClick={() => handleRemoveFolder(f)} title="Remove folder">×</button>
                      </div>
                    );
                  })}
                </div>

                {/* Date-grouped grid */}
                {groups.length > 0 && (
                  <div className="grid-scroll">
                    {groups.map(group => (
                      <section key={group.dateKey} className="day-group">
                        <div className="day-header">
                          <span className="day-label">{group.label}</span>
                          <span className="day-count">{group.videos.length} video{group.videos.length!==1?"s":""}</span>
                          <div className="day-line"/>
                        </div>
                        <div className="video-grid">
                          {group.videos.map(video => {
                            const sortedIdx = sortedVideos.findIndex(v => v.path === video.path);
                            return (
                              <VideoCard
                                key={video.path}
                                video={video}
                                onClick={() => openVideo(sortedIdx)}
                                onUpload={() => setUploadTarget(video)}
                              />
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* PLAYER VIEW */}
        {view === "player" && streamPort > 0 && (
          <div className="split-layout">
            <aside className="split-left">
              <div className="split-left-header"><span className="split-count">{sortedVideos.length} videos</span></div>
              <div className="video-list" ref={listRef}>
                {sortedVideos.map((video, i) => (
                  <VideoListItem key={video.path} video={video} index={i} selected={i===selectedIndex} scrollRoot={listRoot} onClick={() => goTo(i)}/>
                ))}
              </div>
            </aside>
            <main className="split-right">
              {selectedVideo ? (
                <InlinePlayer
                  video={selectedVideo}
                  streamPort={streamPort}
                  onPrev={selectedIndex>0?()=>goTo(selectedIndex-1):null}
                  onNext={selectedIndex<sortedVideos.length-1?()=>goTo(selectedIndex+1):null}
                  onUpload={() => setUploadTarget(selectedVideo)}
                />
              ) : <div className="player-placeholder"><p className="placeholder-title">Select a video</p></div>}
            </main>
          </div>
        )}
      </div>

      {/* Upload dialog */}
      {uploadTarget && (
        <UploadDialog
          video={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploadNow={opts => handleUploadNow(uploadTarget, opts)}
          onAddToQueue={opts => handleAddToQueue(uploadTarget, opts)}
        />
      )}

      {/* Upload queue */}
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

      {/* Settings */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}/>
    </div>
  );
}
