import { useState, useEffect } from "react";
import {
  GetBackupFolder,
  GetFolderSettings,
  RunFolderBackup,
  SaveFolderSettings,
} from "../../../wailsjs/go/backend/App";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { backend } from "../../../wailsjs/go/models";
import { BackupRunResult } from "../../types";

interface BackupProgressPayload {
  readonly current: number;
  readonly total: number;
  readonly copied: number;
  readonly skipped: number;
  readonly failed: number;
}

type BackupRunState =
  | { status: "idle" }
  | { status: "running"; progress: BackupProgressPayload | null }
  | { status: "done"; result: BackupRunResult }
  | { status: "error"; message: string };

function parseBackupProgress(payload: unknown): BackupProgressPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.current !== "number" || typeof record.total !== "number") {
    return null;
  }
  return {
    current: record.current,
    total: record.total,
    copied: typeof record.copied === "number" ? record.copied : 0,
    skipped: typeof record.skipped === "number" ? record.skipped : 0,
    failed: typeof record.failed === "number" ? record.failed : 0,
  };
}

function isBackupRunResult(payload: unknown): payload is BackupRunResult {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return (
    typeof record.copiedCount === "number" &&
    typeof record.skippedCount === "number" &&
    typeof record.failedCount === "number"
  );
}

interface FolderSettingsProps {
  folder: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onSave?: (folder: string, settings: backend.FolderConfig) => void;
  onRemoveFolder?: (folder: string) => void;
}

