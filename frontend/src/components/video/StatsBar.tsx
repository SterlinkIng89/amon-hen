import { VideoFile } from "../../types";
import { formatSize } from "../../utils/videoUtils";

interface StatsBarProps {
  videos: VideoFile[];
  filterUploaded?: boolean;
  onToggleFilterUploaded?: () => void;
  onOpenCleanup?: () => void;
}

export default function StatsBar({
  videos,
  filterUploaded,
  onToggleFilterUploaded,
  onOpenCleanup,
}: StatsBarProps) {
  if (videos.length === 0) return null;

  const totalSize = videos.reduce((acc, v) => acc + v.size, 0);
  const uploadedVideos = videos.filter((v) => Boolean(v.youtubeId));
  const uploadedCount = uploadedVideos.length;
  const uploadedSize = uploadedVideos.reduce((acc, v) => acc + v.size, 0);
  const pendingCount = videos.length - uploadedCount;
  const uploadPct =
    videos.length > 0 ? Math.round((uploadedCount / videos.length) * 100) : 0;

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-surface border-b border-border-subtle shrink-0 text-xs text-text-secondary overflow-x-auto">
      {/* Total videos */}
      <div className="flex items-center gap-1.5 shrink-0">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-text-muted"
        >
          <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
        </svg>
        <span className="font-semibold text-text-primary">{videos.length}</span>
        <span>videos</span>
      </div>

      <div className="w-px h-3 bg-border-subtle shrink-0" />

      {/* Total size */}
      <div className="flex items-center gap-1.5 shrink-0">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-text-muted"
        >
          <path d="M20 6h-2.18c.07-.44.18-.88.18-1.35C18 2.53 15.47 0 12.33 0c-1.7 0-3.21.72-4.27 1.85C7.27.72 5.76 0 4.07 0 2.93 0 2 .93 2 2.07c0 .86.52 1.6 1.27 1.93A6.955 6.955 0 0 0 2 8c0 1.5.49 3 1.39 4.23l5.95 5.95c.78.78 2.05.78 2.83 0l5.95-5.95A7.063 7.063 0 0 0 20 8V6z" />
        </svg>
        <span className="font-semibold text-text-primary">
          {formatSize(totalSize)}
        </span>
        <span>on disk</span>
      </div>

      <div className="w-px h-3 bg-border-subtle shrink-0" />

      {/* Uploaded progress */}
      <button
        type="button"
        disabled={!onToggleFilterUploaded}
        onClick={onToggleFilterUploaded}
        className={`flex items-center gap-2 shrink-0 bg-transparent border-0 p-0 text-inherit text-xs text-left ${
          onToggleFilterUploaded
            ? "cursor-pointer hover:opacity-80 transition-opacity"
            : ""
        }`}
        title={
          onToggleFilterUploaded
            ? filterUploaded
              ? "Show all videos"
              : "Filter to pending uploads only"
            : undefined
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-text-muted"
        >
          <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
        </svg>
        <span>
          <span className="font-semibold text-text-primary">
            {uploadedCount}
          </span>
          <span className="text-text-muted"> / {videos.length} uploaded</span>
        </span>
        {/* Mini progress bar */}
        <div className="w-16 h-[5px] bg-elevated rounded-full overflow-hidden border border-border-subtle">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${uploadPct}%`,
              background:
                uploadPct === 100 ? "#4ade80" : "var(--accent, #f97316)",
            }}
          />
        </div>
        <span className="text-text-muted">{uploadPct}%</span>
      </button>

      {onOpenCleanup && uploadedCount > 0 && (
        <>
          <div className="w-px h-3 bg-border-subtle shrink-0" />
          <button
            type="button"
            onClick={onOpenCleanup}
            className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 text-xs font-medium cursor-pointer transition-colors"
            title="Clean up already-uploaded local recordings to reclaim disk space"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Clean up (Free {formatSize(uploadedSize)})</span>
          </button>
        </>
      )}

      {pendingCount > 0 && (
        <>
          <div className="w-px h-3 bg-border-subtle shrink-0" />
          <button
            type="button"
            disabled={!onToggleFilterUploaded}
            onClick={onToggleFilterUploaded}
            className={`flex items-center gap-1.5 shrink-0 text-amber-400/80 bg-transparent border-0 p-0 text-xs text-left ${
              onToggleFilterUploaded
                ? "cursor-pointer hover:opacity-80 transition-opacity"
                : ""
            }`}
            title={
              onToggleFilterUploaded
                ? filterUploaded
                  ? "Show all videos"
                  : "Filter to pending uploads only"
                : undefined
            }
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span className="font-semibold">{pendingCount}</span>
            <span>pending upload</span>
          </button>
        </>
      )}
    </div>
  );
}
