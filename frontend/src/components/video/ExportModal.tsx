import React, { useState, useEffect } from "react";
import {
  GetDefaultExportFolder,
  SetDefaultExportFolder,
  SelectExportFolder,
  ExportVideos,
  OpenFolderInExplorer,
} from "../../../wailsjs/go/backend/App";
import { VideoFile, GameProfile, ExportItem, ExportResult } from "../../types";
import { resolveDisplayTitle } from "../../utils/videoUtils";

export interface ExportModalProps {
  readonly open: boolean;
  readonly selectedVideos: VideoFile[];
  readonly profiles: Record<string, GameProfile>;
  readonly titleSeparator?: string;
  readonly onClose: () => void;
  readonly onExportComplete?: (result: ExportResult) => void;
}

export default function ExportModal({
  open,
  selectedVideos,
  profiles,
  titleSeparator,
  onClose,
  onExportComplete,
}: ExportModalProps) {
  const [destinationFolder, setDestinationFolder] = useState<string>("");
  const [loadingFolder, setLoadingFolder] = useState<boolean>(true);
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(false);
  const [writeMetadata, setWriteMetadata] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingFolder(true);
    setErrorMsg(null);
    setExportResult(null);

    GetDefaultExportFolder()
      .then((folder) => {
        setDestinationFolder(folder || "");
      })
      .catch((err) => {
        console.error("Failed to fetch default export folder:", err);
      })
      .finally(() => {
        setLoadingFolder(false);
      });
  }, [open]);

  if (!open) return null;

  const handleBrowseFolder = async () => {
    try {
      const selected = await SelectExportFolder();
      if (selected) {
        setDestinationFolder(selected);
      }
    } catch (err) {
      console.error("Failed to select destination folder:", err);
    }
  };

  const handleOpenFolder = async (folderPath: string) => {
    try {
      await OpenFolderInExplorer(folderPath);
    } catch (err) {
      console.error("Failed to open folder in explorer:", err);
    }
  };

  const handleStartExport = async () => {
    if (!destinationFolder.trim()) {
      setErrorMsg("Please select a destination folder.");
      return;
    }

    setIsExporting(true);
    setErrorMsg(null);

    try {
      if (saveAsDefault) {
        await SetDefaultExportFolder(destinationFolder);
      }

      const items: ExportItem[] = selectedVideos.map((v) => {
        const title = resolveDisplayTitle(v, profiles, titleSeparator);
        return {
          sourcePath: v.path,
          targetTitle: title,
          description: v.description || "",
          game: v.game || "",
          playlistTitle: v.playlistTitle || "",
          privacy: v.privacy || "unlisted",
          tags: v.game ? [v.game] : [],
        };
      });

      const res = await ExportVideos(items, destinationFolder, writeMetadata);
      setExportResult(res);
      onExportComplete?.(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="bg-surface border border-border-subtle rounded-lg w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h2
              id="export-modal-title"
              className="text-base font-bold text-text-primary m-0"
            >
              Export Videos
            </h2>
            <p className="text-xs text-text-muted mt-0.5 m-0">
              Export {selectedVideos.length} selected video
              {selectedVideos.length === 1 ? "" : "s"} with resolved application
              titles for YouTube
            </p>
          </div>
          <button
            type="button"
            className="p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-card border-none bg-transparent cursor-pointer transition-colors"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Close export dialog"
            title="Close"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-400">
              {errorMsg}
            </div>
          )}

          {exportResult ? (
            <div className="space-y-4">
              <div className="p-4 bg-accent/10 border border-accent/25 rounded-md">
                <h3 className="text-sm font-semibold text-accent m-0">
                  Export Finished
                </h3>
                <p className="text-xs text-text-secondary mt-1 m-0">
                  Successfully exported {exportResult.successCount} of{" "}
                  {selectedVideos.length} video
                  {selectedVideos.length === 1 ? "" : "s"} to:
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenFolder(destinationFolder)}
                    className="group flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-black/40 hover:bg-black/60 border border-border-subtle hover:border-accent/40 text-xs font-mono text-text-primary cursor-pointer transition-all text-left break-all w-full"
                    title="Click to open destination folder in File Explorer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="shrink-0 text-accent group-hover:scale-110 transition-transform"
                      >
                        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                      </svg>
                      <span className="truncate underline decoration-accent/50 underline-offset-2 group-hover:decoration-accent font-medium">
                        {destinationFolder}
                      </span>
                    </div>
                    <span className="text-[11px] text-accent font-sans font-medium px-2 py-0.5 rounded bg-accent/15 shrink-0">
                      Open Folder ↗
                    </span>
                  </button>
                </div>
                {exportResult.failedCount > 0 && (
                  <div className="mt-2 text-xs text-red-400">
                    <p className="font-medium m-0">
                      {exportResult.failedCount} file(s) failed to copy:
                    </p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {exportResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold text-text-muted">
                  Exported Files:
                </span>
                <div className="mt-1.5 max-h-40 overflow-y-auto rounded border border-border-subtle bg-black/20 p-2 space-y-1">
                  {exportResult.exportedPaths.map((p, i) => (
                    <div
                      key={i}
                      className="text-xs text-text-secondary font-mono truncate hover:text-accent cursor-pointer transition-colors flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-black/30"
                      title={`Click to open folder: ${destinationFolder}`}
                      onClick={() => handleOpenFolder(destinationFolder)}
                    >
                      <span className="text-text-muted text-[10px]">📄</span>
                      <span className="truncate">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Destination folder section */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Destination Folder
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-black/30 border border-border-subtle rounded px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    value={destinationFolder}
                    onChange={(e) => setDestinationFolder(e.target.value)}
                    placeholder={
                      loadingFolder
                        ? "Loading default folder..."
                        : "Select destination folder..."
                    }
                    disabled={isExporting}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm shrink-0"
                    onClick={handleBrowseFolder}
                    disabled={isExporting}
                  >
                    Browse...
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveAsDefault}
                      onChange={(e) => setSaveAsDefault(e.target.checked)}
                      disabled={isExporting}
                      className="rounded border-border-subtle accent-accent cursor-pointer"
                    />
                    <span>Remember as default export destination</span>
                  </label>
                </div>
              </div>

              {/* Options */}
              <div className="pt-1 border-t border-border-subtle">
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={writeMetadata}
                    onChange={(e) => setWriteMetadata(e.target.checked)}
                    disabled={isExporting}
                    className="rounded border-border-subtle accent-accent cursor-pointer"
                  />
                  <span>
                    Generate companion metadata file (.txt) with description and
                    tags
                  </span>
                </label>
              </div>

              {/* Preview of renamed titles */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-text-secondary">
                    Renamed Files Preview
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {selectedVideos.length} items
                  </span>
                </div>
                <div className="border border-border-subtle rounded-md bg-card/40 max-h-48 overflow-y-auto divide-y divide-border-subtle">
                  {selectedVideos.map((v) => {
                    const resolvedTitle = resolveDisplayTitle(
                      v,
                      profiles,
                      titleSeparator,
                    );
                    const ext = v.name.includes(".")
                      ? v.name.slice(v.name.lastIndexOf("."))
                      : ".mp4";
                    return (
                      <div
                        key={v.path}
                        className="p-2.5 flex flex-col gap-0.5 text-xs hover:bg-card/70 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 text-text-primary font-medium truncate">
                          <span className="text-accent shrink-0">→</span>
                          <span
                            className="truncate font-mono text-[11px]"
                            title={`${resolvedTitle}${ext}`}
                          >
                            {resolvedTitle}
                            {ext}
                          </span>
                        </div>
                        <div
                          className="text-[10px] text-text-muted truncate ml-4"
                          title={v.name}
                        >
                          Source: {v.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-border-subtle bg-elevated/40 flex items-center justify-end gap-2.5">
          {exportResult ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm flex items-center gap-1.5"
                onClick={() => handleOpenFolder(destinationFolder)}
                title="Open destination folder in File Explorer"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="opacity-75"
                >
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
                Open Folder
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm min-w-[80px]"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onClose}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm min-w-[120px]"
                onClick={handleStartExport}
                disabled={isExporting || loadingFolder}
              >
                {isExporting ? "Exporting..." : `Export ${selectedVideos.length} Videos`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
