import { useCallback, useEffect, useRef, useState } from "react";
import {
  GetPlaylistVideos,
  GetTitleNormalizationDrafts,
  LoadConfig,
  MarkTitleNormalizationDraftSynced,
  SaveTitleNormalizationDraftsBatch,
  UpdateYouTubeVideoGameMeta,
  UpdateYouTubeVideoMetadata,
} from "../../wailsjs/go/backend/App";
import { backend } from "../../wailsjs/go/models";
import type { GameProfile, TitleNormalizationDraft, YTVideo } from "../types";
import {
  evaluateNormalizedTitle,
  extractNormalizedFields,
  type ExtractedTitleFields,
  type NormalizationStatus,
} from "../utils/titleNormalizer";
import { titlesMatch } from "../utils/videoUtils";

export type NormalizerRowStatus = NormalizationStatus | "synced";

export interface NormalizerRow {
  readonly video: YTVideo;
  readonly fields: ExtractedTitleFields;
  readonly proposedTitle: string;
  readonly missingFields: readonly string[];
  readonly status: NormalizerRowStatus;
  readonly isDirty: boolean;
  readonly isSyncing: boolean;
  readonly syncError?: string;
}

export interface BatchSyncProgress {
  readonly running: boolean;
  readonly current: number;
  readonly total: number;
  readonly successCount: number;
  readonly failCount: number;
}

export interface UsePlaylistNormalizerOptions {
  readonly playlistId: string;
  readonly initialGameTag?: string;
  readonly contentType?: "vod" | "clip";
}

export interface UsePlaylistNormalizerReturn {
  readonly rows: readonly NormalizerRow[];
  readonly isLoading: boolean;
  readonly error: string;
  readonly selectedGameTag: string;
  readonly setSelectedGameTag: (tag: string) => void;
  readonly updateRowField: (
    videoId: string,
    patch: Partial<ExtractedTitleFields> & { customVar?: { key: string; value: string } },
  ) => void;
  readonly saveDraft: (videoId: string) => Promise<void>;
  readonly saveAllDirtyDrafts: () => Promise<number>;
  readonly syncSingleVideo: (videoId: string) => Promise<boolean>;
  readonly syncBatch: (videoIds: readonly string[]) => Promise<void>;
  readonly cancelBatchSync: () => void;
  readonly batchProgress: BatchSyncProgress;
  readonly estimateQuotaCost: (count: number) => number;
  readonly reload: () => Promise<void>;
}

const YOUTUBE_UPDATE_QUOTA_COST = 50;

const IDLE_BATCH_PROGRESS: BatchSyncProgress = {
  running: false,
  current: 0,
  total: 0,
  successCount: 0,
  failCount: 0,
};

interface LoadedConfigMeta {
  readonly gameProfiles: Record<string, GameProfile>;
  readonly recentFieldValues: Record<string, string[]>;
  readonly titleSeparator?: string;
}

const EMPTY_CONFIG_META: LoadedConfigMeta = {
  gameProfiles: {},
  recentFieldValues: {},
};

function draftToFields(draft: TitleNormalizationDraft): ExtractedTitleFields {
  return {
    event: draft.event ?? "",
    gameMode: draft.gameMode ?? "",
    date: draft.dateOverride ?? "",
    dateSource: draft.dateOverride ? "manual" : "published",
    episode: draft.episode > 0 ? draft.episode : "",
    customVars: draft.customVars ? { ...draft.customVars } : {},
  };
}

function buildRowFromDraft(
  video: YTVideo,
  draft: TitleNormalizationDraft,
  gameTag: string,
  meta: LoadedConfigMeta,
  contentType?: "vod" | "clip",
): NormalizerRow {
  const fields = draftToFields(draft);
  const profile = gameTag ? meta.gameProfiles[gameTag] : undefined;
  const evaluated = evaluateNormalizedTitle(video.title, fields, {
    gameTag,
    profile,
    titleSeparator: meta.titleSeparator,
    contentType,
  });

  const referenceTitle = draft.proposedTitle || evaluated.proposedTitle;
  const isSynced =
    draft.status === "synced" &&
    Boolean(referenceTitle) &&
    titlesMatch(video.title, referenceTitle);

  return {
    video,
    fields: evaluated.fields,
    proposedTitle: evaluated.proposedTitle,
    missingFields: evaluated.missingFields,
    status: isSynced ? "synced" : evaluated.status,
    isDirty: false,
    isSyncing: false,
  };
}

