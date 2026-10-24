import React, { useState, useMemo } from "react";
import { VideoFile } from "../../types";
import { DeleteFiles } from "../../../wailsjs/go/backend/App";
import { formatSize } from "../../utils/videoUtils";

export interface UploadedCleanupModalProps {
  readonly open: boolean;
  readonly uploadedVideos: VideoFile[];
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

export default function UploadedCleanupModal({
  open,
  uploadedVideos,
  onClose,
  onDeleted,
}: UploadedCleanupModalProps): React.JSX.Element | null {
  const eligibleVideos = useMemo(
    () => uploadedVideos.filter((v) => Boolean(v.youtubeId)),
    [uploadedVideos],
  );

  const [selectedPaths, setSelectedPaths] = useState<string[]>(() =>
    eligibleVideos.map((v) => v.path),
  );
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open || eligibleVideos.length === 0) {
    return null;
  }

  const allSelected =
    eligibleVideos.length > 0 &&
    eligibleVideos.every((v) => selectedPaths.includes(v.path));

  const totalRecoverableBytes = eligibleVideos
    .filter((v) => selectedPaths.includes(v.path))
    .reduce((acc, v) => acc + v.size, 0);

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(eligibleVideos.map((v) => v.path));
    }
  };

  const handleToggleVideo = (path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const handleDelete = async () => {
    if (selectedPaths.length === 0 || deleting) return;
    setDeleting(true);
    setErrorMessage(null);

    try {
      await DeleteFiles(selectedPaths);
      onDeleted();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg.replace(/^Error:\s*/, ""));
    } finally {
      setDeleting(false);
    }
  };

  const selectedCount = selectedPaths.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-elevated border border-border-medium rounded-xl shadow-sm w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="bg-surface/80 border-b border-border-subtle px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0 mt-0.5">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-text-primary">
              Clean Up Uploaded Recordings
            </h3>
            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
              These local recordings are already uploaded to YouTube. You can safely
              delete local files to reclaim disk space.
            </p>
          </div>
        </div>

        {/* List Controls & Summary */}
        <div className="bg-surface/40 px-5 py-2.5 border-b border-border-subtle flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none text-text-secondary hover:text-text-primary transition-colors">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allSelected}
              onChange={handleToggleAll}
              disabled={deleting}
              className="rounded border-border-medium text-accent focus:ring-0"
            />
            <span className="font-medium">
              Select all ({eligibleVideos.length} uploaded videos)
            </span>
          </label>
          <span className="text-text-muted">
            Selected:{" "}
            <strong className="text-text-primary font-semibold">
              {formatSize(totalRecoverableBytes)}
            </strong>
          </span>
        </div>

        {/* Video List */}
        <div className="p-4 flex flex-col gap-2 overflow-y-auto custom-scrollbar flex-1">
          {eligibleVideos.map((video) => {
            const isChecked = selectedPaths.includes(video.path);
            const displayName = video.youtubeTitle || video.name;

            return (
              <label
                key={video.path}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer select-none ${
                  isChecked
                    ? "bg-surface/80 border-border-subtle hover:bg-surface"
                    : "bg-surface/20 border-transparent hover:bg-surface/40 opacity-70"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${displayName}`}
                  checked={isChecked}
                  onChange={() => handleToggleVideo(video.path)}
                  disabled={deleting}
                  className="rounded border-border-medium text-accent focus:ring-0 shrink-0"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary truncate">
                      {displayName}
                    </span>
                    {video.youtubeId && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
                        </svg>
                        {video.youtubeId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted">
                    <span className="truncate">{video.name}</span>
                    <span>•</span>
                    <span className="shrink-0">{formatSize(video.size)}</span>
                    {video.modTime > 0 && (
                      <>
                        <span>•</span>
                        <span className="shrink-0">
                          {new Date(video.modTime * 1000).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {errorMessage && (
          <div className="mx-5 mb-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {errorMessage}
          </div>
        )}

        {/* Modal Footer */}
        <div className="bg-surface/50 border-t border-border-subtle px-5 py-3 flex items-center justify-end gap-2.5">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={deleting}
          >
            Keep Files / Later
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm flex items-center gap-1.5 disabled:opacity-50"
            disabled={selectedCount === 0 || deleting}
            onClick={handleDelete}
          >
            {deleting ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>
                Delete {selectedCount} Video{selectedCount === 1 ? "" : "s"} (Free{" "}
                {formatSize(totalRecoverableBytes)})
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
