import { FC } from "react";
import { backend } from "../../../../wailsjs/go/models";
import { getGameColor, getTagBadgeStyle } from "../../../utils/tagColors";
import { cleanThumbnailUrl } from "../../../utils/thumbnailGenerator";

export interface PlaylistBatchStatus {
  readonly running: boolean;
  readonly isDone: boolean;
  readonly current: number;
  readonly total: number;
  readonly successCount: number;
  readonly failCount: number;
}

interface PlaylistCatalogRowProps {
  readonly playlist: backend.CatalogPlaylistSummary;
  readonly isSelected: boolean;
  readonly batchStatus?: PlaylistBatchStatus;
  readonly onSelect: () => void;
}

export const PlaylistCatalogRow: FC<PlaylistCatalogRowProps> = ({
  playlist,
  isSelected,
  batchStatus,
  onSelect,
}) => {
  const isSuggested =
    !playlist.linked && playlist.tagConfidence === "known" && Boolean(playlist.tag);

  const tagColor = playlist.tag ? getGameColor(playlist.tag) : undefined;
  const isTagSameAsTitle =
    Boolean(playlist.tag) &&
    playlist.title.trim().toLowerCase() === playlist.tag.trim().toLowerCase();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-3 cursor-pointer group ${
        isSelected
          ? "bg-accent/10 border-accent/40"
          : "bg-elevated/40 border-border-subtle hover:bg-elevated hover:border-border-medium"
      }`}
    >
      <div className="w-14 aspect-video rounded-md overflow-hidden bg-base border border-border-subtle shrink-0 flex items-center justify-center shadow-xs">
        {playlist.thumbnailUrl ? (
          <img
            src={cleanThumbnailUrl(playlist.thumbnailUrl)}
            alt={playlist.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <svg
            className="w-4 h-4 text-text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" />
            <path d="m9 10 5 3-5 3v-6Z" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-xs font-semibold truncate"
            style={tagColor ? { color: tagColor } : undefined}
          >
            {playlist.title}
          </span>
          <span className="shrink-0 text-[10px] font-mono tabular-nums text-text-secondary px-1.5 py-0.5 rounded bg-surface/80 border border-border-subtle">
            {playlist.videoCount} {playlist.videoCount === 1 ? "video" : "videos"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {playlist.kind === "clip" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Clips
            </span>
          )}

          {playlist.linked ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border"
              style={getTagBadgeStyle(playlist.tag)}
            >
              {isTagSameAsTitle ? "Linked" : playlist.tag}
            </span>
          ) : isSuggested ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Suggested: {playlist.tag}
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface text-text-muted border border-border-subtle">
              Unlinked
            </span>
          )}

          {batchStatus?.running && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-medium bg-accent/15 text-accent border border-accent/30">
              Updating {batchStatus.current}/{batchStatus.total}
            </span>
          )}

          {batchStatus && !batchStatus.running && batchStatus.isDone && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-medium border ${
                batchStatus.failCount > 0
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}
            >
              {batchStatus.failCount > 0
                ? `${batchStatus.successCount} done, ${batchStatus.failCount} failed`
                : `Updated (${batchStatus.successCount})`}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};