function buildRowFromVideo(
  video: YTVideo,
  gameTag: string,
  meta: LoadedConfigMeta,
  contentType?: "vod" | "clip",
): NormalizerRow {
  const profile = gameTag ? meta.gameProfiles[gameTag] : undefined;
  const input = {
    currentTitle: video.title,
    publishedAt: video.publishedAt,
    gameTag,
    profile,
    titleSeparator: meta.titleSeparator,
    recentFieldValues: meta.recentFieldValues,
    contentType,
  };
  const fields = extractNormalizedFields(input);
  const evaluated = evaluateNormalizedTitle(video.title, fields, input);

  return {
    video,
    fields: evaluated.fields,
    proposedTitle: evaluated.proposedTitle,
    missingFields: evaluated.missingFields,
    status: evaluated.status,
    isDirty: false,
    isSyncing: false,
  };
}

function rowToBackendDraft(
  row: NormalizerRow,
  playlistId: string,
  gameTag: string,
  profile?: GameProfile,
): backend.TitleNormalizationDraft {
  const draftStatus =
    row.status === "synced"
      ? "synced"
      : row.status === "ready"
        ? "ready"
        : "draft";

  return backend.TitleNormalizationDraft.createFrom({
    videoId: row.video.id,
    playlistId,
    gameTag,
    profileType: profile?.type ?? "",
    event: row.fields.event,
    gameMode: row.fields.gameMode,
    dateOverride: row.fields.date,
    episode: typeof row.fields.episode === "number" ? row.fields.episode : 0,
    customVars: { ...row.fields.customVars },
    proposedTitle: row.proposedTitle,
    status: draftStatus,
    updatedAt: Math.floor(Date.now() / 1000),
  });
}

