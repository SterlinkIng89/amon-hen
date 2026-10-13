import { FC } from "react";
import { backend } from "../../../../wailsjs/go/models";

interface PlaylistCatalogRowProps {
  readonly playlist: backend.CatalogPlaylistSummary;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

export const PlaylistCatalogRow: FC<PlaylistCatalogRowProps> = ({
  playlist,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 cursor-pointer ${
        isSelected
          ? "bg-accent/10 border-accent/40"
          : "bg-elevated/40 border-border-subtle hover:bg-elevated hover:border-border-medium"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-xs font-semibold line-clamp-1 ${
            isSelected ? "text-accent" : "text-text-primary"
          }`}
        >
          {playlist.title}
        </span>
        <span className="shrink-0 text-[10px] font-mono text-text-secondary px-1.5 py-0.5 rounded bg-surface/80 border border-border-subtle">
          {playlist.videoCount} {playlist.videoCount === 1 ? "video" : "videos"}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {playlist.linked ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {playlist.tag}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface text-text-muted border border-border-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            Unlinked
          </span>
        )}
      </div>
    </button>
  );
};
