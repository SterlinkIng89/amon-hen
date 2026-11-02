import { FC, useState, useEffect, useCallback } from "react";
import { backend } from "../../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../../wailsjs/runtime/runtime";
import { getVideoCalendarDate } from "../../../hooks/usePlaylistCatalog";
import { cleanThumbnailUrl } from "../../../utils/thumbnailGenerator";
import { formatVideoDuration, formatPublishedTime } from "../../../utils/videoUtils";

export interface DuplicateEpisodeDialogProps {
  readonly episode: number;
  readonly videos: readonly backend.CatalogVideoDraft[];
  readonly shiftedCount: number;
  readonly onConfirm: (orderedVideoIds: readonly string[]) => void;
  readonly onCancel: () => void;
}

export const DuplicateEpisodeDialog: FC<DuplicateEpisodeDialogProps> = ({
  episode,
  videos,
  shiftedCount,
  onConfirm,
  onCancel,
}) => {
  const [items, setItems] = useState<readonly backend.CatalogVideoDraft[]>(videos);

  useEffect(() => {
    setItems(videos);
  }, [videos]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...items];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setItems(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const next = [...items];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setItems(next);
  };

  const handleOpenYouTube = (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      BrowserOpenURL(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleApply = () => {
    onConfirm(items.map((item) => item.videoId));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-xl bg-surface border border-border-subtle rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h3 id="duplicate-dialog-title" className="text-sm font-semibold text-text-primary">
            Resolve duplicate episode {episode}
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            Order the videos that currently share episode {episode}. Reordering will assign sequential
            numbers starting at {episode} and shift{" "}
            <span className="font-medium text-text-primary">
              {shiftedCount} subsequent episode{shiftedCount === 1 ? "" : "s"}
            </span>{" "}
            forward by +{Math.max(1, items.length - 1)}.
          </p>
        </div>

        {/* Video List */}
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
          {items.map((vid, idx) => {
            const assignedEp = episode + idx;
            const calendarDate = getVideoCalendarDate(vid);
            const formattedDuration = formatVideoDuration(vid.duration);
            const publishedTime = formatPublishedTime(vid.publishedAt);

            return (
              <div
                key={vid.videoId}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border-subtle bg-elevated/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-accent/10 text-accent border border-accent/20 shrink-0">
                    Ep {assignedEp}
                  </span>

                  {/* Thumbnail preview with duration */}
                  <div className="relative w-16 aspect-video rounded overflow-hidden border border-border-subtle bg-black/40 shrink-0">
                    {vid.thumbnailUrl ? (
                      <img
                        src={cleanThumbnailUrl(vid.thumbnailUrl)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[8px] text-text-muted font-mono">
                        No thumb
                      </div>
                    )}
                    {formattedDuration && (
                      <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/80 text-[7px] font-mono text-white pointer-events-none">
                        {formattedDuration}
                      </span>
                    )}
                  </div>

                  {/* Title and metadata */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {vid.videoId && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenYouTube(e, vid.videoId)}
                          aria-label={`Watch ${vid.title} on YouTube`}
                          title="Watch video on YouTube"
                          className="p-1 -ml-1 rounded text-text-muted hover:text-red-400 hover:bg-elevated transition-colors shrink-0 cursor-pointer"
                        >
                          <svg
                            width="13"
                            height="13"
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
                      <p className="text-xs font-medium text-text-primary truncate" title={vid.title}>
                        {vid.title}
                      </p>
                      {vid.localFile && (
                        <span
                          className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0"
                          title={`Matched local file: ${vid.localFile}`}
                        >
                          Local
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-muted font-mono truncate">
                      {calendarDate && <span>{calendarDate}</span>}
                      {publishedTime && <span>{publishedTime}</span>}
                      {formattedDuration && (
                        <span className="px-1.5 py-0.5 rounded bg-elevated/60 text-text-secondary font-mono">
                          {formattedDuration}
                        </span>
                      )}
                      <span>•</span>
                      <span className="truncate text-text-muted/60">{vid.videoId}</span>
                    </div>
                  </div>
                </div>

                {/* Move Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Move ${vid.title} up`}
                    disabled={idx === 0}
                    onClick={() => handleMoveUp(idx)}
                    className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border-subtle disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${vid.title} down`}
                    disabled={idx === items.length - 1}
                    onClick={() => handleMoveDown(idx)}
                    className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border-subtle disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary bg-elevated/60 hover:bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="btn btn-primary btn-sm px-4 py-1.5 font-medium"
          >
            Apply sequence
          </button>
        </div>
      </div>
    </div>
  );
};
