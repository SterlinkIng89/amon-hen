import { useState, useEffect, useRef } from "react";
import { YTVideo, YTPlaylist } from "../types";
import {
  GetChannelVideos,
  GetChannelPlaylists,
  SyncChannelData,
  GetPlaylistVideos,
} from "../../wailsjs/go/main/App";

import VideoPill from "../components/video/VideoPill";
import PlaylistCard from "../components/youtube/PlaylistCard";
import YouTubeInlinePlayer from "../components/youtube/YouTubeInlinePlayer";

export default function ChannelPage() {
  const [activeTab, setActiveTab] = useState<"videos" | "playlists">("videos");
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [playlistSort, setPlaylistSort] = useState<
    "recent" | "title" | "videos"
  >("recent");
  const [videoSort, setVideoSort] = useState<"recent" | "title" | "views">("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPlaylist, setSelectedPlaylist] = useState<YTPlaylist | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<YTVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YTVideo | null>(null);
  const [viewType, setViewType] = useState<"grid" | "player">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoplay, setAutoplay] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset selection and player when changing tabs
    setSelectedPlaylist(null);
    setPlaylistVideos([]);
    setSelectedVideo(null);
    setViewType("grid");
    setSearchQuery("");
  }, [activeTab]);

  useEffect(() => {
    setSearchQuery("");
  }, [selectedPlaylist]);

  useEffect(() => {
    loadData();
  }, [activeTab, playlistSort, videoSort, selectedPlaylist, selectedVideo]);

  useEffect(() => {
    if (viewType === "player" && selectedVideo && sidebarRef.current) {
      setTimeout(() => {
        const activeEl = sidebarRef.current?.querySelector('[data-selected="true"]');
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
    }
  }, [selectedVideo, viewType]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (selectedPlaylist) {
        const res = await GetPlaylistVideos(selectedPlaylist.id);
        let sorted = [...(res || [])];
        if (videoSort === "title") {
          sorted.sort((a, b) => a.title.localeCompare(b.title));
        } else if (videoSort === "views") {
          sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        } else {
          sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        }
        setPlaylistVideos(sorted);
      } else {
        // Cargar siempre los videos generales si no hay playlist, para que el player tenga datos
        const res: any = await GetChannelVideos(1, 10000);
        // Sort Videos
        let sortedVideos = [...(res.videos || [])];
        if (videoSort === "title") {
          sortedVideos.sort((a, b) => a.title.localeCompare(b.title));
        } else if (videoSort === "views") {
          sortedVideos.sort((a, b) => b.viewCount - a.viewCount);
        } else {
          sortedVideos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        }
        setVideos(sortedVideos);
        
        if (activeTab === "playlists") {
          console.log("Fetching playlists with sort:", playlistSort);
          const pRes: any = await GetChannelPlaylists(
            String(playlistSort || "recent"),
          );
          setPlaylists(pRes || []);
        }
      }
    } catch (e) {
      console.error("Failed to load channel data", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredVideos = (selectedPlaylist ? playlistVideos : videos).filter(v =>
    v.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // For player view, we want chronological order (Oldest to Newest)
  const playerVideos = [...filteredVideos].reverse();

  const handleNext = () => {
    if (!selectedVideo) return;
    const currentIndex = playerVideos.findIndex(v => v.id === selectedVideo.id);
    if (currentIndex !== -1 && currentIndex < playerVideos.length - 1) {
      setSelectedVideo(playerVideos[currentIndex + 1]);
    }
  };

  const handlePrev = () => {
    if (!selectedVideo) return;
    const currentIndex = playerVideos.findIndex(v => v.id === selectedVideo.id);
    if (currentIndex > 0) {
      setSelectedVideo(playerVideos[currentIndex - 1]);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-6">
          {selectedPlaylist ? (
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setSelectedPlaylist(null);
                  setViewType("grid");
                }}
                className="p-2 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-all active:scale-90"
                title="Back to playlists"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div 
                className="flex flex-col cursor-pointer group"
                onClick={() => setViewType("grid")}
                title="Back to playlist grid"
              >
                <span className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none mb-1 group-hover:text-accent/80 transition-colors">Playlist</span>
                <h1 className="text-lg font-bold text-text-primary leading-none truncate max-w-[300px] group-hover:text-accent transition-colors">
                  {selectedPlaylist.title}
                </h1>
              </div>
            </div>
          ) : (
            <h1 className="text-lg font-bold text-text-primary flex items-center gap-2 mr-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
              </svg>
              Channel
            </h1>
          )}

          {!selectedPlaylist && (
            <div className="flex items-center gap-2 bg-elevated/30 p-1 rounded-xl border border-border-subtle">
            <button
              onClick={() => {
                setActiveTab("videos");
                setSelectedPlaylist(null);
                setSelectedVideo(null);
                setViewType("grid");
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "videos"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-elevated/50"
              }`}
            >
              Videos
            </button>
            <button
              onClick={() => {
                setActiveTab("playlists");
                setSelectedPlaylist(null);
                setSelectedVideo(null);
                setViewType("grid");
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "playlists"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-elevated/50"
              }`}
            >
              Playlists
            </button>
          </div>
          )}

          <div className="h-4 w-px bg-border-subtle" />

          {/* Search Bar */}
          <div className="relative group">
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" 
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder={`Search ${selectedPlaylist ? "in playlist..." : activeTab}...`}
              className="bg-elevated/30 border border-border-subtle rounded-xl pl-9 pr-4 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all w-[240px] placeholder:text-text-muted"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-border-subtle" />

          <div className="flex items-center gap-1 bg-elevated/30 p-1 rounded-lg border border-border-subtle">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "grid"
                  ? "bg-accent text-white shadow-sm border border-border-subtle"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              title="Grid View"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "list"
                  ? "bg-accent text-white shadow-sm border border-border-subtle"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              title="List View"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Sort by:</span>
            <select
              className="bg-elevated/50 border border-border-subtle rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:border-accent transition-colors cursor-pointer"
              value={activeTab === "videos" || selectedPlaylist ? videoSort : playlistSort}
              onChange={(e) => {
                const val = e.target.value as any;
                if (activeTab === "videos" || selectedPlaylist) setVideoSort(val);
                else setPlaylistSort(val);
              }}
            >
              {activeTab === "videos" || selectedPlaylist ? (
                <>
                  <option value="recent">Most Recent</option>
                  <option value="views">Most Viewed</option>
                  <option value="title">A-Z Title</option>
                </>
              ) : (
                <>
                  <option value="recent">Recently Created</option>
                  <option value="title">A-Z Title</option>
                  <option value="videos">Most Videos</option>
                </>
              )}
            </select>
          </div>
          
          <button
            onClick={() => { SyncChannelData(); loadData(); }}
            disabled={loading}
            className="p-2 rounded-lg bg-elevated/30 text-text-secondary hover:text-accent border border-border-subtle transition-all active:scale-95 group"
            title="Sync with YouTube"
          >
            <svg className={`${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          </button>
        </div>
      </header>

      {viewType === "player" && selectedVideo ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar List */}
          <aside className="w-[420px] flex flex-col border-r border-border-subtle bg-surface shrink-0 z-10">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface/50 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setViewType("grid")}
                  className="p-1.5 bg-accent/10 rounded-lg text-accent hover:bg-accent/20 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs font-bold text-text-primary uppercase tracking-widest">
                  {selectedPlaylist ? "Playlist" : "Channel"}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 pr-3 border-r border-border-subtle/50">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Autoplay</span>
                  <button 
                    onClick={() => setAutoplay(!autoplay)}
                    className={`w-8 h-4 rounded-full transition-all relative ${autoplay ? "bg-accent" : "bg-elevated border border-border-subtle"}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${autoplay ? "right-0.5 bg-white" : "left-0.5 bg-text-muted"}`} />
                  </button>
                </div>
                <button 
                  onClick={() => setViewType("grid")}
                  className="text-[10px] font-bold text-accent hover:underline"
                >
                  BACK TO GRID
                </button>
              </div>
            </div>
            
            <div 
              ref={sidebarRef}
              className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-3 custom-scrollbar"
            >
              {playerVideos.map((v) => (
                <div key={v.id} data-selected={selectedVideo?.id === v.id}>
                  <VideoPill
                    video={v}
                    selected={selectedVideo?.id === v.id}
                    onUpdate={loadData}
                    viewMode="list"
                    compact={true}
                    onClick={() => setSelectedVideo(v)}
                  />
                </div>
              ))}
            </div>
          </aside>

          {/* Player Main Area */}
          <main className="flex-1 flex flex-col bg-base overflow-hidden relative">
            <YouTubeInlinePlayer 
              video={selectedVideo}
              onUpdate={loadData}
              onNext={handleNext}
              onPrev={handlePrev}
              onEnded={() => {
                if (autoplay) handleNext();
              }}
            />
          </main>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selectedPlaylist ? (
            playlistVideos.filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
              <div className="flex flex-col items-center justify-center text-text-muted mt-20">
                <div className="w-12 h-12 rounded-full bg-elevated/50 flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <p className="font-medium">No videos match your search.</p>
              </div>
            ) : (
              <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,213px)] justify-center gap-6" : "flex flex-col gap-3"}>
                {playlistVideos
                  .filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((v) => (
                    <div key={v.id} onClick={() => { setSelectedVideo(v); setViewType("player"); }}>
                      <VideoPill
                        video={v}
                        onUpdate={loadData}
                        viewMode={viewMode}
                      />
                    </div>
                  ))}
              </div>
            )
          ) : activeTab === "videos" ? (
            videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-text-muted mt-20">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mb-4 opacity-50"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p>No videos found. Try syncing your channel.</p>
              </div>
            ) : (
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-[repeat(auto-fill,213px)] justify-center gap-6"
                    : "flex flex-col gap-3"
                }
              >
                {videos
                  .filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((v) => (
                    <div key={v.id} onClick={() => { setSelectedVideo(v); setViewType("player"); }}>
                      <VideoPill
                        video={v}
                        onUpdate={loadData}
                        viewMode={viewMode}
                      />
                    </div>
                  ))}
              </div>
            )
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-text-muted mt-20">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-4 opacity-50"
              >
                <path d="M12 3v18"></path>
                <rect x="3" y="9" width="18" height="12" rx="2"></rect>
                <path d="M3 13h18"></path>
              </svg>
              <p>No playlists found.</p>
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-[repeat(auto-fill,213px)] justify-center gap-6"
                  : "flex flex-col gap-3"
              }
            >
              {playlists
                .filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((p) => (
                  <PlaylistCard 
                    key={p.id} 
                    playlist={p} 
                    viewMode={viewMode} 
                    onClick={() => {
                      setSelectedPlaylist(p);
                      // Force immediate load for playlists
                      setTimeout(loadData, 50);
                    }} 
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
