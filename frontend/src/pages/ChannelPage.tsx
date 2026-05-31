import { useState, useEffect, useRef } from "react";
import { YTVideo, YTPlaylist } from "../types";
import { SyncRecentVideos } from "../../wailsjs/go/backend/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

import VideoPill from "../components/video/VideoPill";
import PlaylistCard from "../components/youtube/PlaylistCard";
import YouTubeInlinePlayer from "../components/youtube/YouTubeInlinePlayer";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import { useChannelData } from "../hooks/useChannelData";

export default function ChannelPage() {
  const [activeTab, setActiveTab] = useState<"videos" | "playlists">("videos");
  const [playlistSort, setPlaylistSort] = useState<"recent" | "title" | "videos" | "updated">(
    () => (localStorage.getItem("ch:playlistSort_v2") as any) || "updated"
  );
  const [videoSort, setVideoSort] = useState<"recent" | "title" | "views">(
    () => (localStorage.getItem("ch:videoSort") as any) || "recent"
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPlaylist, setSelectedPlaylist] = useState<YTPlaylist | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YTVideo | null>(null);
  const [viewType, setViewType] = useState<"grid" | "player">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [autoplay, setAutoplay] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");

  const sidebarRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Persist sort preferences so they survive navigation away and back
  useEffect(() => { localStorage.setItem("ch:playlistSort_v2", playlistSort); }, [playlistSort]);
  useEffect(() => { localStorage.setItem("ch:videoSort", videoSort); }, [videoSort]);

  // Reset state when tab changes
  useEffect(() => {
    setSelectedPlaylist(null);
    setSelectedVideo(null);
    setViewType("grid");
    setSearchQuery("");
  }, [activeTab]);

  // Reset search when playlist changes
  useEffect(() => {
    setSearchQuery("");
  }, [selectedPlaylist]);

  const {
    videos, playlists, filteredVideos, loading, loadingMore, loadMoreRef, loadData,
  } = useChannelData({
    activeTab,
    videoSort,
    playlistSort,
    debouncedSearch,
    selectedPlaylist,
  });

  // Listen for sync events and upload completions
  useEffect(() => {
    EventsOn("youtube:sync-progress", (msg: string) => {
      setSyncStatus(msg);
    });
    EventsOn("youtube:sync-done", () => {
      setIsSyncing(false);
      setSyncStatus("Sync complete!");
      setTimeout(() => setSyncStatus(""), 3000);
      loadData(true);
    });
    // Refresh channel list whenever any upload finishes so the new video appears
    EventsOn("youtube:done", () => {
      loadData(true);
    });

    return () => {
      EventsOff("youtube:sync-progress");
      EventsOff("youtube:sync-done");
      EventsOff("youtube:done");
    };
  }, [loadData]);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus("Starting sync...");
    try {
      // Fetch only the most recent 20 videos — fast and quota-friendly
      await SyncRecentVideos(20);
    } catch (e) {
      console.error("Sync failed:", e);
      setIsSyncing(false);
      setSyncStatus("Failed to sync");
      setTimeout(() => setSyncStatus(""), 3000);
    }
  };

  // Scroll sidebar to selected video in player view
  useEffect(() => {
    if (viewType === "player" && selectedVideo && sidebarRef.current) {
      setTimeout(() => {
        const activeEl = sidebarRef.current?.querySelector('[data-selected="true"]');
        if (activeEl) activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [selectedVideo, viewType]);

  // Sidebar list: filteredVideos already respects the global header search + sort.
  // Apply an optional local sidebar filter on top.
  const playerVideos = sidebarSearch
    ? filteredVideos.filter((v) =>
        v.title.toLowerCase().includes(sidebarSearch.toLowerCase())
      )
    : filteredVideos;

  const handleNext = () => {
    if (!selectedVideo) return;
    const idx = playerVideos.findIndex((v) => v.id === selectedVideo.id);
    if (idx !== -1 && idx < playerVideos.length - 1) setSelectedVideo(playerVideos[idx + 1]);
  };

  const handlePrev = () => {
    if (!selectedVideo) return;
    const idx = playerVideos.findIndex((v) => v.id === selectedVideo.id);
    if (idx > 0) setSelectedVideo(playerVideos[idx - 1]);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      {/* ── Sticky sub-header — row 1: title / tabs / search ─────────────────── */}
      <div className="flex flex-col border-b border-border-subtle bg-surface/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
        {/* Row 1 */}
        <div className="flex items-center gap-3 px-5 py-2.5 flex-wrap">
          {/* Breadcrumb / title */}
          {selectedPlaylist ? (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => { setSelectedPlaylist(null); setViewType("grid"); }}
                className="p-1.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-all active:scale-90"
                title="Back to playlists"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex flex-col cursor-pointer group" onClick={() => setViewType("grid")} title="Back to playlist grid">
                <span className="text-[9px] font-bold text-accent leading-none mb-0.5 group-hover:text-accent/80 transition-colors">Playlist</span>
                <h1 className="text-sm font-bold text-text-primary leading-none truncate max-w-[260px] group-hover:text-accent transition-colors">
                  {selectedPlaylist.title}
                </h1>
              </div>
            </div>
          ) : (
            <div
              className={`flex items-center gap-2 shrink-0 ${viewType === "player" ? "cursor-pointer group" : ""}`}
              onClick={() => viewType === "player" && setViewType("grid")}
              title={viewType === "player" ? "Back to channel grid" : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-accent shrink-0">
                <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
              </svg>
              <h1 className={`text-sm font-bold text-text-primary ${viewType === "player" ? "group-hover:text-accent transition-colors" : ""}`}>
                Channel
              </h1>
            </div>
          )}

          {/* Tab switcher */}
          {!selectedPlaylist && (
            <div className="flex items-center gap-1 bg-elevated/50 p-0.5 rounded-lg border border-border-subtle shrink-0">
              {(["videos", "playlists"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setSelectedPlaylist(null);
                    setSelectedVideo(null);
                    setViewType("grid");
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    activeTab === tab
                      ? "bg-accent text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Search — grows to fill */}
          <div className="relative group flex-1 min-w-[160px] max-w-[340px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={`Search ${selectedPlaylist ? "in playlist" : activeTab}…`}
              className="w-full bg-elevated/30 border border-border-subtle rounded-xl pl-8 pr-8 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all placeholder:text-text-muted"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* Grid / List toggle */}
            <div className="flex items-center gap-0.5 bg-elevated/50 p-0.5 rounded-lg border border-border-subtle">
              <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded transition-all ${viewMode === "grid" ? "bg-accent text-white shadow-sm" : "text-text-muted hover:text-text-primary"}`} title="Grid view">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
              </button>
              <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition-all ${viewMode === "list" ? "bg-accent text-white shadow-sm" : "text-text-muted hover:text-text-primary"}`} title="List view">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>

            <div className="w-px h-4 bg-border-subtle" />

            {/* Sort */}
            <select
              className="bg-elevated/50 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-bold text-text-primary outline-none focus:border-accent transition-colors cursor-pointer"
              value={activeTab === "videos" || selectedPlaylist ? videoSort : playlistSort}
              onChange={(e) => {
                const val = e.target.value as any;
                if (activeTab === "videos" || selectedPlaylist) setVideoSort(val);
                else setPlaylistSort(val);
              }}
            >
              {activeTab === "videos" || selectedPlaylist ? (
                <>
                  <option value="recent">Most recent</option>
                  <option value="views">Most viewed</option>
                  <option value="title">A–Z title</option>
                </>
              ) : (
                <>
                  <option value="recent">Recently created</option>
                  <option value="updated">Recently updated</option>
                  <option value="title">A–Z title</option>
                  <option value="videos">Most videos</option>
                </>
              )}
            </select>

            <div className="w-px h-4 bg-border-subtle" />

            {/* Autoplay toggle */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-elevated/30 border border-border-subtle rounded-lg">
              <span className="text-[10px] font-bold text-text-muted">Autoplay</span>
              <button
                onClick={() => setAutoplay(!autoplay)}
                className={`w-7 h-3.5 rounded-full transition-all relative ${autoplay ? "bg-accent" : "bg-surface border border-border-subtle"}`}
              >
                <div className={`absolute top-[1px] w-2.5 h-2.5 rounded-full transition-all ${autoplay ? "right-[1.5px] bg-white" : "left-[1.5px] bg-text-muted"}`} />
              </button>
            </div>

            {/* Sync */}
            <div className="flex items-center gap-2">
              {syncStatus && (
                <span className={`text-[10px] font-bold ${isSyncing ? "text-accent animate-pulse" : "text-green-500"} max-w-[120px] truncate`}>
                  {syncStatus}
                </span>
              )}
              <button
                onClick={handleSync}
                disabled={loading || isSyncing}
                className={`p-1.5 rounded-lg border transition-all group active:scale-95 ${
                  isSyncing
                    ? "bg-accent/10 border-accent/30 text-accent"
                    : "bg-elevated/50 text-text-secondary hover:text-text-primary hover:bg-elevated border-border-subtle"
                } disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`}
                title="Sync with YouTube"
              >
                <svg className={`${isSyncing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      {viewType === "player" && selectedVideo ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <aside className="w-[360px] min-w-[280px] max-w-[460px] flex flex-col border-r border-border-subtle bg-surface shrink-0 z-10">
            {/* Sidebar search */}
            <div className="px-2 pt-2 pb-1 shrink-0">
              <div className="relative group">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search videos…"
                  className="w-full bg-elevated/30 border border-border-subtle rounded-xl pl-8 pr-7 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all placeholder:text-text-muted"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                />
                {sidebarSearch && (
                  <button
                    onClick={() => setSidebarSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div ref={sidebarRef} className="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-2 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : playerVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-40">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <p className="text-xs font-medium">No videos match</p>
                </div>
              ) : (
                <>
                  {playerVideos.map((v) => (
                    <div key={v.id} data-selected={selectedVideo?.id === v.id}>
                      <VideoPill
                        video={v}
                        selected={selectedVideo?.id === v.id}
                        onUpdate={() => loadData(true)}
                        viewMode="list"
                        compact={true}
                        onClick={() => setSelectedVideo(v)}
                      />
                    </div>
                  ))}
                  {/* Infinite scroll sentinel — same observer as the grid view */}
                  <div ref={loadMoreRef} className="h-8 flex items-center justify-center shrink-0">
                    {loadingMore && (
                      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* Player */}
          <main className="flex-1 flex flex-col bg-base overflow-hidden relative">
            <ErrorBoundary area="YouTube Player">
              <YouTubeInlinePlayer
                video={selectedVideo}
                onUpdate={() => loadData(true)}
                onNext={handleNext}
                onPrev={handlePrev}
                onEnded={() => { if (autoplay) handleNext(); }}
              />
            </ErrorBoundary>
          </main>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selectedPlaylist ? (
            filteredVideos.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-text-muted mt-20">
                <div className="w-12 h-12 rounded-full bg-elevated/50 flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <p className="font-medium">No videos match your search.</p>
              </div>
            ) : (
              <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" : "flex flex-col gap-2"}>
                {filteredVideos.map((v) => (
                  <div key={v.id} onClick={() => { setSelectedVideo(v); setViewType("player"); }}>
                    <VideoPill video={v} onUpdate={() => loadData(true)} viewMode={viewMode} />
                  </div>
                ))}
              </div>
            )
          ) : activeTab === "videos" ? (
            videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-text-muted mt-20">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>No videos found. Try syncing your channel.</p>
              </div>
            ) : (
              <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" : "flex flex-col gap-2"}>
                {videos.map((v) => (
                  <div key={v.id} onClick={() => { setSelectedVideo(v); setViewType("player"); }}>
                    <VideoPill video={v} onUpdate={() => loadData(true)} viewMode={viewMode} />
                  </div>
                ))}
                {/* Infinite scroll sentinel */}
                <div ref={loadMoreRef} className="col-span-full h-12 flex items-center justify-center">
                  {loadingMore && <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
                </div>
              </div>
            )
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-text-muted mt-20">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50">
                <path d="M12 3v18" /><rect x="3" y="9" width="18" height="12" rx="2" /><path d="M3 13h18" />
              </svg>
              <p>No playlists found.</p>
            </div>
          ) : (
            <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" : "flex flex-col gap-2"}>
              {playlists
                .filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((p) => (
                  <PlaylistCard
                    key={p.id}
                    playlist={p}
                    viewMode={viewMode}
                    onClick={() => { setSelectedPlaylist(p); setTimeout(() => loadData(true), 50); }}
                    onDeleted={() => loadData(true)}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
