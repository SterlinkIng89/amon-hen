import { FC, useMemo, useState } from "react";
import { backend } from "../../../../wailsjs/go/models";
import { BatchItem } from "../../../types";
import { OverwriteImpact } from "../../../hooks/usePlaylistCatalog";
import { PlaylistEpisodeRow } from "./PlaylistEpisodeRow";

export type VideoFilter = "all" | "mismatch" | "needs-thumb" | "synced";

export type SortColumn = "video" | "source" | "episode" | "order" | "status";
export type SortDirection = "asc" | "desc";

export interface ColumnSortState {
  readonly column: SortColumn;
  readonly direction: SortDirection;
}

export interface PlaylistEpisodeTableProps {
  readonly videos: readonly backend.CatalogVideoDraft[];
  readonly episodes: Readonly<Record<string, number>>;
  readonly onEpisodeChange: (videoId: string, episode: number) => void;
  readonly batchItems?: readonly BatchItem[];
  readonly selectedVideoIds?: ReadonlySet<string>;
  readonly onSelectionChange?: (nextSelected: Set<string>) => void;
  readonly previewVideoId?: string | null;
  readonly onSelectPreviewVideo?: (videoId: string) => void;
  readonly onUpdateSingleVideo?: (videoId: string) => void;
  readonly isBatchRunning?: boolean;
  readonly isAssetsReady?: boolean;
  readonly onAutoNumberByDate?: () => void;
  readonly onAutoNumberByOrder?: () => void;
  readonly onReverseEpisodes?: () => void;
  readonly onSyncVideoFromTitle?: (videoId: string) => void;
  readonly onSyncAllFromTitle?: () => void;
  readonly chronologyIssueIds?: ReadonlySet<string>;
  readonly isReverseChronological?: boolean;
  readonly getNumberingImpact?: (mode: "date" | "order" | "reverse") => OverwriteImpact;
}

export function isVideoThumbnailSynced(
  video: backend.CatalogVideoDraft,
  assignedEpisode?: number,
  batchItem?: BatchItem
): boolean {
  const currentAssigned = assignedEpisode ?? (video.episode > 0 ? video.episode : 0);
  const recordedEpisode = batchItem?.thumbnailEpisode ?? video.thumbnailEpisode ?? 0;

  if (recordedEpisode > 0 && currentAssigned > 0 && recordedEpisode !== currentAssigned) {
    return false;
  }

  return (
    (batchItem?.thumbnailUpdatedAt ?? video.thumbnailUpdatedAt ?? 0) > 0 ||
    batchItem?.status === "done"
  );
}

interface SortableHeaderProps {
  readonly column: SortColumn;
  readonly label: string;
  readonly activeColumn?: SortColumn;
  readonly direction?: SortDirection;
  readonly className?: string;
  readonly onSort: (col: SortColumn) => void;
}

const SortableHeader: FC<SortableHeaderProps> = ({
  column,
  label,
  activeColumn,
  direction,
  className = "",
  onSort,
}) => {
  const isActive = activeColumn === column;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(column)}
      className={`py-2.5 px-3 font-semibold text-[11px] cursor-pointer select-none hover:text-text-primary transition-colors ${className}`}
    >
      <div className="inline-flex items-center justify-center gap-1 w-full">
        <span>{label}</span>
        {isActive ? (
          <span className="text-accent text-[10px]" aria-hidden="true">
            {direction === "asc" ? "▲" : "▼"}
          </span>
        ) : (
          <span className="text-text-muted/40 text-[10px]" aria-hidden="true">
            ↕
          </span>
        )}
      </div>
    </th>
  );
};

