import { FC, useState } from "react";
import { backend } from "../../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../../wailsjs/runtime/runtime";
import { BatchItem } from "../../../types";
import { cleanThumbnailUrl } from "../../../utils/thumbnailGenerator";
import { isVideoThumbnailSynced } from "./PlaylistEpisodeTable";

const SOURCE_BADGES: Record<string, { readonly label: string; readonly className: string }> = {
  db: { label: "DB", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  title: { label: "Title", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  order: { label: "Order", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

interface StatusBadgeProps {
  readonly isDuplicate: boolean;
  readonly isInvalid: boolean;
  readonly isSynced: boolean;
  readonly isProcessing?: boolean;
  readonly isStale?: boolean;
  readonly staleEpisode?: number;
  readonly batchItem?: BatchItem;
  readonly onResolveDuplicate?: () => void;
}

const EpisodeStatusBadge: FC<StatusBadgeProps> = ({
  isDuplicate,
  isInvalid,
  isSynced,
  isProcessing,
  isStale,
  staleEpisode,
  batchItem,
  onResolveDuplicate,
}) => {
  if (isDuplicate) {
    if (onResolveDuplicate) {
      return (
        <button
          type="button"
          onClick={onResolveDuplicate}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-medium bg-fire-dim hover:bg-fire-dim/80 text-red-400 hover:text-red-300 border border-border-fire hover:border-red-400/40 transition-colors cursor-pointer group whitespace-nowrap min-w-[84px]"
          title="Duplicate episode number. Click to resolve sequence."
        >
          <span>Duplicate</span>
          <span className="text-[9px] text-red-300/80 group-hover:text-red-200 underline font-normal">
            Resolve
          </span>
        </button>
      );
    }

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

  if (isProcessing) {
    return (
      <span
        className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap"
        title="Thumbnail is being processed by YouTube CDN"
      >
        Processing
      </span>
    );
  }

  if (isSynced && !isStale) {
    return (
      <span className="inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
        Synced
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[84px] px-3 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
        isStale
          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          : "bg-surface-elevated text-text-muted border border-border-subtle"
      }`}
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

export interface PlaylistEpisodeRowProps {
  readonly video: backend.CatalogVideoDraft;
  readonly assignedEpisode: number;
  readonly isDuplicate: boolean;
  readonly isInvalid: boolean;
  readonly isSelected: boolean;
  readonly isPreviewActive: boolean;
  readonly isChronologyIssue: boolean;
  readonly isBatchRunning?: boolean;
  readonly isAssetsReady?: boolean;
  readonly batchItem?: BatchItem;
  readonly onToggleSelect?: (videoId: string) => void;
  readonly onSelectPreview?: (videoId: string) => void;
  readonly onEpisodeChange: (videoId: string, episode: number) => void;
  readonly onSyncVideoFromTitle?: (videoId: string) => void;
  readonly onUpdateSingleVideo?: (videoId: string) => void;
  readonly onResolveDuplicate?: (episode: number) => void;
}

export const PlaylistEpisodeRow: FC<PlaylistEpisodeRowProps> = ({
  video,
  assignedEpisode,
  isDuplicate,
  isInvalid,
  isSelected,
  isPreviewActive,
  isChronologyIssue,
  isBatchRunning,
  isAssetsReady,
  batchItem,
  onToggleSelect,
  onSelectPreview,
  onEpisodeChange,
  onSyncVideoFromTitle,
  onUpdateSingleVideo,
  onResolveDuplicate,
}) => {
  const [isBrokenThumb, setIsBrokenThumb] = useState(false);
  const [isProcessingThumb, setIsProcessingThumb] = useState(false);

  const titleEp = video.titleEpisode ?? 0;
  const isMismatch = titleEp > 0 && assignedEpisode !== titleEp;
  const isSynced = isVideoThumbnailSynced(video, assignedEpisode, batchItem);
  const thumbEp = batchItem?.thumbnailEpisode ?? video.thumbnailEpisode ?? 0;
  const isStale =
    thumbEp > 0 &&
    assignedEpisode > 0 &&
    thumbEp !== assignedEpisode &&
    ((batchItem?.thumbnailUpdatedAt ?? video.thumbnailUpdatedAt ?? 0) > 0 || batchItem?.status === "done");
  const sourceBadge = video.source ? SOURCE_BADGES[video.source] : undefined;

  const handleOpenYouTube = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.youtube.com/watch?v=${video.videoId}`;
    try {
      BrowserOpenURL(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <tr
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
      {onToggleSelect && (
        <td className="py-2.5 px-3 w-10 min-w-10 max-w-10 text-center">
          <input
            type="checkbox"
            aria-label={`Select ${video.title}`}
            checked={isSelected}
            onChange={() => onToggleSelect(video.videoId)}
            disabled={isBatchRunning}
            className="rounded border-border-subtle text-accent focus:ring-accent bg-elevated cursor-pointer"
          />
        </td>
      )}

      {/* Thumbnail Preview */}
      <td className="py-2.5 px-3 w-20 min-w-20">
        <button
          type="button"
          onClick={() => onSelectPreview?.(video.videoId)}
          aria-label={`Preview ${video.title} in thumbnail studio`}
          className={`relative w-16 aspect-video rounded overflow-hidden border bg-black/40 shrink-0 block transition-all group ${
            isPreviewActive
              ? "border-accent ring-1 ring-accent"
              : "border-border-subtle hover:border-border-active"
          }`}
          title="Click to preview episode in thumbnail studio"
        >
          {video.thumbnailUrl && !isBrokenThumb ? (
            <img
              src={cleanThumbnailUrl(video.thumbnailUrl)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalWidth <= 120) {
                  setIsProcessingThumb(true);
                } else if (img.naturalWidth > 120) {
                  setIsProcessingThumb(false);
                }
              }}
              onError={() => {
                setIsBrokenThumb(true);
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
          {video.videoId && (
            <button
              type="button"
              onClick={handleOpenYouTube}
              aria-label={`Watch ${video.title} on YouTube`}
              title="Watch video on YouTube"
              className="p-1 -ml-1 rounded text-text-muted hover:text-red-400 hover:bg-elevated transition-colors shrink-0 cursor-pointer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}
          <div className="font-medium text-text-primary truncate" title={video.title}>
            {video.title}
          </div>
          {video.localFile && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0"
              title={`Matched local file: ${video.localFile}`}
            >
              Local
            </span>
          )}
        </div>
        <div className="text-[10px] text-text-muted font-mono mt-0.5 truncate">{video.videoId}</div>
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
              {video.episode > 0 ? `Ep ${video.episode}` : "—"}
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
            value={assignedEpisode}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onEpisodeChange(video.videoId, isNaN(val) ? 0 : val);
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
                      onSyncVideoFromTitle(video.videoId);
                    } else {
                      onEpisodeChange(video.videoId, titleEp);
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
            isProcessing={isProcessingThumb}
            isStale={isStale}
            staleEpisode={thumbEp}
            batchItem={batchItem}
            onResolveDuplicate={
              isDuplicate && onResolveDuplicate
                ? () => onResolveDuplicate(assignedEpisode)
                : undefined
            }
          />
        </div>
      </td>

      {/* Single Video Thumbnail Upload Action */}
      <td className="py-2.5 px-3 w-28 min-w-28 text-right">
        <div className="flex items-center justify-end">
          {onUpdateSingleVideo && (
            <button
              type="button"
              onClick={() => onUpdateSingleVideo(video.videoId)}
              disabled={isBatchRunning || isAssetsReady === false || isDuplicate || isInvalid}
              aria-label={`Upload thumbnail for ${video.title}`}
              className="px-2.5 py-1 rounded bg-elevated hover:bg-elevated/80 border border-border-subtle text-[10px] font-medium text-text-secondary hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              title={
                isDuplicate || isInvalid
                  ? "Resolve episode conflicts before uploading thumbnail"
                  : "Generate and upload custom thumbnail to YouTube for this video (50 units)"
              }
            >
              Upload thumb
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