async function persistDraftRows(
  targetRows: readonly NormalizerRow[],
  playlistId: string,
  activeTag: string,
  meta: LoadedConfigMeta,
): Promise<Set<string>> {
  const payload = targetRows.map((row) => {
    const gameTag = activeTag || row.video.gameTag || "";
    const profile = gameTag ? meta.gameProfiles[gameTag] : undefined;
    return rowToBackendDraft(row, playlistId, gameTag, profile);
  });

  await SaveTitleNormalizationDraftsBatch(payload);
  return new Set(targetRows.map((r) => r.video.id));
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Manages playlist-wide title normalization rows with SQLite draft persistence,
 * YouTube API quota estimation, and cancellable single or batch syncs.
 */
export function usePlaylistNormalizer({
  playlistId,
  initialGameTag = "",
  contentType,
}: UsePlaylistNormalizerOptions): UsePlaylistNormalizerReturn {
  const [rows, setRows] = useState<readonly NormalizerRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedGameTag, setSelectedGameTagState] = useState(initialGameTag);
  const [batchProgress, setBatchProgress] =
    useState<BatchSyncProgress>(IDLE_BATCH_PROGRESS);

  const rowsRef = useRef<readonly NormalizerRow[]>(rows);
  rowsRef.current = rows;

  const selectedGameTagRef = useRef(selectedGameTag);
  selectedGameTagRef.current = selectedGameTag;

  const configMetaRef = useRef<LoadedConfigMeta>(EMPTY_CONFIG_META);
  const draftVideoIdsRef = useRef<Set<string>>(new Set());
  const loadSeqRef = useRef(0);
  const cancelRef = useRef(false);
  const batchRunningRef = useRef(false);

  const reload = useCallback(async () => {
    const trimmedPlaylistId = playlistId.trim();
    const seq = ++loadSeqRef.current;

    if (!trimmedPlaylistId) {
      setRows([]);
      setIsLoading(false);
      setError("");
      draftVideoIdsRef.current = new Set();
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const [videosResult, draftsResult, configResult] = await Promise.all([
        GetPlaylistVideos(trimmedPlaylistId),
        GetTitleNormalizationDrafts(trimmedPlaylistId),
        LoadConfig(),
      ]);

      if (loadSeqRef.current !== seq) return;

      const meta: LoadedConfigMeta = {
        gameProfiles: (configResult?.game_profiles as Record<string, GameProfile>) ?? {},
        recentFieldValues:
          (configResult?.recent_field_values as Record<string, string[]>) ?? {},
        titleSeparator: configResult?.title_separator,
      };
      configMetaRef.current = meta;

      const videos = (videosResult ?? []) as YTVideo[];
      const drafts = (draftsResult ?? []) as TitleNormalizationDraft[];
      const draftByVideoId = new Map<string, TitleNormalizationDraft>();
      const draftIds = new Set<string>();

      for (const draft of drafts) {
        draftByVideoId.set(draft.videoId, draft);
        draftIds.add(draft.videoId);
      }
      draftVideoIdsRef.current = draftIds;

      const currentTag = selectedGameTagRef.current;
      const inferredTag =
        currentTag ||
        drafts.find((d) => d.gameTag)?.gameTag ||
        videos.find((v) => v.gameTag)?.gameTag ||
        "";

      if (!currentTag && inferredTag) {
        setSelectedGameTagState(inferredTag);
        selectedGameTagRef.current = inferredTag;
      }

      const hydratedRows = videos.map((video) => {
        const draft = draftByVideoId.get(video.id);
        const rowGameTag = draft?.gameTag || inferredTag || video.gameTag || "";
        return draft
          ? buildRowFromDraft(video, draft, rowGameTag, meta, contentType)
          : buildRowFromVideo(video, rowGameTag, meta, contentType);
      });

      setRows(hydratedRows);
      rowsRef.current = hydratedRows;
    } catch (err: unknown) {
      if (loadSeqRef.current !== seq) return;
      setError(getErrorMessage(err));
    } finally {
      if (loadSeqRef.current === seq) {
        setIsLoading(false);
      }
    }
  }, [playlistId, contentType]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setSelectedGameTag = useCallback(
    (tag: string) => {
      setSelectedGameTagState(tag);
      selectedGameTagRef.current = tag;
      const meta = configMetaRef.current;
      const profile = tag ? meta.gameProfiles[tag] : undefined;

      setRows((prev) =>
        prev.map((row) => {
          if (row.isDirty || row.status === "synced") {
            return row;
          }

          if (draftVideoIdsRef.current.has(row.video.id)) {
            const evaluated = evaluateNormalizedTitle(row.video.title, row.fields, {
              gameTag: tag,
              profile,
              titleSeparator: meta.titleSeparator,
              contentType,
            });
            return {
              ...row,
              fields: evaluated.fields,
              proposedTitle: evaluated.proposedTitle,
              missingFields: evaluated.missingFields,
              status: evaluated.status,
            };
          }

          return buildRowFromVideo(row.video, tag, meta, contentType);
        }),
      );
    },
    [contentType],
  );

  const updateRowField = useCallback(
    (
      videoId: string,
      patch: Partial<ExtractedTitleFields> & { customVar?: { key: string; value: string } },
    ) => {
      const meta = configMetaRef.current;
      const activeTag = selectedGameTagRef.current;

      setRows((prev) =>
        prev.map((row) => {
          if (row.video.id !== videoId) return row;

          const { customVar, ...fieldPatch } = patch;
          const nextCustomVars = {
            ...row.fields.customVars,
            ...(fieldPatch.customVars ?? {}),
            ...(customVar ? { [customVar.key]: customVar.value } : {}),
          };

          const nextFields: ExtractedTitleFields = {
            ...row.fields,
            ...fieldPatch,
            dateSource:
              fieldPatch.date !== undefined && fieldPatch.dateSource === undefined
                ? "manual"
                : (fieldPatch.dateSource ?? row.fields.dateSource),
            customVars: nextCustomVars,
          };

          const rowGameTag = activeTag || row.video.gameTag || "";
          const profile = rowGameTag ? meta.gameProfiles[rowGameTag] : undefined;
          const evaluated = evaluateNormalizedTitle(row.video.title, nextFields, {
            gameTag: rowGameTag,
            profile,
            titleSeparator: meta.titleSeparator,
            contentType,
          });

          return {
            ...row,
            fields: evaluated.fields,
            proposedTitle: evaluated.proposedTitle,
            missingFields: evaluated.missingFields,
            status: evaluated.status,
            isDirty: true,
            syncError: undefined,
          };
        }),
      );
    },
    [contentType],
  );

  const saveDraft = useCallback(
    async (videoId: string) => {
      const row = rowsRef.current.find((r) => r.video.id === videoId);
      if (!row) return;

      const savedIds = await persistDraftRows(
        [row],
        playlistId,
        selectedGameTagRef.current,
        configMetaRef.current,
      );

      draftVideoIdsRef.current.add(videoId);
      setRows((prev) =>
        prev.map((r) => (savedIds.has(r.video.id) ? { ...r, isDirty: false } : r)),
      );
    },
    [playlistId],
  );

  const saveAllDirtyDrafts = useCallback(async (): Promise<number> => {
    const dirtyRows = rowsRef.current.filter((r) => r.isDirty);
    if (dirtyRows.length === 0) return 0;

    const savedIds = await persistDraftRows(
      dirtyRows,
      playlistId,
      selectedGameTagRef.current,
      configMetaRef.current,
    );

    for (const id of savedIds) {
      draftVideoIdsRef.current.add(id);
    }

    setRows((prev) =>
      prev.map((r) => (savedIds.has(r.video.id) ? { ...r, isDirty: false } : r)),
    );

    return dirtyRows.length;
  }, [playlistId]);

  const syncSingleVideo = useCallback(async (videoId: string): Promise<boolean> => {
    const row = rowsRef.current.find((r) => r.video.id === videoId);
    if (!row || !row.proposedTitle.trim()) {
      return false;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.video.id === videoId
          ? { ...r, isSyncing: true, syncError: undefined }
          : r,
      ),
    );

    const gameTag = selectedGameTagRef.current || row.video.gameTag || "";
    const episode = typeof row.fields.episode === "number" ? row.fields.episode : 0;

    try {
      await UpdateYouTubeVideoMetadata(videoId, row.proposedTitle, "", "");
      await UpdateYouTubeVideoGameMeta(videoId, gameTag, episode);
      await MarkTitleNormalizationDraftSynced(videoId, row.proposedTitle);

      setRows((prev) =>
        prev.map((r) =>
          r.video.id === videoId
            ? {
                ...r,
                video: {
                  ...r.video,
                  title: row.proposedTitle,
                  gameTag: gameTag || r.video.gameTag,
                  episode: episode > 0 ? episode : r.video.episode,
                },
                status: "synced",
                isDirty: false,
                isSyncing: false,
                syncError: undefined,
              }
            : r,
        ),
      );

      return true;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setRows((prev) =>
        prev.map((r) =>
          r.video.id === videoId
            ? { ...r, isSyncing: false, syncError: message }
            : r,
        ),
      );
      return false;
    }
  }, []);

  const syncBatch = useCallback(
    async (videoIds: readonly string[]) => {
      if (videoIds.length === 0 || batchRunningRef.current) return;

      batchRunningRef.current = true;
      cancelRef.current = false;
      let successCount = 0;
      let failCount = 0;
      const total = videoIds.length;

      setBatchProgress({
        running: true,
        current: 0,
        total,
        successCount: 0,
        failCount: 0,
      });

      try {
        for (let i = 0; i < total; i++) {
          if (cancelRef.current) {
            break;
          }

          const ok = await syncSingleVideo(videoIds[i]);
          if (ok) {
            successCount++;
          } else {
            failCount++;
          }

          setBatchProgress({
            running: true,
            current: i + 1,
            total,
            successCount,
            failCount,
          });
        }
      } finally {
        batchRunningRef.current = false;
        setBatchProgress((prev) => ({
          ...prev,
          running: false,
        }));
      }
    },
    [syncSingleVideo],
  );

  const cancelBatchSync = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const estimateQuotaCost = useCallback((count: number): number => {
    return Math.max(0, count) * YOUTUBE_UPDATE_QUOTA_COST;
  }, []);

  return {
    rows,
    isLoading,
    error,
    selectedGameTag,
    setSelectedGameTag,
    updateRowField,
    saveDraft,
    saveAllDirtyDrafts,
    syncSingleVideo,
    syncBatch,
    cancelBatchSync,
    batchProgress,
    estimateQuotaCost,
    reload,
  };
}