export const PlaylistEpisodeTable: FC<PlaylistEpisodeTableProps> = ({
  videos,
  episodes,
  onEpisodeChange,
  batchItems = [],
  selectedVideoIds,
  onSelectionChange,
  previewVideoId,
  onSelectPreviewVideo,
  onUpdateSingleVideo,
  isBatchRunning = false,
  isAssetsReady = true,
  onAutoNumberByDate,
  onAutoNumberByOrder,
  onReverseEpisodes,
  onSyncVideoFromTitle,
  onSyncAllFromTitle,
  chronologyIssueIds,
  isReverseChronological = false,
  getNumberingImpact,
}) => {
  const [filter, setFilter] = useState<VideoFilter>("all");
  const [sortState, setSortState] = useState<ColumnSortState | null>(null);
  const [pendingNumbering, setPendingNumbering] = useState<{
    readonly mode: "date" | "order" | "reverse";
    readonly impact: OverwriteImpact;
  } | null>(null);

  const batchItemMap = useMemo(() => {
    const map = new Map<string, BatchItem>();
    for (const item of batchItems) {
      map.set(item.videoId, item);
    }
    return map;
  }, [batchItems]);

  const episodeCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const ep of Object.values(episodes)) {
      if (ep > 0) {
        counts[ep] = (counts[ep] || 0) + 1;
      }
    }
    return counts;
  }, [episodes]);

  const mismatchCount = useMemo(() => {
    let count = 0;
    for (const vid of videos) {
      const titleEp = vid.titleEpisode ?? 0;
      if (titleEp > 0) {
        const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
        if (assigned !== titleEp) {
          count++;
        }
      }
    }
    return count;
  }, [videos, episodes]);

  const { syncedCount, unsyncedCount } = useMemo(() => {
    let synced = 0;
    for (const vid of videos) {
      const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
      if (isVideoThumbnailSynced(vid, assigned, batchItemMap.get(vid.videoId))) {
        synced++;
      }
    }
    return { syncedCount: synced, unsyncedCount: videos.length - synced };
  }, [videos, episodes, batchItemMap]);

  const filteredVideos = useMemo(() => {
    if (filter === "all") return videos;
    if (filter === "mismatch") {
      return videos.filter((vid) => {
        const titleEp = vid.titleEpisode ?? 0;
        if (titleEp <= 0) return false;
        const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
        return assigned !== titleEp;
      });
    }
    return videos.filter((vid) => {
      const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
      const isSynced = isVideoThumbnailSynced(vid, assigned, batchItemMap.get(vid.videoId));
      return filter === "synced" ? isSynced : !isSynced;
    });
  }, [videos, filter, batchItemMap, episodes]);

  const sortedVideos = useMemo(() => {
    if (!sortState) return filteredVideos;

    const { column, direction } = sortState;
    const mult = direction === "asc" ? 1 : -1;

    return [...filteredVideos].sort((a, b) => {
      if (column === "video") {
        const cmp = a.title.localeCompare(b.title);
        return cmp !== 0 ? cmp * mult : a.position - b.position;
      }
      if (column === "source") {
        const srcA = a.source || "";
        const srcB = b.source || "";
        const cmp = srcA.localeCompare(srcB);
        return cmp !== 0 ? cmp * mult : a.position - b.position;
      }
      if (column === "episode") {
        const epA = episodes[a.videoId] ?? (a.episode > 0 ? a.episode : 0);
        const epB = episodes[b.videoId] ?? (b.episode > 0 ? b.episode : 0);
        if (epA !== epB) {
          return (epA - epB) * mult;
        }
        return a.position - b.position;
      }
      if (column === "order") {
        return (a.position - b.position) * mult;
      }
      if (column === "status") {
        const getStatusPriority = (vid: backend.CatalogVideoDraft): number => {
          const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
          const isDuplicate = assigned > 0 && (episodeCounts[assigned] || 0) > 1;
          const isInvalid = assigned <= 0;
          if (isDuplicate || isInvalid) return 1;
          if (chronologyIssueIds?.has(vid.videoId)) return 2;
          const isSynced = isVideoThumbnailSynced(vid, assigned, batchItemMap.get(vid.videoId));
          if (!isSynced) return 3;
          return 4;
        };
        const pA = getStatusPriority(a);
        const pB = getStatusPriority(b);
        return pA !== pB ? (pA - pB) * mult : a.position - b.position;
      }
      return 0;
    });
  }, [filteredVideos, sortState, episodes, episodeCounts, chronologyIssueIds, batchItemMap]);

  const handleToggleSort = (column: SortColumn) => {
    setSortState((prev) => {
      if (prev?.column === column) {
        if (prev.direction === "asc") {
          return { column, direction: "desc" };
        }
        return null;
      }
      return { column, direction: "asc" };
    });
  };

  const executeNumbering = (mode: "date" | "order" | "reverse") => {
    if (mode === "date") onAutoNumberByDate?.();
    else if (mode === "order") onAutoNumberByOrder?.();
    else if (mode === "reverse") onReverseEpisodes?.();
  };

  const handleRequestNumbering = (mode: "date" | "order" | "reverse") => {
    if (isBatchRunning) return;
    const impact = getNumberingImpact
      ? getNumberingImpact(mode)
      : { affectedCount: 0, affectedVideoIds: [], reason: "none" as const };

    if (impact.affectedCount > 0) {
      setPendingNumbering({ mode, impact });
    } else {
      executeNumbering(mode);
    }
  };

  const handleConfirmNumbering = () => {
    if (pendingNumbering) {
      executeNumbering(pendingNumbering.mode);
      setPendingNumbering(null);
    }
  };

  const handleCancelNumbering = () => {
    setPendingNumbering(null);
  };

  const allFilteredSelected = useMemo(() => {
    if (!selectedVideoIds || sortedVideos.length === 0) return false;
    return sortedVideos.every((vid) => selectedVideoIds.has(vid.videoId));
  }, [sortedVideos, selectedVideoIds]);

  const handleToggleAllFiltered = () => {
    if (!onSelectionChange) return;
    const next = new Set(selectedVideoIds ? Array.from(selectedVideoIds) : []);
    if (allFilteredSelected) {
      for (const vid of sortedVideos) {
        next.delete(vid.videoId);
      }
    } else {
      for (const vid of sortedVideos) {
        next.add(vid.videoId);
      }
    }
    onSelectionChange(next);
  };

  const handleToggleVideo = (videoId: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedVideoIds ? Array.from(selectedVideoIds) : []);
    if (next.has(videoId)) {
      next.delete(videoId);
    } else {
      next.add(videoId);
    }
    onSelectionChange(next);
  };

  const handleSelectUnsynced = () => {
    if (!onSelectionChange) return;
    const next = new Set<string>();
    for (const vid of videos) {
      const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
      if (!isVideoThumbnailSynced(vid, assigned, batchItemMap.get(vid.videoId))) {
        next.add(vid.videoId);
      }
    }
    onSelectionChange(next);
  };

  const handleSelectNext50Unsynced = () => {
    if (!onSelectionChange) return;
    const next = new Set(selectedVideoIds ? Array.from(selectedVideoIds) : []);
    let added = 0;
    for (const vid of videos) {
      const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
      if (!isVideoThumbnailSynced(vid, assigned, batchItemMap.get(vid.videoId)) && !next.has(vid.videoId)) {
        next.add(vid.videoId);
        added++;
        if (added >= 50) break;
      }
    }
    onSelectionChange(next);
  };

  const handleClearSelection = () => {
    onSelectionChange?.(new Set());
  };

  const hasNumberingTools = Boolean(
    onAutoNumberByDate || onAutoNumberByOrder || onReverseEpisodes
  );

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface">
      {/* Table Toolbar */}
      <div className="p-3 border-b border-border-subtle bg-elevated/40 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filters */}
          <div className="inline-flex rounded-lg border border-border-subtle bg-base p-0.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filter === "all"
                  ? "bg-elevated text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              All <span className="font-mono tabular-nums">({videos.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("mismatch")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filter === "mismatch"
                  ? "bg-elevated text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Mismatch <span className="font-mono tabular-nums">({mismatchCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("needs-thumb")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filter === "needs-thumb"
                  ? "bg-elevated text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Needs thumbnail <span className="font-mono tabular-nums">({unsyncedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("synced")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filter === "synced"
                  ? "bg-elevated text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Synced <span className="font-mono tabular-nums">({syncedCount})</span>
            </button>
          </div>

          {/* Quick Selection Helpers */}
          {onSelectionChange && (
            <div className="flex items-center gap-1.5 pl-1 border-l border-border-subtle">
              <button
                type="button"
                onClick={handleSelectUnsynced}
                disabled={unsyncedCount === 0 || isBatchRunning}
                className="px-2 py-1 rounded-md bg-elevated/60 hover:bg-elevated text-[11px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Select all videos that need a thumbnail"
              >
                Select unsynced
              </button>
              {unsyncedCount > 50 && (
                <button
                  type="button"
                  onClick={handleSelectNext50Unsynced}
                  disabled={isBatchRunning}
                  className="px-2 py-1 rounded-md bg-elevated/60 hover:bg-elevated text-[11px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Select up to 50 unsynced videos to stay within standard daily quota"
                >
                  Select next 50
                </button>
              )}
              {selectedVideoIds && selectedVideoIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  disabled={isBatchRunning}
                  className="px-2 py-1 rounded-md bg-elevated/60 hover:bg-elevated text-[11px] text-text-muted hover:text-text-primary transition-colors"
                >
                  Clear <span className="font-mono tabular-nums">({selectedVideoIds.size})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Episode Actions & Numbering Tools */}
        {(hasNumberingTools || Boolean(onSyncAllFromTitle)) && (
          <div className="flex items-center gap-2">
            {onSyncAllFromTitle && (
              <button
                type="button"
                onClick={onSyncAllFromTitle}
                disabled={mismatchCount === 0 || isBatchRunning}
                className="px-2 py-1 rounded-md bg-accent/10 hover:bg-accent/20 border border-accent/30 text-[11px] font-medium text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Synchronize all edited episodes with parsed title episode numbers"
              >
                Sync all from title <span className="font-mono tabular-nums">({mismatchCount})</span>
              </button>
            )}

            {hasNumberingTools && (
              <div className="flex items-center gap-1.5 border-l border-border-subtle pl-2">
                <span className="text-[11px] text-text-muted mr-1">Numbering:</span>
                {onAutoNumberByDate && (
                  <button
                    type="button"
                    onClick={() => handleRequestNumbering("date")}
                    disabled={isBatchRunning}
                    className="px-2 py-1 rounded-md bg-elevated hover:bg-elevated/80 border border-border-subtle text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Assign episodes 1..N sorted chronologically by upload date"
                  >
                    1..N by date
                  </button>
                )}
                {onAutoNumberByOrder && (
                  <button
                    type="button"
                    onClick={() => handleRequestNumbering("order")}
                    disabled={isBatchRunning}
                    className="px-2 py-1 rounded-md bg-elevated hover:bg-elevated/80 border border-border-subtle text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Assign episodes 1..N matching playlist position"
                  >
                    1..N by order
                  </button>
                )}
                {onReverseEpisodes && (
                  <button
                    type="button"
                    onClick={() => handleRequestNumbering("reverse")}
                    disabled={isBatchRunning}
                    className="px-2 py-1 rounded-md bg-elevated hover:bg-elevated/80 border border-border-subtle text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Invert current episode numbering order"
                  >
                    Reverse
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Guard for Numbering Overwrites */}
      {pendingNumbering && (
        <div
          role="alert"
          className="px-3.5 py-2.5 bg-fire-dim/30 border-b border-border-fire text-xs flex flex-wrap items-center justify-between gap-3 text-red-200"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-red-400">Notice:</span>
            <span>
              Assigning {pendingNumbering.mode === "date" ? "1..N by date" : pendingNumbering.mode === "order" ? "1..N by order" : "reverse order"} will overwrite{" "}
              <strong className="font-semibold text-white">{pendingNumbering.impact.affectedCount}</strong> video{pendingNumbering.impact.affectedCount > 1 ? "s" : ""} whose episode currently matches {pendingNumbering.impact.reason === "title_match" ? "the video title" : pendingNumbering.impact.reason === "db_match" ? "the database" : "title or database records"}.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleConfirmNumbering}
              className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-[11px] transition-colors"
            >
              Overwrite & apply
            </button>
            <button
              type="button"
              onClick={handleCancelNumbering}
              className="px-2.5 py-1 rounded bg-elevated hover:bg-elevated/80 border border-border-subtle text-text-secondary hover:text-text-primary text-[11px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Direction Hint for Reverse-Chronological Playlists */}
      {isReverseChronological && !pendingNumbering && (
        <div
          role="status"
          className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-amber-400">Direction hint:</span>
            <span>
              Playlist runs newest-first (reverse chronological). Numbering by order will invert chronology; consider using <strong>1..N by date</strong>.
            </span>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto max-h-[480px] 2xl:max-h-[640px] overflow-y-auto custom-scrollbar">
        <table className="w-full text-left text-xs min-w-[1080px] table-fixed">
          <thead className="sticky top-0 bg-elevated/95 backdrop-blur-xs text-text-secondary border-b border-border-subtle z-10">
            <tr>
              {onSelectionChange && (
                <th className="py-2.5 px-3 w-10 min-w-10 max-w-10 text-center">
                  <input
                    type="checkbox"
                    aria-label="Select all filtered videos"
                    checked={allFilteredSelected}
                    onChange={handleToggleAllFiltered}
                    disabled={sortedVideos.length === 0 || isBatchRunning}
                    className="rounded border-border-subtle text-accent focus:ring-accent bg-elevated cursor-pointer"
                  />
                </th>
              )}
              <th className="py-2.5 px-3 font-semibold text-[11px] w-20 min-w-20">Preview</th>
              <SortableHeader
                column="video"
                label="Video"
                activeColumn={sortState?.column}
                direction={sortState?.direction}
                className="px-4 min-w-[240px] text-left"
                onSort={handleToggleSort}
              />
              <SortableHeader
                column="source"
                label="Source"
                activeColumn={sortState?.column}
                direction={sortState?.direction}
                className="w-28 min-w-28 text-center"
                onSort={handleToggleSort}
              />
              <SortableHeader
                column="episode"
                label="Episode"
                activeColumn={sortState?.column}
                direction={sortState?.direction}
                className="w-64 min-w-64 text-center"
                onSort={handleToggleSort}
              />
              <SortableHeader
                column="order"
                label="Order"
                activeColumn={sortState?.column}
                direction={sortState?.direction}
                className="w-36 min-w-36 text-center"
                onSort={handleToggleSort}
              />
              <SortableHeader
                column="status"
                label="Status"
                activeColumn={sortState?.column}
                direction={sortState?.direction}
                className="w-36 min-w-36 text-center"
                onSort={handleToggleSort}
              />
              <th className="py-2.5 px-3 font-semibold text-[11px] w-24 min-w-24 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/50">
            {sortedVideos.length === 0 ? (
              <tr>
                <td
                  colSpan={onSelectionChange ? 8 : 7}
                  className="py-10 text-center text-xs text-text-muted"
                >
                  No videos match the selected filter.
                </td>
              </tr>
            ) : (
              sortedVideos.map((vid) => {
                const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
                const isDuplicate = assigned > 0 && (episodeCounts[assigned] || 0) > 1;
                const isInvalid = assigned <= 0;
                const isSelected = selectedVideoIds?.has(vid.videoId) ?? false;
                const isPreviewActive = previewVideoId === vid.videoId;
                const isChronologyIssue = Boolean(
                  chronologyIssueIds ? chronologyIssueIds.has(vid.videoId) : vid.chronologyIssue
                );
                const bItem = batchItemMap.get(vid.videoId);

                return (
                  <PlaylistEpisodeRow
                    key={vid.videoId}
                    video={vid}
                    assignedEpisode={assigned}
                    isDuplicate={isDuplicate}
                    isInvalid={isInvalid}
                    isSelected={isSelected}
                    isPreviewActive={isPreviewActive}
                    isChronologyIssue={isChronologyIssue}
                    isBatchRunning={isBatchRunning}
                    isAssetsReady={isAssetsReady}
                    batchItem={bItem}
                    onToggleSelect={onSelectionChange ? handleToggleVideo : undefined}
                    onSelectPreview={onSelectPreviewVideo}
                    onEpisodeChange={onEpisodeChange}
                    onSyncVideoFromTitle={onSyncVideoFromTitle}
                    onUpdateSingleVideo={onUpdateSingleVideo}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
