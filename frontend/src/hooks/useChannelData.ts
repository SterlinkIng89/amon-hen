import { useState, useEffect, useRef } from "react";
import { YTVideo, YTPlaylist } from "../types";
import {
  GetChannelVideosPaginated,
  GetChannelPlaylists,
  GetPlaylistVideos,
} from "../../wailsjs/go/backend/App";
import { extractTitleDate } from "../utils/videoUtils";

type VideoSort = "recent" | "title" | "views" | "title_date";
type PlaylistSort = "recent" | "title" | "videos" | "updated";

interface UseChannelDataOptions {
  activeTab: "videos" | "playlists";
  videoSort: VideoSort;
  playlistSort: PlaylistSort;
  debouncedSearch: string;
  selectedPlaylist: YTPlaylist | null;
}

export function useChannelData({
  activeTab,
  videoSort,
  playlistSort,
  debouncedSearch,
  selectedPlaylist,
}: UseChannelDataOptions) {
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [playlistVideos, setPlaylistVideos] = useState<YTVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadData = async (reset = false) => {
    if (loading || (loadingMore && !reset)) return;

    if (reset) {
      setLoading(true);
      setPage(1);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      if (selectedPlaylist) {
        const res = await GetPlaylistVideos(selectedPlaylist.id);
        let sorted = [...(res || [])];
        if (videoSort === "title") {
          sorted.sort((a, b) => a.title.localeCompare(b.title));
        } else if (videoSort === "views") {
          sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        } else if (videoSort === "title_date") {
          sorted.sort((a, b) => {
            const dateA = extractTitleDate(a.title);
            const dateB = extractTitleDate(b.title);
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
          });
        } else {
          sorted.sort(
            (a, b) =>
              new Date(b.publishedAt).getTime() -
              new Date(a.publishedAt).getTime()
          );
        }
        setPlaylistVideos(sorted);
      } else if (activeTab === "videos") {
        const pageToLoad = reset ? 1 : page;
        const res: any = await GetChannelVideosPaginated(
          pageToLoad,
          40,
          videoSort,
          debouncedSearch
        );
        const newVideos = res.videos || [];
        if (reset) {
          setVideos(newVideos);
          setPage(2);
          // No more pages if we got everything, or fewer than a full page
          setHasMore(newVideos.length > 0 && newVideos.length < res.total);
        } else {
          if (newVideos.length === 0) {
            // Empty page — definitely at the end, stop immediately
            setHasMore(false);
          } else {
            // Capture the next combined length before the async setState
            const nextCount = pageToLoad * 40; // upper bound of what we now have
            setVideos((prev) => [...prev, ...newVideos]);
            setPage((prev) => prev + 1);
            setHasMore(newVideos.length === 40 && nextCount < res.total);
          }
        }
      } else if (activeTab === "playlists") {
        const pRes: any = await GetChannelPlaylists(
          String(playlistSort || "recent")
        );
        setPlaylists(pRes || []);
      }
    } catch (e) {
      console.error("Failed to load channel data", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Reload when any filter changes
  useEffect(() => {
    loadData(true);
  }, [activeTab, videoSort, playlistSort, debouncedSearch, selectedPlaylist]);

  // Infinite scroll observer
  useEffect(() => {
    // Guard against rapid re-fires when the sentinel is always visible (short list)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const obs = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !loading &&
          !loadingMore &&
          activeTab === "videos" &&
          !selectedPlaylist
        ) {
          if (debounceTimer) return; // already scheduled — skip
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            loadData(false);
          }, 150);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) obs.observe(loadMoreRef.current);
    return () => {
      obs.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [hasMore, loading, loadingMore, activeTab, selectedPlaylist]);

  const filteredVideos = selectedPlaylist
    ? playlistVideos.filter((v) =>
        v.title.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : videos;

  return {
    videos,
    playlists,
    filteredVideos,
    loading,
    loadingMore,
    hasMore,
    loadMoreRef,
    loadData,
  };
}
