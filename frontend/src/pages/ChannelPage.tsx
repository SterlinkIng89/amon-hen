import { useState, useEffect, useRef } from "react";
import { YTVideo, YTPlaylist, VideoGroupYT } from "../types";
import { SyncRecentVideos, SyncChannelData, GetSyncStatus, IsYouTubeAuthed, GetPlaylistVideos, AddVideoToPlaylist, PurgePlaylistDuplicates, UpdatePlaylistsVisibility } from "../../wailsjs/go/backend/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { groupByDayYT } from "../utils/videoUtils";

import VideoPill from "../components/video/VideoPill";
import PlaylistCard from "../components/youtube/PlaylistCard";
import YouTubeInlinePlayer from "../components/youtube/YouTubeInlinePlayer";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import { useChannelData } from "../hooks/useChannelData";
import ChannelAnalytics from "../components/youtube/ChannelAnalytics";
import AdvancedFilters, { ActiveFilterChips, useAdvancedFilters } from "../components/ui/AdvancedFilters";
import ChannelBulkActionBar from "../components/youtube/ChannelBulkActionBar";
import PlaylistBulkActionBar from "../components/youtube/PlaylistBulkActionBar";
import DuplicateWarningDialog from "../components/ui/DuplicateWarningDialog";

export default function ChannelPage() {
  const [activeTab, setActiveTab] = useState<"videos" | "playlists">("videos");
  const [playlistSort, setPlaylistSort] = useState<"recent" | "title" | "videos" | "updated">(
    () => (localStorage.getItem("ch:playlistSort_v2") as any) || "updated"
  );
  const [videoSort, setVideoSort] = useState<"recent" | "title" | "views" | "title_date">(
    () => (localStorage.getItem("ch:videoSort") as any) || "recent"
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPlaylist, setSelectedPlaylist] = useState<YTPlaylist | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YTVideo | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set());
  const [duplicateWarning, setDuplicateWarning] = useState<{ isOpen: boolean; playlistId: string; playlistName: string; duplicates: string[]; targetVideoIds: string[] } | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkUpdatingPlaylists, setBulkUpdatingPlaylists] = useState(false);
  const [purgingDuplicates, setPurgingDuplicates] = useState(false);
  const lastSelectedId = useRef<string | null>(null);
  const lastSelectedPlaylistId = useRef<string | null>(null);
  const [viewType, setViewType] = useState<"grid" | "player">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [autoplay, setAutoplay] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  const [showSyncMenu, setShowSyncMenu] = useState(false);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ── Advanced filters ───────────────────────────────────────────────────────
  const filters = useAdvancedFilters();
  const [analyticsDate, setAnalyticsDate] = useState("");

  const allActiveCount = filters.activeCount + (analyticsDate ? 1 : 0);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { localStorage.setItem("ch:playlistSort_v2", playlistSort); }, [playlistSort]);
  useEffect(() => { localStorage.setItem("ch:videoSort", videoSort); }, [videoSort]);

  // Reset state when tab changes
  useEffect(() => {
    setSelectedPlaylist(null);
    setSelectedVideo(null);
    setSelectedVideoIds(new Set());
    setSelectedPlaylistIds(new Set());
    lastSelectedId.current = null;
    lastSelectedPlaylistId.current = null;
    setViewType("grid");
    filters.clearAll();
    setAnalyticsDate("");
    setSearchQuery("");
  }, [activeTab]);

  // Reset filters when playlist changes
  useEffect(() => {
    setSelectedVideoIds(new Set());
    setSelectedPlaylistIds(new Set());
    lastSelectedId.current = null;
    lastSelectedPlaylistId.current = null;
    filters.clearAll();
    setAnalyticsDate("");
    setSearchQuery("");
  }, [selectedPlaylist]);

  // ── Escape key: clear selection or search ────────────────────────────────────
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedPlaylistIds.size > 0) {
          setSelectedPlaylistIds(new Set());
          lastSelectedPlaylistId.current = null;
        } else if (selectedVideoIds.size > 0) {
          setSelectedVideoIds(new Set());
          lastSelectedId.current = null;
        } else if (searchQuery) {
          setSearchQuery("");
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedPlaylistIds.size, selectedVideoIds.size, searchQuery]);

 const {
 videos, playlists, filteredVideos, loading, loadingMore, loadMoreRef, loadData,
 } = useChannelData({
 activeTab,
 videoSort,
 playlistSort,
 debouncedSearch,
 selectedPlaylist,
 dateFilter: analyticsDate,
 dateFrom: analyticsDate ? undefined : filters.dateFrom,
 dateTo: analyticsDate ? undefined : filters.dateTo,
 excludeWords: filters.excludeWords,
 });

 // Sync events
 useEffect(() => {
 const unsub1 = EventsOn("youtube:sync-progress", (data: { count: number; total: number; stage: string }) => {
 setSyncStatus(`Syncing: ${data.stage} (${data.count}/${data.total})`);
 });
 const unsub2 = EventsOn("youtube:sync-done", () => {
 setIsSyncing(false);
 setSyncStatus("Sync complete!");
 setTimeout(() => setSyncStatus(""), 3000);
 loadData(true);
 setAnalyticsRefreshKey((k) => k + 1);
 });
 const unsub3 = EventsOn("youtube:done", () => {
 setIsSyncing(false);
 loadData(true);
 setAnalyticsRefreshKey((k) => k + 1);
 });
 return () => {
 unsub1();
 unsub2();
 unsub3();
 };
 }, [loadData]);

 // Auto-sync on first visit
 useEffect(() => {
 const checkAndAutoSync = async () => {
 try {
 const authed = await IsYouTubeAuthed();
 if (!authed) return;
 const status: any = await GetSyncStatus();
 if ((status?.count ?? 0) === 0) {
 setIsSyncing(true);
 setSyncStatus("First sync — fetching all channel data...");
 await SyncChannelData();
 }
 } catch (e) { console.error("Auto-sync check failed:", e); }
 finally { setIsSyncing(false); }
 };
 checkAndAutoSync();
 }, []);

 // Close sync dropdown on outside click
 useEffect(() => {
 const handler = (e: MouseEvent) => {
 if (syncMenuRef.current && !syncMenuRef.current.contains(e.target as Node)) setShowSyncMenu(false);
 };
 document.addEventListener("mousedown", handler);
 return () => document.removeEventListener("mousedown", handler);
 }, []);

  const runSync = async (statusLabel: string, syncFn: () => Promise<unknown>, errorLabel: string) => {
    if (isSyncing) return;
    setShowSyncMenu(false);
    setIsSyncing(true);
    setSyncStatus(statusLabel);
    try {
      await syncFn();
    } catch (e) {
      console.error(errorLabel, e);
      setSyncStatus("Sync failed");
      setTimeout(() => setSyncStatus(""), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncLight = () =>
    runSync("Quick sync — last 20 videos...", () => SyncRecentVideos(20), "Light sync failed:");

  const handleSyncFull = () =>
    runSync("Full sync — fetching entire channel...", () => SyncChannelData(), "Full sync failed:");

 // Scroll sidebar to selected video
 useEffect(() => {
 if (viewType === "player" && selectedVideo && sidebarRef.current) {
 setTimeout(() => {
 const el = sidebarRef.current?.querySelector('[data-selected="true"]');
 if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
 }, 100);
 }
 }, [selectedVideo, viewType]);

 const playerVideos = sidebarSearch
 ? filteredVideos.filter((v) => v.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
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

 const handleVideoClick = (video: YTVideo, e: React.MouseEvent) => {
 if (e.ctrlKey || e.metaKey) {
 e.preventDefault();
 e.stopPropagation();
 const next = new Set(selectedVideoIds);
 if (next.has(video.id)) next.delete(video.id);
 else next.add(video.id);
 setSelectedVideoIds(next);
 lastSelectedId.current = video.id;
 return;
 }

 if (e.shiftKey) {
 e.preventDefault();
 e.stopPropagation();
 const anchorId = lastSelectedId.current || filteredVideos[0]?.id;
 const currentIndex = filteredVideos.findIndex(v => v.id === video.id);
 const lastIndex = filteredVideos.findIndex(v => v.id === anchorId);
 
 if (currentIndex !== -1 && lastIndex !== -1) {
 const start = Math.min(currentIndex, lastIndex);
 const end = Math.max(currentIndex, lastIndex);
 const next = new Set(selectedVideoIds);
 for (let i = start; i <= end; i++) {
 next.add(filteredVideos[i].id);
 }
 setSelectedVideoIds(next);
 }
 return;
 }

 // Normal click
 if (selectedVideoIds.size > 0) {
 // If we are in selection mode, a normal click selects/deselects
 e.preventDefault();
 e.stopPropagation();
 const next = new Set(selectedVideoIds);
 if (next.has(video.id)) next.delete(video.id);
 else next.add(video.id);
 setSelectedVideoIds(next);
 lastSelectedId.current = video.id;
 return;
 }

 lastSelectedId.current = video.id;
 setSelectedVideo(video);
 setViewType("player");
 };

 const handleSelectToggle = (video: YTVideo) => {
 const next = new Set(selectedVideoIds);
 if (next.has(video.id)) next.delete(video.id);
 else next.add(video.id);
 setSelectedVideoIds(next);
 lastSelectedId.current = video.id;
 };

 const handleAddToPlaylist = async (playlistId: string) => {
 if (selectedVideoIds.size === 0) return;
 const targetVideoIds = Array.from(selectedVideoIds);
 setBulkAdding(true);
 try {
 const existingVideos = await GetPlaylistVideos(playlistId);
 const existingIds = new Set(existingVideos.map(v => v.id));
 const duplicates = targetVideoIds.filter(id => existingIds.has(id));

 if (duplicates.length > 0) {
 const p = playlists.find(p => p.id === playlistId);
 setDuplicateWarning({
 isOpen: true,
 playlistId,
 playlistName: p?.title || "Unknown Playlist",
 duplicates,
 targetVideoIds
 });
 setBulkAdding(false);
 return;
 }

 await processAddVideos(playlistId, targetVideoIds, []);
 } catch (e) {
 console.error("Error checking playlist:", e);
 setBulkAdding(false);
 }
 };

 const processAddVideos = async (playlistId: string, allTargets: string[], skipDuplicates: string[]) => {
 const toAdd = allTargets.filter(id => !skipDuplicates.includes(id));
 if (toAdd.length === 0) {
 // Nothing to add
 setSelectedVideoIds(new Set());
 setDuplicateWarning(null);
 setBulkAdding(false);
 return;
 }

 setBulkAdding(true);
 setSyncStatus(`Adding ${toAdd.length} video(s) to playlist...`);
 try {
 for (const id of toAdd) {
 await AddVideoToPlaylist(playlistId, id);
 }
 setSyncStatus("Added successfully!");
 setSelectedVideoIds(new Set());
 setDuplicateWarning(null);
 setTimeout(() => setSyncStatus(""), 3000);
 loadData(true);
 } catch (e) {
 console.error("Failed to add videos to playlist", e);
 setSyncStatus("Failed to add videos.");
 setTimeout(() => setSyncStatus(""), 3000);
 } finally {
 setBulkAdding(false);
 }
 };

  const handlePurgeDuplicates = async () => {
    if (!selectedPlaylist || purgingDuplicates) return;
    setPurgingDuplicates(true);
    setSyncStatus("Scanning for duplicates...");
    try {
      const removed = await PurgePlaylistDuplicates(selectedPlaylist.id);
      if (removed === 0) {
        setSyncStatus("No duplicates found ✓");
      } else {
        setSyncStatus(`Removed ${removed} duplicate${removed !== 1 ? "s" : ""} ✓`);
        loadData(true);
      }
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (e: any) {
      setSyncStatus("Failed to purge duplicates");
      setTimeout(() => setSyncStatus(""), 4000);
    } finally {
      setPurgingDuplicates(false);
    }
  };

  const handlePlaylistClick = (playlist: YTPlaylist, e: React.MouseEvent) => {
    const visiblePlaylists = playlists.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()));

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const next = new Set(selectedPlaylistIds);
      if (next.has(playlist.id)) next.delete(playlist.id);
      else next.add(playlist.id);
      setSelectedPlaylistIds(next);
      lastSelectedPlaylistId.current = playlist.id;
      return;
    }

    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const anchorId = lastSelectedPlaylistId.current || visiblePlaylists[0]?.id;
      const currentIndex = visiblePlaylists.findIndex((p) => p.id === playlist.id);
      const lastIndex = visiblePlaylists.findIndex((p) => p.id === anchorId);

      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        const next = new Set(selectedPlaylistIds);
        for (let i = start; i <= end; i++) {
          next.add(visiblePlaylists[i].id);
        }
        setSelectedPlaylistIds(next);
      }
      return;
    }

    // If already in multi-selection mode, normal click toggles selection
    if (selectedPlaylistIds.size > 0) {
      e.preventDefault();
      e.stopPropagation();
      const next = new Set(selectedPlaylistIds);
      if (next.has(playlist.id)) next.delete(playlist.id);
      else next.add(playlist.id);
      setSelectedPlaylistIds(next);
      lastSelectedPlaylistId.current = playlist.id;
      return;
    }

    // Normal click opens the playlist
    lastSelectedPlaylistId.current = playlist.id;
    setSelectedPlaylist(playlist);
    setTimeout(() => loadData(true), 50);
  };

  const handlePlaylistSelectToggle = (playlist: YTPlaylist) => {
    const next = new Set(selectedPlaylistIds);
    if (next.has(playlist.id)) next.delete(playlist.id);
    else next.add(playlist.id);
    setSelectedPlaylistIds(next);
    lastSelectedPlaylistId.current = playlist.id;
  };

  const handleUpdatePlaylistsVisibility = async (privacy: "public" | "unlisted" | "private") => {
    if (selectedPlaylistIds.size === 0) return;
    const targetIds = Array.from(selectedPlaylistIds);
    setBulkUpdatingPlaylists(true);
    const privacyLabel = privacy.charAt(0).toUpperCase() + privacy.slice(1);
    setSyncStatus(`Updating ${targetIds.length} playlist${targetIds.length !== 1 ? "s" : ""} to ${privacyLabel}...`);

    try {
      await UpdatePlaylistsVisibility(targetIds, privacy);
      setSyncStatus(`Updated ${targetIds.length} playlist${targetIds.length !== 1 ? "s" : ""} to ${privacyLabel} ✓`);
      setSelectedPlaylistIds(new Set());
      lastSelectedPlaylistId.current = null;
      setTimeout(() => setSyncStatus(""), 4000);
      loadData(true);
    } catch (err: unknown) {
      console.error("Failed to update playlist visibility:", err);
      setSyncStatus("Failed to update visibility");
      setTimeout(() => setSyncStatus(""), 4000);
    } finally {
      setBulkUpdatingPlaylists(false);
    }
  };

 const ytGroups = (activeTab === "videos" && !selectedPlaylist && (videoSort === "recent" || videoSort === "title_date"))
 ? groupByDayYT(filteredVideos, videoSort)
 : [];

 return (
 <div className="flex-1 flex flex-col overflow-hidden bg-base">
 {/* ── Sticky sub-header ─────────────────────────────────────────────────── */}
 <div className="flex flex-col border-b border-border-subtle bg-surface/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
 <div className="flex items-center gap-3 px-5 h-14 shrink-0 flex-wrap">

 {/* Breadcrumb / title */}
 {selectedPlaylist ? (
 <div className="flex items-center gap-3 shrink-0">
 <button onClick={() => { setSelectedPlaylist(null); setViewType("grid"); }}
 className="p-1.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-all active:scale-90" title="Back to playlists">
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
 </button>
 <div className="flex flex-col cursor-pointer group" onClick={() => setViewType("grid")} title="Back to playlist grid">
 <span className="text-[9px] font-bold text-accent leading-none mb-0.5 group-hover:text-accent/80 transition-colors">Playlist</span>
 <h1 className="text-sm font-bold text-text-primary leading-none truncate max-w-[260px] group-hover:text-accent transition-colors">{selectedPlaylist.title}</h1>
 </div>
 {/* Purge duplicates button */}
 <button
 onClick={handlePurgeDuplicates}
 disabled={purgingDuplicates}
 title="Remove duplicate videos from this playlist on YouTube"
 className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all active:scale-95 shrink-0 ${
 purgingDuplicates
 ? "bg-orange-500/10 border-orange-500/30 text-orange-400 cursor-wait"
 : "bg-elevated/50 border-border-subtle text-text-secondary hover:text-orange-400 hover:border-orange-500/40 hover:bg-orange-500/10"
 } disabled:opacity-60 disabled:active:scale-100`}
 >
 {purgingDuplicates ? (
 <>
 <div className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin shrink-0" />
 Purging...
 </>
 ) : (
 <>
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
 <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
 <line x1="10" y1="11" x2="10" y2="17" />
 <line x1="14" y1="11" x2="14" y2="17" />
 </svg>
 Purge Duplicates
 </>
 )}
 </button>
 </div>
 ) : (
 <div className={`flex items-center gap-2 shrink-0 ${viewType === "player" ? "cursor-pointer group" : ""}`}
 onClick={() => viewType === "player" && setViewType("grid")}
 title={viewType === "player" ? "Back to channel grid" : undefined}>
 <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-accent shrink-0">
 <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
 </svg>
 <h1 className={`text-sm font-bold text-text-primary ${viewType === "player" ? "group-hover:text-accent transition-colors" : ""}`}>Channel</h1>
 </div>
 )}

 {/* Tab switcher */}
 {!selectedPlaylist && (
 <div className="flex items-center gap-1 bg-elevated/50 p-0.5 rounded-lg border border-border-subtle shrink-0">
 {(["videos", "playlists"] as const).map((tab) => (
 <button key={tab}
 onClick={() => { setActiveTab(tab); setSelectedPlaylist(null); setSelectedVideo(null); setViewType("grid"); }}
 className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${activeTab === tab ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary"}`}>
 {tab.charAt(0).toUpperCase() + tab.slice(1)}
 </button>
 ))}
 </div>
 )}

 {/* Search */}
 <div className="relative group flex-1 min-w-[160px] max-w-[340px]">
 <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
 <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
 </svg>
 <input type="text" placeholder={`Search ${selectedPlaylist ? "in playlist" : activeTab}…`}
 className="w-full bg-elevated/30 border border-border-subtle rounded-xl pl-8 pr-8 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all placeholder:text-text-muted"
 value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
 {searchQuery && (
 <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors">
 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
 </button>
 )}
 </div>

 {/* ── Advanced Filters component ── */}
 <AdvancedFilters
 value={filters.value}
 onChange={filters.onChange}
 analyticsDate={analyticsDate}
 onClearAnalyticsDate={() => setAnalyticsDate("")}
 align="right"
 />

 {/* Active chips (shown when panel is closed) */}
 <ActiveFilterChips
 value={filters.value}
 analyticsDate={analyticsDate}
 onClearDateRange={() => filters.onChange({ ...filters.value, dateFrom: "", dateTo: "" })}
 onClearAnalyticsDate={() => setAnalyticsDate("")}
 onClearExcludeWords={() => filters.onChange({ ...filters.value, excludeWords: [] })}
 />

 {/* Right controls */}
 <div className="flex items-center gap-2 ml-auto shrink-0">
 {/* Analytics toggle */}
 <button onClick={() => setShowAnalytics((v) => !v)}
 className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${showAnalytics ? "bg-accent/10 border-accent/40 text-accent" : "bg-elevated/50 border-border-subtle text-text-secondary hover:text-text-primary hover:bg-elevated"}`}
 title={showAnalytics ? "Hide analytics" : "Show channel analytics"}>
 <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>
 Analytics
 </button>

 <div className="w-px h-4 bg-border-subtle" />

 {/* Grid / List toggle */}
 <div className="flex items-center gap-0.5 bg-elevated/50 p-0.5 rounded-lg border border-border-subtle">
 <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded transition-all ${viewMode === "grid" ? "bg-accent text-white shadow-sm" : "text-text-muted hover:text-text-primary"}`} title="Grid view">
 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
 </button>
 <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition-all ${viewMode === "list" ? "bg-accent text-white shadow-sm" : "text-text-muted hover:text-text-primary"}`} title="List view">
 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
 </button>
 </div>

 <div className="w-px h-4 bg-border-subtle" />

 {/* Sort */}
 <select className="bg-elevated/50 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-bold text-text-primary outline-none focus:border-accent transition-colors cursor-pointer"
 value={activeTab === "videos" || selectedPlaylist ? videoSort : playlistSort}
 onChange={(e) => {
 const val = e.target.value as any;
 if (activeTab === "videos" || selectedPlaylist) setVideoSort(val);
 else setPlaylistSort(val);
 }}>
 {activeTab === "videos" || selectedPlaylist ? (
 <><option value="recent">Most recent</option><option value="title_date">Date in title</option><option value="views">Most viewed</option><option value="title">A–Z title</option></>
 ) : (
 <><option value="recent">Recently created</option><option value="updated">Recently updated</option><option value="title">A–Z title</option><option value="videos">Most videos</option></>
 )}
 </select>

 <div className="w-px h-4 bg-border-subtle" />

 {/* Autoplay toggle */}
 <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-elevated/30 border border-border-subtle rounded-lg">
 <span className="text-[10px] font-bold text-text-muted">Autoplay</span>
 <button onClick={() => setAutoplay(!autoplay)}
 className={`w-7 h-3.5 rounded-full transition-all relative ${autoplay ? "bg-accent" : "bg-surface border border-border-subtle"}`}>
 <div className={`absolute top-[1px] w-2.5 h-2.5 rounded-full transition-all ${autoplay ? "right-[1.5px] bg-white" : "left-[1.5px] bg-text-muted"}`} />
 </button>
 </div>

 {/* Sync */}
 <div className="flex items-center gap-2">
 {syncStatus && (
 <span className={`text-[10px] font-bold ${isSyncing ? "text-accent animate-pulse" : "text-green-500"} max-w-[140px] truncate`}>{syncStatus}</span>
 )}
 <div ref={syncMenuRef} className="relative flex items-center">
 <button onClick={handleSyncLight} disabled={loading || isSyncing}
 className={`flex items-center gap-1 pl-2 pr-1.5 py-1.5 rounded-l-lg border-y border-l transition-all group active:scale-95 ${isSyncing ? "bg-accent/10 border-accent/30 text-accent" : "bg-elevated/50 text-text-secondary hover:text-text-primary hover:bg-elevated border-border-subtle"} disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`}
 title="Light sync — fetch recent 20 videos">
 <svg className={`${isSyncing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
 <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
 </svg>
 <span className="text-[10px] font-bold">Light</span>
 </button>
 <button onClick={() => setShowSyncMenu((v) => !v)} disabled={loading || isSyncing}
 className={`flex items-center justify-center px-1 py-1.5 rounded-r-lg border transition-all ${isSyncing ? "bg-accent/10 border-accent/30 text-accent" : "bg-elevated/50 text-text-secondary hover:text-text-primary hover:bg-elevated border-border-subtle"} disabled:opacity-50 disabled:cursor-not-allowed`}
 title="More sync options">
 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
 </button>
 {showSyncMenu && (
 <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] bg-surface border border-border-subtle rounded-xl shadow-2xl overflow-hidden animate-slideDown">
 <button onClick={handleSyncLight} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-elevated/60 transition-colors group">
 <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
 </div>
 <div><p className="text-xs font-bold text-text-primary">Light Sync</p><p className="text-[10px] text-text-muted">Fetch last 20 videos only</p></div>
 </button>
 <div className="h-px bg-border-subtle mx-2" />
 <button onClick={handleSyncFull} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-elevated/60 transition-colors group">
 <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 group-hover:bg-purple-500/20 transition-colors">
 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
 </div>
 <div><p className="text-xs font-bold text-text-primary">Full Sync</p><p className="text-[10px] text-text-muted">Fetch entire channel history</p></div>
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* ── Analytics panel ─────────────────────────────────────────────────────── */}
 {showAnalytics && (
 <div className="border-b border-border-subtle bg-base overflow-y-auto max-h-[420px] custom-scrollbar shrink-0 animate-slideDown">
 <ErrorBoundary area="Channel Analytics">
 <ChannelAnalytics
 refreshKey={analyticsRefreshKey}
 excludeWords={filters.excludeWords}
 onDateFilter={(date) => {
 setAnalyticsDate(date);
 filters.onChange({ dateFrom: "", dateTo: "", excludeWords: filters.excludeWords });
 setSearchQuery("");
 }}
 />
 </ErrorBoundary>
 </div>
 )}

 {/* ── Content area ────────────────────────────────────────────────────────── */}
 {viewType === "player" && selectedVideo ? (
 <div className="flex-1 flex overflow-hidden">
 <aside className="w-[360px] min-w-[280px] max-w-[460px] flex flex-col border-r border-border-subtle bg-surface shrink-0 z-10">
 <div className="px-2 pt-2 pb-1 shrink-0">
 <div className="relative group">
 <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
 <input type="text" placeholder="Search videos…" className="w-full bg-elevated/30 border border-border-subtle rounded-xl pl-8 pr-7 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all placeholder:text-text-muted"
 value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} />
 {sidebarSearch && (
 <button onClick={() => setSidebarSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors">
 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
 </button>
 )}
 </div>
 </div>
 <div ref={sidebarRef} className="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-2 custom-scrollbar">
 {loading ? (
 <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
 ) : playerVideos.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12 text-text-muted">
 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-40"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
 <p className="text-xs font-medium">No videos match</p>
 </div>
 ) : (
 <>
 {playerVideos.map((v) => (
 <div key={v.id} data-selected={selectedVideo?.id === v.id}>
 <VideoPill video={v} selected={selectedVideo?.id === v.id} onUpdate={() => loadData(true)} viewMode="list" compact={true} onClick={() => setSelectedVideo(v)} />
 </div>
 ))}
 <div ref={loadMoreRef} className="h-8 flex items-center justify-center shrink-0">
 {loadingMore && <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
 </div>
 </>
 )}
 </div>
 </aside>
 <main className="flex-1 flex flex-col bg-base overflow-hidden relative">
 <ErrorBoundary area="YouTube Player">
 <YouTubeInlinePlayer video={selectedVideo} onUpdate={() => loadData(true)} onNext={handleNext} onPrev={handlePrev} onEnded={() => { if (autoplay) handleNext(); }} />
 </ErrorBoundary>
 </main>
 </div>
 ) : (
 <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
 {loading ? (
 <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
 ) : selectedPlaylist ? (
 filteredVideos.length === 0 ? (
 <div className="flex flex-col items-center justify-center text-text-muted mt-20">
 <div className="w-12 h-12 rounded-full bg-elevated/50 flex items-center justify-center mb-4"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></div>
 <p className="font-medium">No videos match your search.</p>
 </div>
 ) : (
 <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" : "flex flex-col gap-2"}>
 {filteredVideos.map((v) => (<div key={v.id} onClick={(e) => handleVideoClick(v, e)}><VideoPill video={v} multiSelected={selectedVideoIds.has(v.id)} onUpdate={() => loadData(true)} viewMode={viewMode} onSelectToggle={() => handleSelectToggle(v)} /></div>))}
 </div>
 )
 ) : activeTab === "videos" ? (
 filteredVideos.length === 0 ? (
 <div className="flex flex-col items-center justify-center text-text-muted mt-20">
 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
 <p>No videos match your filter.</p>
 {allActiveCount > 0 && <button onClick={() => { filters.clearAll(); setAnalyticsDate(""); }} className="mt-3 text-xs font-bold text-accent hover:underline">Clear all filters</button>}
 </div>
 ) : (
 <div className="flex flex-col">
 {viewMode === "grid" && ytGroups.length > 0 ? (
 ytGroups.map((group) => (
 <section key={group.dateKey} className="mb-8 last:mb-0">
 <div className="flex items-center gap-3 mb-4">
 <div className="flex items-center gap-2 bg-elevated border border-border-subtle rounded-full px-3 py-0.5 shrink-0">
 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
 <span className="font-bold text-text-primary text-[13px]">{group.label}</span>
 </div>
 <span className="text-xs text-text-muted font-semibold bg-elevated/80 border border-border-subtle px-2 py-0.5 rounded-full shrink-0">{group.videos.length} video{group.videos.length !== 1 ? "s" : ""}</span>
 <div className="flex-1 h-px shrink-0" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07) 0%, transparent 100%)" }} />
 </div>
 <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
 {group.videos.map((v) => (<div key={v.id} onClick={(e) => handleVideoClick(v, e)}><VideoPill video={v} multiSelected={selectedVideoIds.has(v.id)} onUpdate={() => loadData(true)} viewMode={viewMode} onSelectToggle={(e) => handleSelectToggle(v)} /></div>))}
 </div>
 </section>
 ))
 ) : (
 <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" : "flex flex-col gap-2"}>
 {filteredVideos.map((v) => (<div key={v.id} onClick={(e) => handleVideoClick(v, e)}><VideoPill video={v} multiSelected={selectedVideoIds.has(v.id)} onUpdate={() => loadData(true)} viewMode={viewMode} onSelectToggle={(e) => handleSelectToggle(v)} /></div>))}
 </div>
 )}
 <div ref={loadMoreRef} className="col-span-full h-12 flex items-center justify-center shrink-0 mt-4">
 {loadingMore && <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
 </div>
 </div>
 )
 ) : playlists.length === 0 ? (
 <div className="flex flex-col items-center justify-center text-text-muted mt-20">
 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><path d="M12 3v18" /><rect x="3" y="9" width="18" height="12" rx="2" /><path d="M3 13h18" /></svg>
 <p>No playlists found.</p>
 </div>
 ) : (
 <div className={viewMode === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" : "flex flex-col gap-2"}>
 {playlists.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase())).map((p) => (
 <PlaylistCard
 key={p.id}
 playlist={p}
 viewMode={viewMode}
 multiSelected={selectedPlaylistIds.has(p.id)}
 onClick={(e) => handlePlaylistClick(p, e)}
 onSelectToggle={() => handlePlaylistSelectToggle(p)}
 onDeleted={() => loadData(true)}
 />
 ))}
 </div>
 )}
 </div>
 )}

 {/* Video Bulk Action Bar */}
 {activeTab === "videos" && (
 <ChannelBulkActionBar 
 selectedCount={selectedVideoIds.size} 
 playlists={playlists} 
 onClearSelection={() => {
 setSelectedVideoIds(new Set());
 lastSelectedId.current = null;
 }}
 onAddToPlaylist={handleAddToPlaylist}
 />
 )}

 {/* Playlist Bulk Action Bar */}
 {activeTab === "playlists" && !selectedPlaylist && (
 <PlaylistBulkActionBar
 selectedCount={selectedPlaylistIds.size}
 isUpdating={bulkUpdatingPlaylists}
 onClearSelection={() => {
 setSelectedPlaylistIds(new Set());
 lastSelectedPlaylistId.current = null;
 }}
 onUpdateVisibility={handleUpdatePlaylistsVisibility}
 />
 )}

 {/* Duplicate Warning Dialog */}
 {duplicateWarning && (
 <DuplicateWarningDialog
 isOpen={duplicateWarning.isOpen}
 playlistName={duplicateWarning.playlistName}
 duplicateCount={duplicateWarning.duplicates.length}
 totalCount={duplicateWarning.targetVideoIds.length}
 onAddAll={() => {
 processAddVideos(duplicateWarning.playlistId, duplicateWarning.targetVideoIds, []);
 }}
 onAddNewOnly={() => {
 processAddVideos(duplicateWarning.playlistId, duplicateWarning.targetVideoIds, duplicateWarning.duplicates);
 }}
 onCancel={() => {
 setDuplicateWarning(null);
 setBulkAdding(false);
 }}
 />
 )}
 </div>
 );
}
