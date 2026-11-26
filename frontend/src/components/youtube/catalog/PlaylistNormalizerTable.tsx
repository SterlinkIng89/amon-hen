import { FC, useMemo, useState } from "react";
import {
  usePlaylistNormalizer,
  type NormalizerRowStatus,
} from "../../../hooks/usePlaylistNormalizer";
import type { GameProfile, YTVideo } from "../../../types";
import { PlaylistNormalizerRow } from "./PlaylistNormalizerRow";

export type NormalizerFilter = "all" | NormalizerRowStatus;

export interface PlaylistNormalizerTableProps {
  readonly playlistId: string;
  readonly defaultGameTag?: string;
  readonly gameProfiles: Record<string, GameProfile>;
  readonly recentFieldValues?: Record<string, string[]>;
  readonly onWatchVideo: (video: YTVideo, gameTag: string) => void;
}

const FILTER_OPTIONS: ReadonlyArray<{
  readonly key: NormalizerFilter;
  readonly label: string;
}> = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs review" },
  { key: "ready", label: "Ready" },
  { key: "already_normalized", label: "Already normalized" },
  { key: "synced", label: "Synced" },
];

export const PlaylistNormalizerTable: FC<PlaylistNormalizerTableProps> = ({
  playlistId,
  defaultGameTag = "",
  gameProfiles,
  onWatchVideo,
}) => {
  const {
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
  } = usePlaylistNormalizer({
    playlistId,
    initialGameTag: defaultGameTag,
  });

  const [filter, setFilter] = useState<NormalizerFilter>("all");
  const [isSavingAll, setIsSavingAll] = useState(false);

  const counts = useMemo(() => {
    const next: Record<NormalizerFilter, number> = {
      all: rows.length,
      needs_review: 0,
      ready: 0,
      already_normalized: 0,
      synced: 0,
    };

    for (const row of rows) {
      next[row.status]++;
    }
    return next;
  }, [rows]);

  const dirtyCount = useMemo(
    () => rows.filter((row) => row.isDirty).length,
    [rows],
  );

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => row.status === filter);
  }, [rows, filter]);

  const visibleReadyIds = useMemo(
    () =>
      filteredRows
        .filter((row) => row.status === "ready")
        .map((row) => row.video.id),
    [filteredRows],
  );

  const syncableCount = counts.ready;
  const quotaUnits = estimateQuotaCost(syncableCount);
  const activeProfile = selectedGameTag
    ? gameProfiles[selectedGameTag]
    : undefined;
  const profileKeys = useMemo(() => Object.keys(gameProfiles), [gameProfiles]);

  const handleSaveAllDrafts = async () => {
    if (dirtyCount === 0 || isSavingAll) return;
    setIsSavingAll(true);
    try {
      await saveAllDirtyDrafts();
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleSyncReady = () => {
    if (visibleReadyIds.length === 0 || batchProgress.running) return;
    void syncBatch(visibleReadyIds);
  };

  const progressPercent =
    batchProgress.total > 0
      ? Math.round((batchProgress.current / batchProgress.total) * 100)
      : 0;

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading playlist normalizer"
        className="border border-border-subtle rounded-xl overflow-hidden bg-surface p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="h-8 w-44 rounded bg-elevated animate-pulse" />
          <div className="h-8 w-64 rounded bg-elevated animate-pulse" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-16 w-full rounded-lg bg-elevated/60 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="border border-border-fire rounded-xl bg-fire-dim/20 p-4 flex items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-red-400">
            Failed to load playlist videos
          </h3>
          <p className="text-xs text-text-secondary">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="px-3 py-1.5 rounded-md bg-elevated hover:bg-elevated/80 border border-border-subtle text-xs font-medium text-text-primary transition-colors cursor-pointer shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface">
      {/* Toolbar */}
      <div className="p-3 border-b border-border-subtle bg-elevated/40 flex flex-col gap-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Profile Selector */}
            <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
              <span className="font-medium">Profile</span>
              <select
                aria-label="Profile"
                value={selectedGameTag}
                onChange={(e) => setSelectedGameTag(e.target.value)}
                disabled={batchProgress.running}
                className="bg-elevated border border-border-subtle rounded-md px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent cursor-pointer disabled:opacity-50"
              >
                <option value="">Singleplayer / Default</option>
                {profileKeys.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>

            {/* Filter Pills */}
            <div className="inline-flex flex-wrap rounded-lg border border-border-subtle bg-base p-0.5">
              {FILTER_OPTIONS.map((option) => {
                const isActive = filter === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key)}
                    aria-pressed={isActive}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "bg-elevated text-text-primary shadow-xs"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {option.label}{" "}
                    <span className="font-mono tabular-nums">
                      ({counts[option.key]})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quota & Batch Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              data-testid="quota-indicator"
              className="text-[11px] text-text-secondary font-mono tabular-nums"
            >
              {syncableCount} {syncableCount === 1 ? "video" : "videos"} ·{" "}
              {quotaUnits} quota units
            </span>

            <button
              type="button"
              onClick={() => void handleSaveAllDrafts()}
              disabled={dirtyCount === 0 || isSavingAll || batchProgress.running}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-elevated hover:bg-elevated/80 border border-border-subtle text-[11px] font-medium text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Save All Drafts</span>
              {dirtyCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono tabular-nums text-[10px]">
                  {dirtyCount}
                </span>
              )}
            </button>

            {batchProgress.running ? (
              <button
                type="button"
                onClick={cancelBatchSync}
                className="px-2.5 py-1 rounded-md bg-fire-dim/30 hover:bg-fire-dim/50 border border-border-fire text-[11px] font-medium text-red-400 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSyncReady}
                disabled={visibleReadyIds.length === 0}
                className="px-2.5 py-1 rounded-md bg-accent/15 hover:bg-accent/25 border border-accent/30 text-[11px] font-medium text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sync Ready{" "}
                <span className="font-mono tabular-nums">
                  ({visibleReadyIds.length})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Batch Sync Progress */}
        {batchProgress.running && (
          <div className="space-y-1.5 pt-2 border-t border-border-subtle">
            <div className="flex items-center justify-between text-[11px] text-text-secondary">
              <span className="tabular-nums">
                Syncing titles ({batchProgress.current}/{batchProgress.total}) ·{" "}
                {batchProgress.successCount} succeeded, {batchProgress.failCount} failed
              </span>
              <span className="font-mono tabular-nums text-text-primary font-medium">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="py-12 px-4 text-center space-y-2">
          <p className="text-xs font-medium text-text-primary">
            No videos found in this playlist.
          </p>
          <p className="text-xs text-text-muted">
            Refresh the playlist to fetch videos and evaluate title templates.
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-1 px-3 py-1.5 rounded-md bg-elevated hover:bg-elevated/80 border border-border-subtle text-xs font-medium text-text-primary transition-colors cursor-pointer"
          >
            Reload
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[540px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-xs min-w-[960px]">
            <thead className="sticky top-0 bg-elevated/95 backdrop-blur-xs text-text-secondary border-b border-border-subtle z-10">
              <tr>
                <th scope="col" className="py-2.5 px-3 font-semibold text-[11px] w-24">
                  Preview
                </th>
                <th scope="col" className="py-2.5 px-3 font-semibold text-[11px]">
                  Original title
                </th>
                <th scope="col" className="py-2.5 px-3 font-semibold text-[11px]">
                  Fields
                </th>
                <th scope="col" className="py-2.5 px-3 font-semibold text-[11px]">
                  Proposed title
                </th>
                <th scope="col" className="py-2.5 px-3 font-semibold text-[11px] w-32 text-center">
                  Status
                </th>
                <th scope="col" className="py-2.5 px-3 font-semibold text-[11px] w-44 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-text-muted">
                    No videos match the selected filter.{" "}
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className="text-accent hover:underline cursor-pointer"
                    >
                      Show all
                    </button>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <PlaylistNormalizerRow
                    key={row.video.id}
                    row={row}
                    activeProfile={activeProfile}
                    isBatchRunning={batchProgress.running}
                    onUpdateField={updateRowField}
                    onWatchVideo={(video) => onWatchVideo(video, selectedGameTag)}
                    onSaveDraft={(videoId) => void saveDraft(videoId)}
                    onSyncRow={(videoId) => void syncSingleVideo(videoId)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
