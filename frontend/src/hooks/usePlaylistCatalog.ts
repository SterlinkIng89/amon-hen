import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ListCatalogPlaylists,
  GetPlaylistCatalogDraft,
  ApplyPlaylistCatalog,
  PreviewCatalogTitleUpdates,
  ApplyCatalogTitleUpdates,
} from "../../wailsjs/go/backend/App";
import { backend } from "../../wailsjs/go/models";
import { renumberAfterReorder } from "../utils/episodeRenumber";

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

  const reorderDuplicate = useCallback(
    (duplicateEpisode: number, orderedVideoIds: readonly string[]) => {
      setEditedEpisodes((prev) =>
        renumberAfterReorder(prev, duplicateEpisode, orderedVideoIds)
      );
    },
    []
  );

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

    type DayStat = { minEp: number; maxEp: number; videos: backend.CatalogVideoDraft[] };
    const dayMap = new Map<string, DayStat>();

    for (const v of assigned) {
      const date = getVideoCalendarDate(v);
      if (!date) continue;
      const ep = editedEpisodes[v.videoId] ?? 0;
      if (ep <= 0) continue;

      const stat = dayMap.get(date);
      if (stat) {
        if (ep < stat.minEp) stat.minEp = ep;
        if (ep > stat.maxEp) stat.maxEp = ep;
        stat.videos.push(v);
      } else {
        dayMap.set(date, { minEp: ep, maxEp: ep, videos: [v] });
      }
    }

    if (dayMap.size < 2) {
      return new Set<string>();
    }

    const sortedDates = Array.from(dayMap.keys()).sort();
    const k = sortedDates.length;
    const prefixMax = new Array<number>(k);
    prefixMax[0] = dayMap.get(sortedDates[0])!.maxEp;
    for (let i = 1; i < k; i++) {
      const maxEp = dayMap.get(sortedDates[i])!.maxEp;
      prefixMax[i] = maxEp > prefixMax[i - 1] ? maxEp : prefixMax[i - 1];
    }

    const suffixMin = new Array<number>(k);
    suffixMin[k - 1] = dayMap.get(sortedDates[k - 1])!.minEp;
    for (let i = k - 2; i >= 0; i--) {
      const minEp = dayMap.get(sortedDates[i])!.minEp;
      suffixMin[i] = minEp < suffixMin[i + 1] ? minEp : suffixMin[i + 1];
    }

    const issues = new Set<string>();
    for (let i = 0; i < k; i++) {
      const { videos } = dayMap.get(sortedDates[i])!;
      for (const v of videos) {
        const ep = editedEpisodes[v.videoId] ?? 0;
        if ((i > 0 && ep <= prefixMax[i - 1]) || (i < k - 1 && ep >= suffixMin[i + 1])) {
          issues.add(v.videoId);
        }
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

  const [isUpdatingTitles, setIsUpdatingTitles] = useState(false);
  const [titleUpdateError, setTitleUpdateError] = useState<string | null>(null);

  const previewTitleUpdates = useCallback(async (): Promise<backend.CatalogTitleChange[]> => {
    if (!draft?.videos?.length) return [];
    try {
      const assignments = Object.entries(editedEpisodes).map(([videoId, episode]) =>
        backend.CatalogAssignment.createFrom({ videoId, episode })
      );
      return await PreviewCatalogTitleUpdates(assignments);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTitleUpdateError(message);
      return [];
    }
  }, [draft?.videos, editedEpisodes]);

  const applyTitleUpdates = useCallback(async (): Promise<backend.CatalogTitleUpdateResult | null> => {
    if (!draft?.videos?.length) return null;
    setIsUpdatingTitles(true);
    setTitleUpdateError(null);
    try {
      const assignments = Object.entries(editedEpisodes).map(([videoId, episode]) =>
        backend.CatalogAssignment.createFrom({ videoId, episode })
      );
      const res = await ApplyCatalogTitleUpdates(assignments);
      await reloadDraft();
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTitleUpdateError(message);
      return null;
    } finally {
      setIsUpdatingTitles(false);
    }
  }, [draft?.videos, editedEpisodes, reloadDraft]);

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
    reorderDuplicate,
    syncVideoFromTitle,
    syncAllFromTitle,
    mismatchCount,
    chronologyIssueIds,
    hasChronologyErrors,
    autoNumberByDate,
    hasConflicts,
    canApply,
    isApplying,
    applyError,
    applySuccess,
    applyCatalog,
    isUpdatingTitles,
    titleUpdateError,
    previewTitleUpdates,
    applyTitleUpdates,
  };
}

export function getVideoCalendarDate(v: backend.CatalogVideoDraft): string {
  const d = v.sortDate || v.publishedAt || "";
  return d.length >= 10 ? d.slice(0, 10) : d;
}

export function compareVideoChronology(
  a: backend.CatalogVideoDraft,
  b: backend.CatalogVideoDraft
): number {
  const dateA = getVideoCalendarDate(a);
  const dateB = getVideoCalendarDate(b);

  if (dateA !== dateB) {
    if (dateA && dateB) {
      return dateA < dateB ? -1 : 1;
    }
    if (dateA) return -1;
    if (dateB) return 1;
  }

  // Same calendar date: do NOT use publishedAt upload time.
  const titleEpA = a.titleEpisode ?? 0;
  const titleEpB = b.titleEpisode ?? 0;
  if (titleEpA > 0 && titleEpB > 0 && titleEpA !== titleEpB) {
    return titleEpA - titleEpB;
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
