import { useState } from "react";
import { QueueItem } from "./UploadQueue";
import VideoPill from "../video/VideoPill";
import { VideoFile } from "../../types";
import { formatSize } from "../../utils/videoUtils";

function StatusIcon({ status }: { status: QueueItem["status"] }) {
  if (status === "uploading") {
    return (
      <div className="relative w-5 h-5 shrink-0">
        <svg
          className="animate-spin-slow w-5 h-5 text-accent"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2"
            strokeOpacity="0.2"
          />
          <path
            d="M12 3a9 9 0 0 1 9 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }
  if (status === "processing") {
    return (
      <div className="relative w-5 h-5 shrink-0">
        <svg
          className="animate-spin-slow w-5 h-5 text-blue-400"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2"
            strokeOpacity="0.2"
          />
          <path
            d="M12 3a9 9 0 0 1 9 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center shrink-0">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4ade80"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="#f87171">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      </div>
    );
  }
  if (status === "interrupted") {
    return (
      <div
        className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0"
        title="Upload interrupted"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="#fbbf24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      </div>
    );
  }
  // pending
  return (
    <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="text-text-muted"
      >
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
      </svg>
    </div>
  );
}

function formatEta(bytesRemaining: number, speed: number): string {
  if (!speed || speed <= 0) return "";
  const secs = bytesRemaining / speed;
  if (secs < 60) return `~${Math.round(secs)}s`;
  if (secs < 3600) return `~${Math.round(secs / 60)}m`;
  return `~${(secs / 3600).toFixed(1)}h`;
}

function formatDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

interface EditFormProps {
  item: QueueItem;
  onSave: (patch: Partial<QueueItem>) => void;
  onCancel: () => void;
}

function EditForm({ item, onSave, onCancel }: EditFormProps) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">(
    item.privacy,
  );

  return (
    <div className="flex flex-col gap-2.5 mt-2 p-3 bg-black/30 rounded-lg border border-white/5 animate-fadeIn">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-text-secondary">
          Title
        </label>
        <input
          className="bg-elevated border border-border-subtle rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-text-secondary">
          Description
        </label>
        <textarea
          className="bg-elevated border border-border-subtle rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent resize-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-text-secondary">
          Privacy
        </label>
        <div className="flex gap-1.5">
          {(["public", "unlisted", "private"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPrivacy(p)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all border ${
                privacy === p
                  ? "bg-accent/10 text-accent border-accent/40"
                  : "bg-elevated border-border-subtle text-text-muted hover:text-text-primary"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-1">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() =>
            onSave({ title: title.trim() || item.title, description, privacy })
          }
          disabled={!title.trim()}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export interface QueueRowProps {
  item: QueueItem;
  index: number;
  total: number;
  editingId: string | null;
  draggingId: string | null;
  dragOverId: string | null;
  onEdit: (id: string | null) => void;
  onSaveEdit: (id: string, patch: Partial<QueueItem>) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string, path: string) => void;
  onResume?: (id: string, path: string) => void;
  onDiscard?: (id: string, path: string) => void;
  onMoveUp: (i: number) => void;
  onMoveDown: (i: number) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function QueueRow({
  item,
  index,
  total,
  editingId,
  draggingId,
  dragOverId,
  onEdit,
  onSaveEdit,
  onRemove,
  onRetry,
  onCancel,
  onResume,
  onDiscard,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: QueueRowProps) {
  const [thumbBase64, setThumbBase64] = useState<string | null>(null);
  const isDragging = draggingId === item.id;
  const isDragOver = dragOverId === item.id && draggingId !== item.id;
  const isPending = item.status === "pending";

  const videoFile: VideoFile = {
    name: item.videoName,
    path: item.videoPath,
    size: item.size || 0,
    modTime: 0,
    folder: "",
    game: item.gameTag || "",
    youtubeTitle: item.title,
    youtubeId: item.status === "done" ? "done" : undefined,
  };

  const bytesRemaining = item.size
    ? item.size * (1 - (item.progress || 0) / 100)
    : 0;
  const eta =
    item.status === "uploading" && item.uploadSpeed
      ? formatEta(bytesRemaining, item.uploadSpeed)
      : "";

  return (
    <div
      draggable={isPending}
      onDragStart={() => onDragStart(item.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(item.id);
      }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`relative overflow-hidden flex flex-col gap-2 p-3 rounded-xl border transition-all duration-200 ${
        isDragging
          ? "opacity-40 border-accent/30 bg-accent/5"
          : isDragOver
            ? "border-accent/60 bg-accent/10"
            : item.status === "uploading"
              ? "border-accent/20 bg-accent/5"
              : item.status === "interrupted"
                ? "border-amber-500/20 bg-amber-500/5"
                : item.status === "done"
                  ? "border-green-500/20 bg-green-500/5"
                  : item.status === "error"
                    ? "border-red-500/20 bg-red-500/5"
                    : "border-border-subtle bg-elevated/50 hover:border-border-medium hover:bg-elevated"
      }`}
    >
      {thumbBase64 && (
        <div
          className="absolute inset-0 bg-cover bg-center blur-[12px] saturate-[1.4] pointer-events-none transition-opacity duration-400"
          style={{
            backgroundImage: `url(${thumbBase64})`,
            opacity:
              item.status === "uploading" || item.status === "interrupted"
                ? 0.1
                : item.status === "done"
                  ? 0.06
                  : 0.08,
          }}
        />
      )}
      <div className="relative z-10 flex gap-3 items-stretch group/row">
        {/* Drag handle — only for pending */}
        {isPending && (
          <div
            className="flex items-center justify-center w-5 cursor-grab active:cursor-grabbing text-text-muted/40 hover:text-text-muted transition-colors shrink-0 self-center"
            title="Drag to reorder"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </div>
        )}
        {!isPending && (
          <div className="w-5 shrink-0 flex items-center justify-center self-center">
            <StatusIcon status={item.status} />
          </div>
        )}

        {/* Video pill */}
        <div className="relative flex-1 min-w-0">
          <VideoPill
            video={videoFile}
            viewMode="list"
            compact={true}
            uploadProgress={
              item.status === "uploading" || item.status === "interrupted"
                ? item.progress
                : undefined
            }
            uploadSpeed={
              item.status === "uploading" ? item.uploadSpeed : undefined
            }
            readOnlyThumbnail={true}
            onThumbLoaded={setThumbBase64}
          />
          {item.status === "error" && (
            <div className="absolute inset-0 bg-red-500/20 border border-red-500/40 rounded-xl pointer-events-none flex items-center justify-center backdrop-blur-[1px]">
              <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg truncate max-w-[90%]">
                {item.error}
              </span>
            </div>
          )}
        </div>

        {/* Right: status + speed + actions */}
        <div className="flex flex-col items-end justify-between gap-1 shrink-0 min-w-[80px]">
          {/* Speed + ETA — only while uploading AND transfer not yet complete */}
          {item.status === "uploading" && (item.progress ?? 0) < 100 && (
            <div className="flex flex-col items-end gap-0.5">
              {item.uploadSpeed && item.uploadSpeed > 0 && (
                <span className="text-[10px] font-semibold text-accent tabular-nums">
                  {formatSize(item.uploadSpeed)}/s
                </span>
              )}
              {eta && (
                <span className="text-[9px] text-text-muted tabular-nums">
                  {eta}
                </span>
              )}
              <span className="text-[10px] font-bold text-accent tabular-nums">
                {item.progress}%
              </span>
            </div>
          )}
          {/* Processing indicator — transfer done but YouTube still processing */}
          {item.status === "uploading" && (item.progress ?? 0) >= 100 && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-bold text-accent tabular-nums">
                100%
              </span>
              <span className="text-[9px] text-text-muted">Processing...</span>
            </div>
          )}
          {/* Upload duration — shown once done */}
          {item.status === "done" && item.startedAt && item.completedAt && (
            <span className="text-[9px] text-green-400/70 tabular-nums">
              Uploaded in {formatDuration(item.completedAt - item.startedAt)}
            </span>
          )}
          {item.status === "done" && item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-0.5 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
              </svg>
              View
            </a>
          )}
          {item.status === "interrupted" && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-bold text-amber-400 tabular-nums">
                {item.progress}%
              </span>
              <span className="text-[9px] text-amber-400/90 font-medium">
                Interrupted
              </span>
            </div>
          )}
          {isPending && <StatusIcon status="pending" />}

          {/* Action buttons */}
          <div
            className={`flex items-center gap-1 transition-opacity ${
              item.status === "interrupted"
                ? "opacity-100"
                : "opacity-0 group-hover/row:opacity-100"
            }`}
          >
            {item.status === "interrupted" ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Resume upload"
                  aria-label="Resume"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResume?.(item.id, item.videoPath);
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Resume</span>
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Discard session"
                  aria-label="Discard"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard?.(item.id, item.videoPath);
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                  <span>Discard</span>
                </button>
              </div>
            ) : isPending ? (
              <button
                className="p-1 rounded bg-transparent border-none text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                title="Edit metadata"
                onClick={() => onEdit(editingId === item.id ? null : item.id)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
              </button>
            ) : item.status === "uploading" || item.status === "processing" ? (
              <button
                className="p-1 rounded bg-transparent border-none text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Cancel upload"
                onClick={() => onCancel(item.id, item.videoPath)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            ) : item.status === "error" ? (
              <>
                <button
                  className="p-1 rounded bg-transparent border-none text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                  title="Retry"
                  onClick={() => onRetry(item.id)}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                  </svg>
                </button>
                <button
                  className="p-1 rounded bg-transparent border-none text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove"
                  onClick={() => onRemove(item.id)}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                className="p-1 rounded bg-transparent border-none text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Remove"
                onClick={() => onRemove(item.id)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline edit form */}
      {editingId === item.id && isPending && (
        <EditForm
          item={item}
          onSave={(patch) => onSaveEdit(item.id, patch)}
          onCancel={() => onEdit(null)}
        />
      )}
    </div>
  );
}
