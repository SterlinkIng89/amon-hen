import { FC, useMemo, useState } from "react";
import { backend } from "../../../../wailsjs/go/models";
import { BatchItem } from "../../../types";
import { cleanThumbnailUrl } from "../../../utils/thumbnailGenerator";

export type VideoFilter = "all" | "mismatch" | "needs-thumb" | "synced";

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
}

const SOURCE_BADGES: Record<string, { readonly label: string; readonly className: string }> = {
  db: { label: "DB", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  title: { label: "Title", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  order: { label: "Order", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

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

interface StatusBadgeProps {
  readonly isDuplicate: boolean;
  readonly isInvalid: boolean;
  readonly isSynced: boolean;
  readonly isProcessing?: boolean;
  readonly isStale?: boolean;
  readonly staleEpisode?: number;
  readonly batchItem?: BatchItem;
}

const EpisodeStatusBadge: FC<StatusBadgeProps> = ({
  isDuplicate,
  isInvalid,
  isSynced,
  isProcessing,
  isStale,
  staleEpisode,
  batchItem,
}) => {
  if (isDuplicate) {
    return (
      <span className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-fire-dim text-red-400 border border-border-fire whitespace-nowrap">
        Duplicate
      </span>
    );
  }

  if (isInvalid) {
    return (
      <span className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-fire-dim text-red-400 border border-border-fire whitespace-nowrap">
        Invalid
      </span>
    );
  }

  if (batchItem?.status === "rendering") {
    return (
      <span className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 animate-pulse whitespace-nowrap">
        Rendering...
      </span>
    );
  }

  if (batchItem?.status === "uploading") {
    return (
      <span className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 animate-pulse whitespace-nowrap">
        Uploading...
      </span>
    );
  }

  if (batchItem?.status === "failed") {
    return (
      <span
        className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-fire-dim text-red-400 border border-border-fire whitespace-nowrap"
        title={batchItem.error || "Thumbnail upload failed"}
      >
        Failed
      </span>
    );
  }

  if (isSynced) {
    if (isProcessing) {
      return (
        <span
          className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse whitespace-nowrap"
          title="YouTube is still processing the custom thumbnail"
        >
          Processing
        </span>
      );
    }

    return (
      <span className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
        Synced
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap"
      title={
        isStale
          ? staleEpisode
            ? `Thumbnail has old episode number (${staleEpisode})`
            : "Thumbnail has old episode number"
          : undefined
      }
    >
      Needs thumb
    </span>
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
}) => {
  const [filter, setFilter] = useState<VideoFilter>("all");
  const [brokenThumbUrls, setBrokenThumbUrls] = useState<Readonly<Record<string, string>>>({});
  const [processingThumbUrls, setProcessingThumbUrls] = useState<Readonly<Record<string, string>>>({});

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

  const allFilteredSelected = useMemo(() => {
    if (!selectedVideoIds || filteredVideos.length === 0) return false;
    return filteredVideos.every((vid) => selectedVideoIds.has(vid.videoId));
  }, [filteredVideos, selectedVideoIds]);

  const handleToggleAllFiltered = () => {
    if (!onSelectionChange) return;
    const next = new Set(selectedVideoIds ? Array.from(selectedVideoIds) : []);
    if (allFilteredSelected) {
      for (const vid of filteredVideos) {
        next.delete(vid.videoId);
      }
    } else {
      for (const vid of filteredVideos) {
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
                    onClick={onAutoNumberByDate}
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
                    onClick={onAutoNumberByOrder}
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
                    onClick={onReverseEpisodes}
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
                    disabled={filteredVideos.length === 0 || isBatchRunning}
                    className="rounded border-border-subtle text-accent focus:ring-accent bg-elevated cursor-pointer"
                  />
                </th>
              )}
              <th className="py-2.5 px-3 font-semibold text-[11px] w-20 min-w-20">Preview</th>
              <th className="py-2.5 px-4 font-semibold text-[11px] min-w-[240px]">Video</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-28 min-w-28 text-center">Source</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-64 min-w-64 text-center">Episode</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-36 min-w-36 text-center">Order</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-36 min-w-36 text-center">Status</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-24 min-w-24 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/50">
            {filteredVideos.length === 0 ? (
              <tr>
                <td
                  colSpan={onSelectionChange ? 8 : 7}
                  className="py-10 text-center text-xs text-text-muted"
                >
                  No videos match the selected filter.
                </td>
              </tr>
            ) : (
              filteredVideos.map((vid) => {
                const assigned = episodes[vid.videoId] ?? (vid.episode > 0 ? vid.episode : 0);
                const isDuplicate = assigned > 0 && (episodeCounts[assigned] || 0) > 1;
                const isInvalid = assigned <= 0;
                const isSelected = selectedVideoIds?.has(vid.videoId) ?? false;
                const isPreviewActive = previewVideoId === vid.videoId;
                const isChronologyIssue = Boolean(
                  chronologyIssueIds ? chronologyIssueIds.has(vid.videoId) : vid.chronologyIssue
                );

                const titleEp = vid.titleEpisode ?? 0;
                const isMismatch = titleEp > 0 && assigned !== titleEp;

                const bItem = batchItemMap.get(vid.videoId);
                const isSynced = isVideoThumbnailSynced(vid, assigned, bItem);
                const thumbEp = bItem?.thumbnailEpisode ?? vid.thumbnailEpisode ?? 0;
                const isStale =
                  thumbEp > 0 &&
                  assigned > 0 &&
                  thumbEp !== assigned &&
                  ((bItem?.thumbnailUpdatedAt ?? vid.thumbnailUpdatedAt ?? 0) > 0 || bItem?.status === "done");
                const isBroken = Boolean(vid.thumbnailUrl && brokenThumbUrls[vid.videoId] === vid.thumbnailUrl);
                const isProcessing = Boolean(vid.thumbnailUrl && processingThumbUrls[vid.videoId] === vid.thumbnailUrl);
                const sourceBadge = vid.source ? SOURCE_BADGES[vid.source] : undefined;

                return (
                  <tr
                    key={vid.videoId}
                    className={`hover:bg-elevated/30 transition-colors h-14 ${
                      isDuplicate || isInvalid
                        ? "bg-fire-dim/20"
                        : isChronologyIssue
                        ? "bg-amber-500/5"
                        : isPreviewActive
                        ? "bg-accent/5"
                        : isSelected
                        ? "bg-elevated/20"
                        : ""
                    }`}
                  >
                    {/* Selection Checkbox */}
                    {onSelectionChange && (
                      <td className="py-2.5 px-3 w-10 min-w-10 max-w-10 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select ${vid.title}`}
                          checked={isSelected}
                          onChange={() => handleToggleVideo(vid.videoId)}
                          disabled={isBatchRunning}
                          className="rounded border-border-subtle text-accent focus:ring-accent bg-elevated cursor-pointer"
                        />
                      </td>
                    )}

                    {/* Thumbnail Preview */}
                    <td className="py-2.5 px-3 w-20 min-w-20">
                      <button
                        type="button"
                        onClick={() => onSelectPreviewVideo?.(vid.videoId)}
                        aria-label={`Preview ${vid.title} in thumbnail studio`}
                        className={`relative w-16 aspect-video rounded overflow-hidden border bg-black/40 shrink-0 block transition-all group ${
                          isPreviewActive
                            ? "border-accent ring-1 ring-accent"
                            : "border-border-subtle hover:border-border-active"
                        }`}
                        title="Click to preview episode in thumbnail studio"
                      >
                        {vid.thumbnailUrl && !isBroken ? (
                          <img
                            src={cleanThumbnailUrl(vid.thumbnailUrl)}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onLoad={(e) => {
                              const img = e.currentTarget;
                              if (img.naturalWidth > 0 && img.naturalWidth <= 120) {
                                setProcessingThumbUrls((prev) =>
                                  prev[vid.videoId] === vid.thumbnailUrl
                                    ? prev
                                    : { ...prev, [vid.videoId]: vid.thumbnailUrl }
                                );
                              } else if (img.naturalWidth > 120) {
                                setProcessingThumbUrls((prev) => {
                                  if (!prev[vid.videoId]) return prev;
                                  const next = { ...prev };
                                  delete next[vid.videoId];
                                  return next;
                                });
                              }
                            }}
                            onError={() => {
                              setBrokenThumbUrls((prev) =>
                                prev[vid.videoId] === vid.thumbnailUrl
                                  ? prev
                                  : { ...prev, [vid.videoId]: vid.thumbnailUrl }
                              );
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-text-muted font-mono">
                            No thumb
                          </div>
                        )}
                        <span className="absolute inset-0 bg-accent/0 group-hover:bg-accent/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span className="text-[8px] font-semibold text-text-primary px-1 rounded bg-black/75">
                            View
                          </span>
                        </span>
                      </button>
                    </td>

                    {/* Video Title & Local File Indicator */}
                    <td className="py-2.5 px-4 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="font-medium text-text-primary truncate" title={vid.title}>
                          {vid.title}
                        </div>
                        {vid.localFile && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0"
                            title={`Matched local file: ${vid.localFile}`}
                          >
                            Local
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted font-mono mt-0.5 truncate">{vid.videoId}</div>
                    </td>

                    {/* Inferred Source Badge */}
                    <td className="py-2.5 px-3 w-28 min-w-28 text-center">
                      <div className="flex items-center justify-center">
                        {sourceBadge ? (
                          <span
                            className={`inline-flex items-center justify-center min-w-[56px] px-2 py-0.5 rounded text-[10px] font-mono border ${sourceBadge.className}`}
                          >
                            {sourceBadge.label}
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted font-mono">
                            {vid.episode > 0 ? `Ep ${vid.episode}` : "—"}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Episode Number Input & Title Suggestion */}
                    <td className="py-2.5 px-3 w-64 min-w-64 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <input
                          type="number"
                          min="1"
                          value={assigned}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            onEpisodeChange(vid.videoId, isNaN(val) ? 0 : val);
                          }}
                          className={`w-14 h-7 text-center rounded-lg bg-elevated border text-text-primary text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors ${
                            isDuplicate || isInvalid
                              ? "border-fire text-red-400 bg-fire-dim/30"
                              : "border-border-subtle"
                          }`}
                        />
                        <div className="w-36 h-7 flex items-center justify-start gap-1.5 shrink-0">
                          {isMismatch ? (
                            <>
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap"
                                title={`Parsed episode from title is ${titleEp}`}
                              >
                                Title: {titleEp}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSyncVideoFromTitle) {
                                    onSyncVideoFromTitle(vid.videoId);
                                  } else {
                                    onEpisodeChange(vid.videoId, titleEp);
                                  }
                                }}
                                disabled={isBatchRunning}
                                className="px-2 py-0.5 rounded bg-accent/10 hover:bg-accent/20 border border-accent/20 text-[10px] font-medium text-accent transition-colors disabled:opacity-40 whitespace-nowrap hover:border-accent/40 cursor-pointer"
                                title={`Set episode to ${titleEp} from video title`}
                              >
                                Use {titleEp}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {/* Chronology Order Badge */}
                    <td className="py-2.5 px-3 w-36 min-w-36 text-center">
                      <div className="flex items-center justify-center">
                        {isChronologyIssue ? (
                          <span
                            className="inline-flex items-center justify-center px-3 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap min-w-[84px]"
                            title="Video violates chronological release order relative to its assigned episode"
                          >
                            Out of order
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted/40 font-mono">—</span>
                        )}
                      </div>
                    </td>

                    {/* Thumbnail Status Badge */}
                    <td className="py-2.5 px-3 w-36 min-w-36 text-center">
                      <div className="flex items-center justify-center">
                        <EpisodeStatusBadge
                          isDuplicate={isDuplicate}
                          isInvalid={isInvalid}
                          isSynced={isSynced}
                          isProcessing={isProcessing}
                          isStale={isStale}
                          staleEpisode={thumbEp}
                          batchItem={bItem}
                        />
                      </div>
                    </td>

                    {/* Single Video Update Action */}
                    <td className="py-2.5 px-3 w-24 min-w-24 text-right">
                      <div className="flex items-center justify-end">
                        {onUpdateSingleVideo && (
                          <button
                            type="button"
                            onClick={() => onUpdateSingleVideo(vid.videoId)}
                            disabled={isBatchRunning || isAssetsReady === false}
                            aria-label={`Update thumbnail for ${vid.title}`}
                            className="px-2.5 py-1 rounded bg-elevated hover:bg-elevated/80 border border-border-subtle text-[10px] font-medium text-text-secondary hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                            title="Generate and upload custom thumbnail for this video (50 units)"
                          >
                            Update
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