export default function FolderSettingsDialog({
  folder,
  open,
  onClose,
  onSaved,
  onRemoveFolder,
}: FolderSettingsProps) {
  const [recursive, setRecursive] = useState(false);
  const [maxDur, setMaxDur] = useState<number | "">("");
  const [autoBackup, setAutoBackup] = useState(false);
  const [backupFolderConfigured, setBackupFolderConfigured] = useState(false);
  const [backupRunState, setBackupRunState] = useState<BackupRunState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmDelete(false);
      setBackupRunState({ status: "idle" });
      return;
    }
    let cancelled = false;
    Promise.all([GetFolderSettings(folder), GetBackupFolder()])
      .then(([cfg, dir]) => {
        if (cancelled) return;
        setRecursive(cfg.recursive || false);
        setMaxDur(cfg.max_duration_secs > 0 ? cfg.max_duration_secs : "");
        setAutoBackup(Boolean(cfg.auto_backup));
        setBackupFolderConfigured(Boolean(dir && dir.trim().length > 0));
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [open, folder]);

  useEffect(() => {
    if (!open) return;
    const unsubProgress = EventsOn("backup:progress", (payload: unknown) => {
      const progress = parseBackupProgress(payload);
      if (!progress) return;
      setBackupRunState((prev) =>
        prev.status === "running" ? { status: "running", progress } : prev
      );
    });
    const unsubDone = EventsOn("backup:done", (payload: unknown) => {
      if (!isBackupRunResult(payload)) return;
      setBackupRunState((prev) =>
        prev.status === "running" ? { status: "done", result: payload } : prev
      );
    });
    return () => {
      unsubProgress();
      unsubDone();
    };
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const dur = typeof maxDur === "number" ? maxDur : 0;
      await SaveFolderSettings(
        folder,
        backend.FolderConfig.createFrom({
          recursive,
          max_duration_secs: dur,
          auto_backup: autoBackup,
        })
      );
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const handleBackupNow = async () => {
    if (!backupFolderConfigured || backupRunState.status === "running") return;
    setBackupRunState({ status: "running", progress: null });
    try {
      const result = await RunFolderBackup(folder);
      setBackupRunState({ status: "done", result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Backup failed";
      setBackupRunState({ status: "error", message });
    }
  };

  // Convert seconds to mm:ss for display
  const formatSecs = (s: number) => {
    if (s <= 0) return "No limit";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-surface border border-border-subtle rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-elevated">
          <h2 className="text-sm font-bold text-text-primary">
            Folder Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-black/20 transition-colors bg-transparent border-none cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-6">
          <div
            className="text-xs text-text-secondary truncate bg-black/20 p-2 rounded-md font-mono border border-border-subtle"
            title={folder}
          >
            {folder}
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
              />
              <div className="w-4 h-4 border border-border-medium rounded bg-elevated peer-checked:bg-accent peer-checked:border-accent transition-colors" />
              <svg
                className="absolute w-3 h-3 text-base pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                Include Subfolders (Recursive)
              </span>
              <span className="text-xs text-text-muted mt-0.5">
                Scan all directories inside this folder
              </span>
            </div>
          </label>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary flex flex-col">
              Max video duration (seconds)
              <span className="text-xs text-text-muted font-normal mt-0.5">
                Leave blank or 0 for no limit. Useful for "Clips" folders.
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                value={maxDur}
                onChange={(e) =>
                  setMaxDur(e.target.value ? parseInt(e.target.value) : "")
                }
                placeholder="e.g. 90 for 1m30s"
                className="flex-1 px-3 py-2 bg-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:border-accent outline-none"
              />
              <div className="text-xs font-mono text-accent bg-accent/10 px-2 py-1 rounded border border-accent/20 min-w-[50px] text-center">
                {formatSecs(typeof maxDur === "number" ? maxDur : 0)}
              </div>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
            <label
              className={`flex items-start gap-3 group ${
                backupFolderConfigured ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              }`}
            >
              <div className="relative flex items-center justify-center mt-0.5">
                <input
                  type="checkbox"
                  data-testid="folder-auto-backup-toggle"
                  className="peer sr-only"
                  checked={autoBackup}
                  disabled={!backupFolderConfigured}
                  onChange={(e) => setAutoBackup(e.target.checked)}
                />
                <div className="w-4 h-4 border border-border-medium rounded bg-elevated peer-checked:bg-accent peer-checked:border-accent transition-colors" />
                <svg
                  className="absolute w-3 h-3 text-base pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                  Auto-backup this folder
                </span>
                <span className="text-xs text-text-muted mt-0.5">
                  {backupFolderConfigured
                    ? "Only videos in this selected folder are backed up; other folders are untouched."
                    : "Configure a global backup destination folder in General Settings first."}
                </span>
              </div>
            </label>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                data-testid="folder-backup-now-btn"
                onClick={() => void handleBackupNow()}
                disabled={!backupFolderConfigured || backupRunState.status === "running"}
                className="px-3 py-1.5 text-xs font-medium text-text-primary bg-elevated border border-border-subtle rounded-md hover:border-border-medium transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {backupRunState.status === "running" ? "Backing up..." : "Back up now"}
              </button>
              {backupRunState.status === "running" && backupRunState.progress && (
                <span
                  data-testid="folder-backup-progress"
                  className="text-xs text-text-secondary tabular-nums"
                >
                  {backupRunState.progress.current}/{backupRunState.progress.total} files
                </span>
              )}
              {backupRunState.status === "done" && (
                <span
                  data-testid="folder-backup-result"
                  className="text-xs text-text-secondary tabular-nums"
                >
                  Copied {backupRunState.result.copiedCount}, skipped{" "}
                  {backupRunState.result.skippedCount}
                  {backupRunState.result.failedCount > 0
                    ? `, failed ${backupRunState.result.failedCount}`
                    : ""}
                </span>
              )}
              {backupRunState.status === "error" && (
                <span
                  data-testid="folder-backup-error"
                  role="alert"
                  className="text-xs text-red-400"
                >
                  {backupRunState.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-elevated border-t border-border-subtle flex items-center justify-between">
          <div className="flex items-center">
            {onRemoveFolder &&
              (confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-400">
                    Are you sure?
                  </span>
                  <button
                    onClick={() => {
                      onRemoveFolder(folder);
                      onClose();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded hover:bg-red-600 transition-colors cursor-pointer border-none"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-text-secondary bg-transparent hover:text-text-primary transition-colors cursor-pointer border-none"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors cursor-pointer bg-transparent border-none"
                >
                  Remove Folder
                </button>
              ))}
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-text-secondary bg-transparent border border-border-subtle rounded-md hover:bg-black/20 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-4 py-2 text-sm font-semibold text-base bg-accent rounded-md transition-colors cursor-pointer flex items-center justify-center min-w-[80px] ${
                saving ? "opacity-70 cursor-wait" : "hover:bg-accent-hover"
              }`}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
