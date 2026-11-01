import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

  const selectSeqRef = useRef(0);

  const selectPlaylist = useCallback(async (playlistId: string) => {
    const seq = ++selectSeqRef.current;
    setSelectedPlaylistId(playlistId);
    setIsLoadingDraft(true);
    setDraft(null);
    setEditedTag("");
    setEditedEpisodes({});
    setDraftError(null);
    setApplyError(null);
    setApplySuccess(false);

    try {
      const result = await GetPlaylistCatalogDraft(playlistId);
      if (selectSeqRef.current !== seq) {
        return;
      }
      setDraft(result);
      setEditedTag(result.tag || "");

      const episodeMap: Record<string, number> = {};
      if (result.videos) {
        for (const vid of result.videos) {
          episodeMap[vid.videoId] = vid.episode > 0 ? vid.episode : (vid.existingEpisode > 0 ? vid.existingEpisode : 0);
        }
      }
      setEditedEpisodes(episodeMap);
    } catch (err: unknown) {
      if (selectSeqRef.current !== seq) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setDraftError(message);
      setDraft(null);
    } finally {
      if (selectSeqRef.current === seq) {
        setIsLoadingDraft(false);
      }
    }
  }, []);

  const reloadDraft = useCallback(async () => {
    if (!selectedPlaylistId) return;
    const seq = ++selectSeqRef.current;
    try {
      const refreshed = await GetPlaylistCatalogDraft(selectedPlaylistId);
      if (selectSeqRef.current !== seq) return;
      if (refreshed) {
        setDraft(refreshed);
        setEditedTag((prev) => prev || refreshed.tag || "");
        if (refreshed.videos) {
          setEditedEpisodes((prev) => {
            const next = { ...prev };
            for (const vid of refreshed.videos) {
              if (next[vid.videoId] === undefined) {
                next[vid.videoId] = vid.episode > 0 ? vid.episode : (vid.existingEpisode > 0 ? vid.existingEpisode : 0);
              }
            }
            return next;
          });
        }
      }
    } catch {
      // ignore reload error
    }
  }, [selectedPlaylistId]);

  const updateVideoThumbnail = useCallback(
    (
      videoId: string,
      thumbnailUrl: string,
      updatedAt?: number,
      thumbnailEpisode?: number
    ) => {
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
                  ...(thumbnailEpisode !== undefined ? { thumbnailEpisode } : {}),
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

  const syncVideoFromTitle = useCallback((videoId: string) => {
    if (!draft?.videos) return;
    const target = draft.videos.find((v) => v.videoId === videoId);
    if (!target || !target.titleEpisode || target.titleEpisode <= 0) return;
    setEditedEpisodes((prev) => {
      if (prev[videoId] === target.titleEpisode) return prev;
      return {
        ...prev,
        [videoId]: target.titleEpisode,
      };
    });
  }, [draft?.videos]);

  const syncAllFromTitle = useCallback(() => {
    if (!draft?.videos?.length) return;
    setEditedEpisodes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const vid of draft.videos) {
        if (vid.titleEpisode && vid.titleEpisode > 0) {
          if (next[vid.videoId] !== vid.titleEpisode) {
            next[vid.videoId] = vid.titleEpisode;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [draft?.videos]);

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

  const mismatchCount = useMemo(() => {
    if (!draft?.videos?.length) return 0;
    let count = 0;
    for (const vid of draft.videos) {
      if (vid.titleEpisode && vid.titleEpisode > 0) {
        const currentEp = editedEpisodes[vid.videoId] ?? 0;
        if (currentEp !== vid.titleEpisode) {
          count++;
        }
      }
    }
    return count;
  }, [draft?.videos, editedEpisodes]);

  const chronologyIssueIds = useMemo<ReadonlySet<string>>(() => {
    if (!draft?.videos || draft.videos.length < 2) {
      return new Set<string>();
    }

    const assigned = draft.videos.filter((v) => (editedEpisodes[v.videoId] ?? 0) > 0);
    if (assigned.length < 2) {
      return new Set<string>();
    }

    const sorted = [...assigned].sort(compareVideoChronology);
    const n = sorted.length;
    const prefixMax: number[] = new Array(n);
    prefixMax[0] = editedEpisodes[sorted[0].videoId] ?? 0;
    for (let i = 1; i < n; i++) {
      const ep = editedEpisodes[sorted[i].videoId] ?? 0;
      prefixMax[i] = ep > prefixMax[i - 1] ? ep : prefixMax[i - 1];
    }

    const suffixMin: number[] = new Array(n);
    suffixMin[n - 1] = editedEpisodes[sorted[n - 1].videoId] ?? 0;
    for (let i = n - 2; i >= 0; i--) {
      const ep = editedEpisodes[sorted[i].videoId] ?? 0;
      suffixMin[i] = ep < suffixMin[i + 1] ? ep : suffixMin[i + 1];
    }

    const issues = new Set<string>();
    for (let i = 0; i < n; i++) {
      const ep = editedEpisodes[sorted[i].videoId] ?? 0;
      if ((i > 0 && ep <= prefixMax[i - 1]) || (i < n - 1 && ep >= suffixMin[i + 1])) {
        issues.add(sorted[i].videoId);
      }
    }

    return issues;
  }, [draft?.videos, editedEpisodes]);

  const hasChronologyErrors = useMemo(() => {
    return chronologyIssueIds.size > 0;
  }, [chronologyIssueIds]);

  const canApply = useMemo(() => {
    return (
      !isApplying &&
      editedTag.trim().length > 0 &&
      !hasConflicts &&
      !hasChronologyErrors &&
      (draft?.videos?.length ?? 0) > 0
    );
  }, [isApplying, editedTag, hasConflicts, hasChronologyErrors, draft?.videos?.length]);

  const autoNumberByDate = useCallback(() => {
    if (!draft?.videos?.length) return;
    const sorted = [...draft.videos].sort(compareVideoChronology);
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
      .map((v) => editedEpisodes[v.videoId] ?? (v.episode > 0 ? v.episode : (v.existingEpisode > 0 ? v.existingEpisode : 0)))
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
    syncVideoFromTitle,
    syncAllFromTitle,
    mismatchCount,
    chronologyIssueIds,
    hasChronologyErrors,
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

export function compareVideoChronology(
  a: backend.CatalogVideoDraft,
  b: backend.CatalogVideoDraft
): number {
  const dateA = a.sortDate || a.publishedAt || "";
  const dateB = b.sortDate || b.publishedAt || "";
  const prefixA = dateA.length >= 10 ? dateA.slice(0, 10) : dateA;
  const prefixB = dateB.length >= 10 ? dateB.slice(0, 10) : dateB;

  if (prefixA !== prefixB) {
    return prefixA < prefixB ? -1 : 1;
  }
  if (a.publishedAt !== b.publishedAt) {
    return a.publishedAt < b.publishedAt ? -1 : 1;
  }
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  if (a.videoId !== b.videoId) {
    return a.videoId < b.videoId ? -1 : 1;
  }
  return 0;
}

function buildSequentialEpisodeMap(
  videos: readonly backend.CatalogVideoDraft[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < videos.length; i++) {
    map[videos[i].videoId] = i + 1;
  }
  return map;
}
