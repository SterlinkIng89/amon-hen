import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  ApplyMatchedExportsResult,
  ExportSyncProgressEvent,
  MatchedExportItem,
} from "../../types";
import {
  ApplyMatchedExports,
  DismissExportRecord,
  GetMatchedExports,
} from "../../../wailsjs/go/backend/App";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { useQuotaStatus } from "../../hooks/useQuotaStatus";

const QUOTA_VIDEO_METADATA_UPDATE = 50;
const QUOTA_PLAYLIST_ITEM_INSERT = 50;

export interface ExportSyncModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly items: readonly MatchedExportItem[] };

type ApplyState =
  | { readonly status: "idle" }
  | {
      readonly status: "applying";
      readonly progress: ExportSyncProgressEvent | null;
    }
  | { readonly status: "done"; readonly result: ApplyMatchedExportsResult }
  | { readonly status: "error"; readonly message: string };

function isProgressEvent(payload: unknown): payload is ExportSyncProgressEvent {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.current === "number" &&
    typeof candidate.total === "number" &&
    typeof candidate.percentage === "number"
  );
}

function isApplyResult(payload: unknown): payload is ApplyMatchedExportsResult {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    Array.isArray(candidate.applied) &&
    typeof candidate.stoppedOnQuota === "boolean"
  );
}

export function calculateEstimatedQuota(
  items: readonly MatchedExportItem[],
  selectedIds: ReadonlySet<string>,
  includePlaylists: boolean,
): number {
  let total = 0;
  for (const item of items) {
    if (!selectedIds.has(item.exportId)) continue;
    total += QUOTA_VIDEO_METADATA_UPDATE;
    if (includePlaylists && item.playlistId && !item.alreadyInPlaylist) {
      total += QUOTA_PLAYLIST_ITEM_INSERT;
    }
  }
  return total;
}

function formatPlaylistSuffix(
  alreadyInPlaylist: boolean,
  includePlaylists: boolean,
): string {
  if (alreadyInPlaylist) return " (already in playlist)";
  return includePlaylists ? " (+50 quota)" : " (skipped)";
}

function getResultBannerClass(result: ApplyMatchedExportsResult): string {
  const hasFailures =
    result.stoppedOnQuota || Object.keys(result.failed).length > 0;
  return hasFailures
    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
}

export default function ExportSyncModal({
  open,
  onClose,
  onChanged,
}: ExportSyncModalProps) {
  if (!open) return null;
  return <ExportSyncModalContent onClose={onClose} onChanged={onChanged} />;
}

interface ExportSyncModalContentProps {
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

function ExportSyncModalContent({
  onClose,
  onChanged,
}: ExportSyncModalContentProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includePlaylists, setIncludePlaylists] = useState(true);
  const [deleteExportedFiles, setDeleteExportedFiles] = useState(false);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [applyState, setApplyState] = useState<ApplyState>({ status: "idle" });

  const { status: quotaStatus, refresh: refreshQuota } = useQuotaStatus();

  const includePlaylistsId = useId();
  const deleteFilesId = useId();
  const selectAllId = useId();

