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
  /** Exact date from analytics click — maps to dateFrom=dateTo (legacy compat) */
  dateFilter?: string;
  /** Range start date YYYY-MM-DD */
  dateFrom?: string;
  /** Range end date YYYY-MM-DD */
  dateTo?: string;
  /** Words that must NOT appear in the video title */
  excludeWords?: string[];
}

export function useChannelData({
  activeTab,
  videoSort,
  playlistSort,
  debouncedSearch,
  selectedPlaylist,
  dateFilter,
  dateFrom: rawDateFrom,
  dateTo: rawDateTo,
  excludeWords = [],
}: UseChannelDataOptions) {
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [playlistVideos, setPlaylistVideos] = useState<YTVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Resolve effective date range — legacy dateFilter takes precedence
  const effectiveDateFrom = dateFilter || rawDateFrom || "";
  const effectiveDateTo = dateFilter || rawDateTo || "";

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
            return (
              new Date(b.publishedAt).getTime() -
              new Date(a.publishedAt).getTime()
            );
          });
        } else {
          sorted.sort(
            (a, b) =>
              new Date(b.publishedAt).getTime() -
              new Date(a.publishedAt).getTime(),
          );
        }
        setPlaylistVideos(sorted);
      } else if (activeTab === "videos") {
        const pageToLoad = reset ? 1 : page;

        // Ensure playlists are loaded for the bulk action bar
        if (reset || playlists.length === 0) {
          GetChannelPlaylists(String(playlistSort || "recent"))
            .then((pRes) => setPlaylists(pRes || []))
            .catch(console.error);
        }

        const res: any = await GetChannelVideosPaginated(
          pageToLoad,
          40,
          videoSort,
          debouncedSearch,
          effectiveDateFrom,
          effectiveDateTo,
        );
        const newVideos = res.videos || [];
        if (reset) {
          setVideos(newVideos);
          setPage(2);
          setHasMore(newVideos.length > 0 && newVideos.length < res.total);
        } else {
          if (newVideos.length === 0) {
            setHasMore(false);
          } else {
            const nextCount = pageToLoad * 40;
            setVideos((prev) => [...prev, ...newVideos]);
            setPage((prev) => prev + 1);
            setHasMore(newVideos.length === 40 && nextCount < res.total);
          }
        }
      } else if (activeTab === "playlists") {
        const pRes: any = await GetChannelPlaylists(
          String(playlistSort || "recent"),
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
  }, [
    activeTab,
    videoSort,
    playlistSort,
    debouncedSearch,
    selectedPlaylist,
    effectiveDateFrom,
    effectiveDateTo,
  ]);

  // Infinite scroll observer
  useEffect(() => {
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
          if (debounceTimer) return;
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            loadData(false);
          }, 150);
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreRef.current) obs.observe(loadMoreRef.current);
    return () => {
      obs.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [hasMore, loading, loadingMore, activeTab, selectedPlaylist]);

  let filteredVideos = selectedPlaylist
    ? playlistVideos.filter((v) =>
        v.title.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : videos;

  // Apply client-side date filter for playlist videos
  if (selectedPlaylist && (effectiveDateFrom || effectiveDateTo)) {
    filteredVideos = filteredVideos.filter((v) => {
      const uploadDate = v.publishedAt?.substring(0, 10) ?? "";
      const titleDate = extractTitleDate(v.title);
      const effective = uploadDate || titleDate;
      if (effectiveDateFrom && effective < effectiveDateFrom) {
        if (!titleDate || titleDate < effectiveDateFrom) return false;
      }
      if (effectiveDateTo && effective > effectiveDateTo) {
        if (!titleDate || titleDate > effectiveDateTo) return false;
      }
      return true;
    });
  }

  // Apply exclude words filter (frontend-only, case-insensitive)
  if (excludeWords.length > 0) {
    const lowerWords = excludeWords.map((w) => w.toLowerCase());
    filteredVideos = filteredVideos.filter((v) => {
      const lowerTitle = v.title.toLowerCase();
      return !lowerWords.some((word) => lowerTitle.includes(word));
    });
  }

  return {
    videos,
    playlists,
    playlistVideos,
    filteredVideos,
    loading,
    loadingMore,
    hasMore,
    loadMoreRef,
    loadData,
  };
}
