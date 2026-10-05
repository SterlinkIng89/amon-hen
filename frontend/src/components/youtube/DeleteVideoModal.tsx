import React, { useState } from "react";
import { YTVideo } from "../../types";
import {
  DeleteYouTubeVideo,
  DeleteYouTubeVideos,
} from "../../../wailsjs/go/backend/App";

export interface DeleteVideoModalProps {
  readonly videos: readonly YTVideo[];
  readonly onClose: () => void;
  readonly onDeleted: (deletedIds: string[]) => void;
}

type ModalState =
  | { readonly status: "idle" }
  | { readonly status: "deleting" }
  | { readonly status: "error"; readonly message: string };

export default function DeleteVideoModal({
  videos,
  onClose,
  onDeleted,
}: DeleteVideoModalProps) {
  const [deleteLocalFile, setDeleteLocalFile] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [state, setState] = useState<ModalState>({ status: "idle" });

  if (videos.length === 0) {
    return null;
  }

  const isBulk = videos.length > 1;
  const isInputMatched = confirmInput.trim() === "DELETE";
  const canConfirm =
    state.status !== "deleting" &&
    isInputMatched &&
    (isBulk || acknowledged);

  const handleDelete = async () => {
    if (!canConfirm) return;
    setState({ status: "deleting" });

    try {
      if (!isBulk) {
        const singleVideo = videos[0];
        await DeleteYouTubeVideo(singleVideo.id, deleteLocalFile);
        onDeleted([singleVideo.id]);
        onClose();
      } else {
        const ids = videos.map((v) => v.id);
        const res = await DeleteYouTubeVideos(ids, deleteLocalFile);
        const rawRes: unknown = res;
        const deletedIds = Array.isArray(rawRes) && Array.isArray(rawRes[0]) ? (rawRes[0] as string[]) : [];
        const errors = Array.isArray(rawRes) && Array.isArray(rawRes[1]) ? (rawRes[1] as string[]) : [];

        if (deletedIds.length > 0) {
          onDeleted(deletedIds);
        }

        if (errors.length > 0) {
          setState({
            status: "error",
            message: `Deleted ${deletedIds.length} video(s), but encountered ${errors.length} error(s):\n${errors.join("\n")}`,
          });
        } else {
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({
        status: "error",
        message: msg.replace(/^Error:\s*/, ""),
      });
    }
  };

  const firstVideo = videos[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-elevated border border-border-medium rounded-xl shadow-sm w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning Banner */}
        <div className="bg-red-500/10 border-b border-red-500/20 px-5 py-4 flex items-start gap-3">
          <svg
            className="w-5 h-5 text-red-400 shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-red-400">
              {isBulk
                ? `Delete ${videos.length} Videos from YouTube?`
                : "Delete Video from YouTube?"}
            </h3>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              Deletion from YouTube is{" "}
              <strong className="text-red-400 font-semibold">
                permanent and cannot be recovered
              </strong>
              . This will erase the video, comments, views, and analytics
              forever.
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          {/* Video summary */}
          {!isBulk ? (
            <div className="flex gap-3 bg-surface/40 p-3 rounded-lg border border-border-subtle items-center">
              {firstVideo.thumbnailUrl ? (
                <img
                  src={firstVideo.thumbnailUrl}
                  alt={firstVideo.title}
                  className="w-24 aspect-video object-cover rounded bg-black/40 shrink-0"
                />
              ) : (
                <div className="w-24 aspect-video rounded bg-black/40 shrink-0 flex items-center justify-center text-text-muted text-xs">
                  No preview
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-text-primary line-clamp-2">
                  {firstVideo.title}
                </span>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
                  <span className="font-mono">ID: {firstVideo.id}</span>
                  {firstVideo.publishedAt && (
                    <>
                      <span>•</span>
                      <span>
                        {new Date(firstVideo.publishedAt).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-text-secondary">
                Selected videos ({videos.length}):
              </span>
              <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-lg border border-border-subtle bg-surface/30 divide-y divide-border-subtle">
                {videos.map((v) => (
                  <div
                    key={v.id}
                    className="p-2.5 flex items-center justify-between text-xs gap-3"
                  >
                    <span className="text-text-primary truncate font-medium">
                      {v.title}
                    </span>
                    <span className="text-[11px] text-text-muted font-mono shrink-0">
                      {v.id}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local File Checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border-medium text-accent focus:ring-0"
              checked={deleteLocalFile}
              onChange={(e) => setDeleteLocalFile(e.target.checked)}
              disabled={state.status === "deleting"}
            />
            <span>
              Also delete local recording file from disk{" "}
              <span className="text-text-muted">(if linked)</span>
            </span>
          </label>

          {/* Acknowledgement Checkbox for single video */}
          {!isBulk && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-text-secondary bg-red-500/5 p-2.5 rounded-lg border border-red-500/15">
              <input
                type="checkbox"
                aria-label="I understand this video will be permanently erased from YouTube"
                className="mt-0.5 rounded border-red-500/30 text-red-500 focus:ring-0"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={state.status === "deleting"}
              />
              <span className="text-text-primary leading-tight font-medium">
                I understand this video will be permanently erased from YouTube
              </span>
            </label>
          )}

          {/* Verification Text Input */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="delete-confirm-input"
              className="text-xs font-medium text-text-secondary"
            >
              To confirm, type{" "}
              <span className="font-mono text-red-400 font-bold">DELETE</span>{" "}
              below:
            </label>
            <input
              id="delete-confirm-input"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              disabled={state.status === "deleting"}
              className="w-full bg-surface border border-border-medium rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-red-400 font-mono"
            />
          </div>

          {/* Error Message */}
          {state.status === "error" && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 whitespace-pre-line">
              {state.message}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-surface/50 border-t border-border-subtle px-5 py-3 flex items-center justify-end gap-2.5">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={state.status === "deleting"}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm flex items-center gap-1.5 disabled:opacity-50"
            disabled={!canConfirm}
            onClick={handleDelete}
          >
            {state.status === "deleting" ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>
                {isBulk ? `Delete ${videos.length} Videos` : "Delete Video"}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
