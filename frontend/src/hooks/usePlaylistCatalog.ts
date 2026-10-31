import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ListCatalogPlaylists,
  GetPlaylistCatalogDraft,
  ApplyPlaylistCatalog,
} from "../../wailsjs/go/backend/App";
import { backend } from "../../wailsjs/go/models";

export function usePlaylistCatalog() {
  const [playlists, setPlaylists] = useState<backend.CatalogPlaylistSummary[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [draft, setDraft] = useState<backend.PlaylistCatalogDraft | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [editedTag, setEditedTag] = useState<string>("");
  const [editedEpisodes, setEditedEpisodes] = useState<Record<string, number>>({});

  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);

  const loadPlaylists = useCallback(async () => {
    setIsLoadingPlaylists(true);
    setLoadError(null);
    try {
      const result = await ListCatalogPlaylists();
      setPlaylists(result || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, []);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const selectPlaylist = useCallback(async (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setIsLoadingDraft(true);
    setDraftError(null);
    setApplyError(null);
    setApplySuccess(false);

    try {
      const result = await GetPlaylistCatalogDraft(playlistId);
      setDraft(result);
      setEditedTag(result.tag || "");

      const episodeMap: Record<string, number> = {};
      if (result.videos) {
        for (const vid of result.videos) {
          episodeMap[vid.videoId] = vid.episode > 0 ? vid.episode : (vid.existingEpisode || 1);
        }
      }
      setEditedEpisodes(episodeMap);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setDraftError(message);
      setDraft(null);
    } finally {
      setIsLoadingDraft(false);
    }
  }, []);

  const reloadDraft = useCallback(async () => {
    if (!selectedPlaylistId) return;
    try {
      const refreshed = await GetPlaylistCatalogDraft(selectedPlaylistId);
      if (refreshed) {
        setDraft(refreshed);
      }
    } catch {
      // ignore reload error
    }
  }, [selectedPlaylistId]);

  const updateVideoThumbnail = useCallback(
    (videoId: string, thumbnailUrl: string, updatedAt?: number) => {
      setDraft((prev) => {
        if (!prev || !prev.videos) return prev;
        const ts = updatedAt ?? Math.floor(Date.now() / 1000);
        return backend.PlaylistCatalogDraft.createFrom({
          ...prev,
          videos: prev.videos.map((v) =>
            v.videoId === videoId
              ? backend.CatalogVideoDraft.createFrom({
                  ...v,
                  thumbnailUrl,
                  thumbnailUpdatedAt: ts,
                })
              : v
          ),
        });
      });
    },
    []
  );

  const updatePlaylistTemplatePreview = useCallback(
    (tag: string, thumbnailUrl: string) => {
      const normalizedTag = tag.trim().toLowerCase();
      setPlaylists((prev) =>
        prev.map((pl) => {
          const plTag = (pl.tag || "").trim().toLowerCase();
          if (plTag === normalizedTag || pl.playlistId === selectedPlaylistId) {
            return backend.CatalogPlaylistSummary.createFrom({
              ...pl,
              thumbnailUrl: thumbnailUrl || pl.thumbnailUrl,
              hasCustomTemplate: true,
            });
          }
          return pl;
        })
      );
      setDraft((prev) => {
        if (!prev) return prev;
        return backend.PlaylistCatalogDraft.createFrom({
          ...prev,
          thumbnailUrl: thumbnailUrl || prev.thumbnailUrl,
          hasCustomTemplate: true,
        });
      });
    },
    [selectedPlaylistId]
  );


  const setEpisode = useCallback((videoId: string, episode: number) => {
    setEditedEpisodes((prev) => ({
      ...prev,
      [videoId]: episode,
    }));
  }, []);

  // Check conflicts in editedEpisodes
  const hasConflicts = useMemo(() => {
    const seen = new Set<number>();
    for (const ep of Object.values(editedEpisodes)) {
      if (ep <= 0) return true;
      if (seen.has(ep)) return true;
      seen.add(ep);
    }
    return false;
  }, [editedEpisodes]);

  const canApply = useMemo(() => {
    return (
      !isApplying &&
      editedTag.trim().length > 0 &&
      !hasConflicts &&
      (draft?.videos?.length ?? 0) > 0
    );
  }, [isApplying, editedTag, hasConflicts, draft?.videos?.length]);

function buildSequentialEpisodeMap(
  videos: readonly backend.CatalogVideoDraft[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < videos.length; i++) {
    map[videos[i].videoId] = i + 1;
  }
  return map;
}

  const autoNumberByDate = useCallback(() => {
    if (!draft?.videos?.length) return;
    const sorted = [...draft.videos].sort((a, b) => {
      const diff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      return diff !== 0 ? diff : a.position - b.position;
    });
    setEditedEpisodes(buildSequentialEpisodeMap(sorted));
  }, [draft?.videos]);

  const autoNumberByOrder = useCallback(() => {
    if (!draft?.videos?.length) return;
    const sorted = [...draft.videos].sort((a, b) => a.position - b.position);
    setEditedEpisodes(buildSequentialEpisodeMap(sorted));
  }, [draft?.videos]);

  const reverseEpisodes = useCallback(() => {
    if (!draft?.videos?.length) return;
    const sorted = [...draft.videos].sort((a, b) => a.position - b.position);
    const reversed = sorted
      .map((v) => editedEpisodes[v.videoId] ?? (v.episode > 0 ? v.episode : (v.existingEpisode || 1)))
      .reverse();

    const nextMap: Record<string, number> = { ...editedEpisodes };
    for (let i = 0; i < sorted.length; i++) {
      nextMap[sorted[i].videoId] = reversed[i];
    }
    setEditedEpisodes(nextMap);
  }, [draft?.videos, editedEpisodes]);

  const applyCatalog = useCallback(
    async (updateLocal = true): Promise<boolean> => {
      if (!selectedPlaylistId || !canApply) return false;

      setIsApplying(true);
      setApplyError(null);
      setApplySuccess(false);

      try {
        const req = backend.CatalogApplyRequest.createFrom({
          playlistId: selectedPlaylistId,
          tag: editedTag.trim(),
          kind: draft?.kind || "vod",
          updateLocal,
          assignments: Object.entries(editedEpisodes).map(([videoId, episode]) =>
            backend.CatalogAssignment.createFrom({ videoId, episode })
          ),
        });

        await ApplyPlaylistCatalog(req);
        setApplySuccess(true);
        await loadPlaylists();
        await reloadDraft();
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setApplyError(message);
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    [selectedPlaylistId, canApply, editedTag, editedEpisodes, draft?.kind, loadPlaylists, reloadDraft]
  );

  return {
    playlists,
    isLoadingPlaylists,
    loadError,
    loadPlaylists,
    selectedPlaylistId,
    draft,
    isLoadingDraft,
    draftError,
    selectPlaylist,
    reloadDraft,
    updateVideoThumbnail,
    updatePlaylistTemplatePreview,
    editedTag,
    setEditedTag,
    editedEpisodes,
    setEpisode,
    autoNumberByDate,
    autoNumberByOrder,
    reverseEpisodes,
    hasConflicts,
    canApply,
    isApplying,
    applyError,
    applySuccess,
    applyCatalog,
  };
}
