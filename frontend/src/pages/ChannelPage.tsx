import { useState, useEffect } from "react";
import { YTVideo, YTPlaylist } from "../types";
import {
  GetChannelVideos,
  GetChannelPlaylists,
  SyncChannelData,
  GetPlaylistVideos,
} from "../../wailsjs/go/main/App";

import ChannelVideoCard from "../components/youtube/ChannelVideoCard";
import PlaylistCard from "../components/youtube/PlaylistCard";

export default function ChannelPage() {
  const [activeTab, setActiveTab] = useState<"videos" | "playlists">("videos");
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [playlistSort, setPlaylistSort] = useState<
    "recent" | "title" | "videos"
  >("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPlaylist, setSelectedPlaylist] = useState<YTPlaylist | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<YTVideo[]>([]);

  useEffect(() => {
    loadData();
  }, [activeTab, playlistSort, selectedPlaylist]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (selectedPlaylist) {
        const res = await GetPlaylistVideos(selectedPlaylist.id);
        setPlaylistVideos(res || []);
      } else if (activeTab === "videos") {
        const res: any = await GetChannelVideos(1, 100);
        setVideos(res.videos || []);
      } else {
        console.log("Fetching playlists with sort:", playlistSort);
        const res: any = await GetChannelPlaylists(
          String(playlistSort || "recent"),
        );
        setPlaylists(res || []);
      }
    } catch (e) {
      console.error("Failed to load channel data", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      <div className="flex items-center gap-6 px-6 py-4 border-b border-border-subtle bg-surface/50 backdrop-blur-md shrink-0">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-accent"
          >
            <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
          </svg>
          Channel
        </h1>
        <button
          className={`btn btn-ghost p-2 rounded-full hover:bg-elevated transition-all ${loading ? "animate-spin opacity-50" : ""}`}
          onClick={async () => {
            setLoading(true);
            try {
              await SyncChannelData();
            } catch (e) {
              console.error("Sync failed", e);
            }
            loadData();
          }}
          title="Sync with YouTube"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 2v6h-6"></path>
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
            <path d="M3 22v-6h6"></path>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
          </svg>
        </button>
        <div className="flex bg-elevated rounded-lg p-1 border border-border-subtle">
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
              activeTab === "videos"
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => {
              setActiveTab("videos");
              setSelectedPlaylist(null);
            }}
          >
            Videos
          </button>
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
              activeTab === "playlists"
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => {
              setActiveTab("playlists");
              setSelectedPlaylist(null);
            }}
          >
            Playlists
          </button>
        </div>

        {activeTab === "playlists" && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-medium text-text-secondary">
              Sort by:
            </span>
            <select
              className="bg-elevated border border-border-subtle rounded-md px-2 py-1.5 text-xs font-semibold text-text-primary outline-none focus:border-accent cursor-pointer hover:border-border-medium transition-colors"
              value={playlistSort}
              onChange={(e) => setPlaylistSort(e.target.value as any)}
            >
              <option value="recent">Most Recent</option>
              <option value="title">A-Z Name</option>
              <option value="videos">Most Videos</option>
            </select>
          </div>
        )}

        <div className="flex bg-elevated rounded-lg p-1 border border-border-subtle ml-2">
          <button
            className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
            onClick={() => setViewMode("grid")}
            title="Grid View"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button
            className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
            onClick={() => setViewMode("list")}
            title="List View"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : selectedPlaylist ? (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedPlaylist(null)}
                className="btn btn-elevated p-2 rounded-full hover:bg-surface transition-all text-text-secondary hover:text-text-primary"
                title="Go back to playlists"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-bold text-text-primary">{selectedPlaylist.title}</h2>
                <p className="text-xs text-text-muted">{selectedPlaylist.videoCount} videos</p>
              </div>
            </div>

            <div className={viewMode === "grid" ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6" : "flex flex-col gap-3"}>
              {playlistVideos.map((v) => (
                <ChannelVideoCard
                  key={v.id}
                  video={v}
                  onUpdate={loadData}
                  viewMode={viewMode}
                />
              ))}
            </div>
          </div>
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
                  ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
                  : "flex flex-col gap-3"
              }
            >
              {videos.map((v) => (
                <ChannelVideoCard
                  key={v.id}
                  video={v}
                  onUpdate={loadData}
                  viewMode={viewMode}
                />
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
                ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6"
                : "flex flex-col gap-3"
            }
          >
            {playlists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} viewMode={viewMode} onClick={() => setSelectedPlaylist(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