  const loadMatchedExports = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      const items = await GetMatchedExports();
      const safeItems = Array.isArray(items) ? items : [];
      setLoadState({ status: "ready", items: safeItems });
      setSelectedIds(new Set(safeItems.map((item) => item.exportId)));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadState({
        status: "error",
        message: message || "Failed to load matched exports",
      });
    }
  }, []);

  useEffect(() => {
    void loadMatchedExports();
    refreshQuota();
  }, [loadMatchedExports, refreshQuota]);

  useEffect(() => {
    const unsubProgress = EventsOn("export-sync:progress", (payload: unknown) => {
      if (!isProgressEvent(payload)) return;
      setApplyState((prev) =>
        prev.status === "applying"
          ? { status: "applying", progress: payload }
          : prev,
      );
    });

    const unsubDone = EventsOn("export-sync:done", (payload: unknown) => {
      if (!isApplyResult(payload)) return;
      setApplyState({ status: "done", result: payload });
    });

    return () => {
      unsubProgress();
      unsubDone();
    };
  }, []);

  const items = loadState.status === "ready" ? loadState.items : [];

  const estimatedQuota = useMemo(
    () => calculateEstimatedQuota(items, selectedIds, includePlaylists),
    [items, selectedIds, includePlaylists],
  );

  const isApplying = applyState.status === "applying";
  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.exportId));
  const exceedsQuota =
    quotaStatus !== null && estimatedQuota > quotaStatus.remaining;

  const handleToggleAll = () => {
    if (isApplying) return;
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.exportId)));
  };

  const handleToggleItem = (exportId: string) => {
    if (isApplying) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(exportId)) {
        next.delete(exportId);
      } else {
        next.add(exportId);
      }
      return next;
    });
  };

  const handleDismiss = async (exportId: string) => {
    if (isApplying || dismissingIds.has(exportId)) return;
    setDismissingIds((prev) => new Set(prev).add(exportId));
    try {
      await DismissExportRecord(exportId);
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return {
          status: "ready",
          items: prev.items.filter((item) => item.exportId !== exportId),
        };
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(exportId);
        return next;
      });
      onChanged();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setApplyState({
        status: "error",
        message: message || "Failed to dismiss export record",
      });
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(exportId);
        return next;
      });
    }
  };

  const handleApply = async () => {
    if (selectedIds.size === 0 || isApplying) return;
    setApplyState({ status: "applying", progress: null });

    try {
      const result = await ApplyMatchedExports(
        Array.from(selectedIds),
        includePlaylists,
        deleteExportedFiles,
      );
      setApplyState({ status: "done", result });
      refreshQuota();
      onChanged();
      await loadMatchedExports();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setApplyState({
        status: "error",
        message: message || "Failed to apply matched exports",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-sync-modal-title"
    >
      <div className="bg-elevated border border-border-medium rounded-2xl shadow-lg max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/50 shrink-0">
          <div>
            <h2
              id="export-sync-modal-title"
              className="text-base font-semibold text-text-primary leading-tight tracking-tight"
            >
              Review Matched Exports
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Apply real titles, descriptions, privacy, and playlists to uploaded clips
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {/* Progress Banner */}
          {applyState.status === "applying" && (
            <div
              className="rounded-xl border border-accent/30 bg-accent/10 p-4 space-y-2"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between text-xs font-medium text-text-primary">
                <span className="truncate pr-3">
                  {applyState.progress?.title
                    ? `Applying: ${applyState.progress.title}`
                    : "Applying metadata to YouTube..."}
                </span>
                <span className="tabular-nums shrink-0 text-text-muted">
                  {applyState.progress
                    ? `${applyState.progress.current}/${applyState.progress.total} (${applyState.progress.percentage}%)`
                    : "Starting..."}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface overflow-hidden border border-border-subtle">
                <div
                  className="h-full bg-accent transition-all duration-200"
                  style={{
                    width: `${Math.min(100, Math.max(0, applyState.progress?.percentage ?? 0))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Result Banner */}
          {applyState.status === "done" && (
            <div
              className={`rounded-xl border p-4 text-xs space-y-1.5 ${getResultBannerClass(applyState.result)}`}
              role="status"
            >
              {applyState.result.stoppedOnQuota ? (
                <>
                  <p className="font-semibold">
                    Paused due to YouTube daily quota limit
                  </p>
                  <p className="text-text-secondary">
                    <span className="tabular-nums font-medium">
                      {applyState.result.applied.length}
                    </span>{" "}
                    video(s) updated successfully. Remaining matched items are
                    saved so you can resume tomorrow.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">
                    Applied metadata to{" "}
                    <span className="tabular-nums">
                      {applyState.result.applied.length}
                    </span>{" "}
                    video(s)
                  </p>
                  {Object.keys(applyState.result.failed).length > 0 && (
                    <p className="text-text-secondary">
                      <span className="tabular-nums font-medium">
                        {Object.keys(applyState.result.failed).length}
                      </span>{" "}
                      failed. Failed items remain in the list for retry.
                    </p>
                  )}
                  {applyState.result.cleanedUpPaths.length > 0 && (
                    <p className="text-text-secondary">
                      Deleted{" "}
                      <span className="tabular-nums font-medium">
                        {applyState.result.cleanedUpPaths.length}
                      </span>{" "}
                      temporary exported file(s).
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Error Banner */}
          {applyState.status === "error" && (
            <div
              className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200"
              role="alert"
            >
              {applyState.message}
            </div>
          )}

          {/* Load States */}
          {loadState.status === "loading" && (
            <div className="space-y-3" aria-label="Loading matched exports">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-20 rounded-xl border border-border-subtle bg-surface/60 animate-pulse"
                />
              ))}
            </div>
          )}

          {loadState.status === "error" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center justify-between gap-4">
              <div className="text-xs text-red-200">{loadState.message}</div>
              <button
                type="button"
                onClick={() => void loadMatchedExports()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border-medium text-text-primary hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Retry
              </button>
            </div>
          )}

          {loadState.status === "ready" && items.length === 0 && (
            <div className="rounded-xl border border-border-subtle bg-surface/40 p-8 text-center space-y-2">
              <p className="text-sm font-medium text-text-primary">
                No matched exports waiting for review
              </p>
              <p className="text-xs text-text-muted">
                Exported clips uploaded to YouTube will appear here after your next
                channel sync.
              </p>
            </div>
          )}

          {loadState.status === "ready" && items.length > 0 && (
            <div className="space-y-3">
              {/* List Header */}
              <div className="flex items-center justify-between px-1">
                <label
                  htmlFor={selectAllId}
                  className="inline-flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer select-none"
                >
                  <input
                    id={selectAllId}
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleToggleAll}
                    disabled={isApplying}
                    className="h-4 w-4 rounded border-border-medium bg-surface text-accent focus:ring-accent"
                  />
                  <span>
                    Select all (
                    <span className="tabular-nums">
                      {selectedIds.size}/{items.length}
                    </span>
                    )
                  </span>
                </label>
                <span className="text-xs text-text-muted tabular-nums">
                  {items.length} matched {items.length === 1 ? "clip" : "clips"}
                </span>
              </div>

              {/* Matched Items */}
              <ul className="space-y-2.5">
                {items.map((item) => {
                  const isSelected = selectedIds.has(item.exportId);
                  const isDismissing = dismissingIds.has(item.exportId);
                  const rowQuota =
                    QUOTA_VIDEO_METADATA_UPDATE +
                    (includePlaylists &&
                    item.playlistId &&
                    !item.alreadyInPlaylist
                      ? QUOTA_PLAYLIST_ITEM_INSERT
                      : 0);

                  return (
                    <li
                      key={item.exportId}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        isSelected
                          ? "border-accent/40 bg-surface"
                          : "border-border-subtle bg-surface/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleItem(item.exportId)}
                          disabled={isApplying}
                          aria-label={`Select ${item.targetTitle}`}
                          className="mt-1 h-4 w-4 rounded border-border-medium bg-surface text-accent focus:ring-accent shrink-0"
                        />

                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="w-20 h-11 object-cover rounded-md border border-border-subtle shrink-0 bg-base"
                          />
                        ) : (
                          <div className="w-20 h-11 rounded-md border border-border-subtle shrink-0 bg-base flex items-center justify-center text-[11px] text-text-muted">
                            Clip
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-text-muted truncate">
                                {item.youtubeTitle || item.exportId}
                              </p>
                              <p className="text-sm font-medium text-text-primary truncate">
                                <span aria-hidden="true" className="text-text-muted mr-1.5">
                                  →
                                </span>
                                {item.targetTitle}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleDismiss(item.exportId)}
                              disabled={isApplying || isDismissing}
                              aria-label={`Dismiss ${item.targetTitle}`}
                              className="px-2 py-1 rounded-md text-xs text-text-muted hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border-subtle transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {isDismissing ? "Dismissing..." : "Dismiss"}
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="px-2 py-0.5 rounded-md bg-elevated border border-border-subtle text-text-secondary">
                              Privacy: {item.privacy || "unlisted"}
                            </span>

                            {item.playlistId && (
                              <span className="px-2 py-0.5 rounded-md bg-elevated border border-border-subtle text-text-secondary">
                                Playlist: {item.playlistTitle || item.playlistId}
                                {formatPlaylistSuffix(
                                  item.alreadyInPlaylist,
                                  includePlaylists,
                                )}
                              </span>
                            )}

                            <span className="px-2 py-0.5 rounded-md bg-elevated border border-border-subtle text-text-muted tabular-nums">
                              {rowQuota} units
                            </span>
                          </div>

                          {item.status === "failed" && item.errorMsg && (
                            <p className="text-xs text-red-300">
                              Previous error: {item.errorMsg}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-subtle bg-surface/60 px-6 py-4 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-2">
              <label
                htmlFor={includePlaylistsId}
                className="flex items-center gap-2 text-xs text-text-primary cursor-pointer select-none"
              >
                <input
                  id={includePlaylistsId}
                  type="checkbox"
                  checked={includePlaylists}
                  onChange={(e) => setIncludePlaylists(e.target.checked)}
                  disabled={isApplying}
                  className="h-4 w-4 rounded border-border-medium bg-surface text-accent focus:ring-accent"
                />
                <span>Also add to target playlists</span>
              </label>

              <label
                htmlFor={deleteFilesId}
                className="flex items-start gap-2 text-xs text-text-primary cursor-pointer select-none"
              >
                <input
                  id={deleteFilesId}
                  type="checkbox"
                  checked={deleteExportedFiles}
                  onChange={(e) => setDeleteExportedFiles(e.target.checked)}
                  disabled={isApplying}
                  className="mt-0.5 h-4 w-4 rounded border-border-medium bg-surface text-accent focus:ring-accent"
                />
                <span>
                  Delete temporary exported copy after applying
                  <span className="block text-[11px] text-text-muted">
                    Original source files and backups are never touched.
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-border-subtle bg-base px-3.5 py-2.5 text-right shrink-0">
              <div className="text-xs text-text-muted">Estimated Quota</div>
              <div
                data-testid="estimated-quota-value"
                className={`text-sm font-semibold tabular-nums ${
                  exceedsQuota ? "text-amber-300" : "text-text-primary"
                }`}
              >
                {estimatedQuota.toLocaleString()} units
              </div>
              {quotaStatus !== null && (
                <div className="text-[11px] text-text-muted tabular-nums">
                  Remaining today: {quotaStatus.remaining.toLocaleString()} /{" "}
                  {quotaStatus.limit.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {exceedsQuota && (
            <p className="text-xs text-amber-300">
              Estimated quota exceeds remaining daily quota. Applying will pause
              automatically if the daily limit is reached.
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-border-medium bg-surface text-text-primary hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={selectedIds.size === 0 || isApplying}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isApplying
                ? "Applying..."
                : `Apply to YouTube (${selectedIds.size} ${selectedIds.size === 1 ? "video" : "videos"})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
