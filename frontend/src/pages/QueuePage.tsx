import { useState, useRef, useCallback } from "react";
import { QueueItem } from "../components/youtube/UploadQueue";
import { CancelUpload } from "../../wailsjs/go/backend/App";
import VideoPill from "../components/video/VideoPill";
import { VideoFile } from "../types";
import { formatSize } from "../utils/videoUtils";

interface QueuePageProps {
  queue: QueueItem[];
  running: boolean;
  onUpdateQueue: (queue: QueueItem[]) => void;
  onSetRunning: (r: boolean) => void;
  onStart: () => void;
}

// ── Status icon set ──────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: QueueItem["status"] }) {
  if (status === "uploading") {
    return (
      <div className="relative w-5 h-5 shrink-0">
        <svg className="animate-spin-slow w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
  // pending
  return (
    <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
      </svg>
    </div>
  );
}

// ── ETA / duration helpers ──────────────────────────────────────────────────

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

// ── Inline edit form ─────────────────────────────────────────────────────────

interface EditFormProps {
  item: QueueItem;
  onSave: (patch: Partial<QueueItem>) => void;
  onCancel: () => void;
}

function EditForm({ item, onSave, onCancel }: EditFormProps) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">(item.privacy);

  return (
    <div className="flex flex-col gap-2.5 mt-2 p-3 bg-black/30 rounded-lg border border-white/5 animate-fadeIn">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-text-secondary">Title</label>
        <input
          className="bg-elevated border border-border-subtle rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-text-secondary">Description</label>
        <textarea
          className="bg-elevated border border-border-subtle rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent resize-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-text-secondary">Privacy</label>
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
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onSave({ title: title.trim() || item.title, description, privacy })}
          disabled={!title.trim()}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Queue item row ────────────────────────────────────────────────────────────

interface QueueRowProps {
  item: QueueItem;
  index: number;
  total: number;
  editingId: string | null;
  draggingId: string | null;
  dragOverId: string | null;
  onEdit: (id: string | null) => void;
  onSaveEdit: (id: string, patch: Partial<QueueItem>) => void;
  onRemove: (id: string) => void;
  onCancel: (id: string, path: string) => void;
  onMoveUp: (i: number) => void;
  onMoveDown: (i: number) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function QueueRow({
  item, index, total, editingId, draggingId, dragOverId,
  onEdit, onSaveEdit, onRemove, onCancel, onMoveUp, onMoveDown,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: QueueRowProps) {
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

  const bytesRemaining = item.size ? item.size * (1 - (item.progress || 0) / 100) : 0;
  const eta = item.status === "uploading" && item.uploadSpeed
    ? formatEta(bytesRemaining, item.uploadSpeed)
    : "";

  return (
    <div
      draggable={isPending}
      onDragStart={() => onDragStart(item.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(item.id); }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex flex-col gap-2 p-3 rounded-xl border transition-all duration-200 ${
        isDragging
          ? "opacity-40 border-accent/30 bg-accent/5"
          : isDragOver
          ? "border-accent/60 bg-accent/10"
          : item.status === "uploading"
          ? "border-accent/20 bg-accent/5"
          : item.status === "done"
          ? "border-green-500/20 bg-green-500/5"
          : item.status === "error"
          ? "border-red-500/20 bg-red-500/5"
          : "border-border-subtle bg-elevated/50 hover:border-border-medium hover:bg-elevated"
      }`}
    >
      <div className="flex gap-3 items-stretch group/row">
        {/* Drag handle — only for pending */}
        {isPending && (
          <div
            className="flex items-center justify-center w-5 cursor-grab active:cursor-grabbing text-text-muted/40 hover:text-text-muted transition-colors shrink-0 self-center"
            title="Drag to reorder"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </div>
        )}
        {!isPending && <div className="w-5 shrink-0 flex items-center justify-center self-center"><StatusIcon status={item.status} /></div>}

        {/* Video pill */}
        <div className="relative flex-1 min-w-0">
          <VideoPill
            video={videoFile}
            viewMode="list"
            compact={true}
            uploadProgress={item.status === "uploading" ? item.progress : undefined}
            uploadSpeed={item.status === "uploading" ? item.uploadSpeed : undefined}
            readOnlyThumbnail={true}
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
                <span className="text-[9px] text-text-muted tabular-nums">{eta}</span>
              )}
              <span className="text-[10px] font-bold text-accent tabular-nums">{item.progress}%</span>
            </div>
          )}
          {/* Processing indicator — transfer done but YouTube still processing */}
          {item.status === "uploading" && (item.progress ?? 0) >= 100 && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-bold text-accent tabular-nums">100%</span>
              <span className="text-[9px] text-text-muted">Procesando…</span>
            </div>
          )}
          {/* Upload duration — shown once done */}
          {item.status === "done" && item.startedAt && item.completedAt && (
            <span className="text-[9px] text-green-400/70 tabular-nums">
              Subido en {formatDuration(item.completedAt - item.startedAt)}
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
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
              View
            </a>
          )}
          {isPending && (
            <StatusIcon status="pending" />
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
            {isPending && (
              <button
                className="p-1 rounded bg-transparent border-none text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                title="Edit metadata"
                onClick={() => onEdit(editingId === item.id ? null : item.id)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </button>
            )}
            {item.status === "uploading" ? (
              <button
                className="p-1 rounded bg-transparent border-none text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Cancel upload"
                onClick={() => onCancel(item.id, item.videoPath)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            ) : (
              <button
                className="p-1 rounded bg-transparent border-none text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Remove"
                onClick={() => onRemove(item.id)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
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

// ── Main QueuePage ────────────────────────────────────────────────────────────

export default function QueuePage({ queue, running, onUpdateQueue, onSetRunning, onStart }: QueuePageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Stats
  const pendingCount  = queue.filter(i => i.status === "pending").length;
  const uploadingCount = queue.filter(i => i.status === "uploading").length;
  const doneCount     = queue.filter(i => i.status === "done").length;
  const errorCount    = queue.filter(i => i.status === "error").length;

  // Global upload speed
  const totalSpeed = queue
    .filter(i => i.status === "uploading" && i.uploadSpeed)
    .reduce((sum, i) => sum + (i.uploadSpeed || 0), 0);

  // Global progress (of currently active batch)
  const activeItems = queue.filter(i => i.status === "uploading" || i.status === "done");
  const overallProgress = activeItems.length > 0
    ? activeItems.reduce((sum, i) => sum + (i.progress || 100), 0) / activeItems.length
    : 0;

  // ── Drag to reorder ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((id: string) => setDraggingId(id), []);
  const handleDragOver  = useCallback((id: string) => setDragOverId(id), []);
  const handleDragEnd   = useCallback(() => { setDraggingId(null); setDragOverId(null); }, []);

  const handleDrop = useCallback(() => {
    if (!draggingId || !dragOverId || draggingId === dragOverId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = queue.findIndex(i => i.id === draggingId);
    const toIdx   = queue.findIndex(i => i.id === dragOverId);
    if (fromIdx === -1 || toIdx === -1) return;
    // Only allow reordering pending items
    if (queue[fromIdx].status !== "pending") return;

    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIdx, 1);
    newQueue.splice(toIdx, 0, moved);
    onUpdateQueue(newQueue);
    setDraggingId(null);
    setDragOverId(null);
  }, [draggingId, dragOverId, queue, onUpdateQueue]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleMoveUp = (i: number) => {
    if (i <= 0) return;
    const q = [...queue];
    [q[i - 1], q[i]] = [q[i], q[i - 1]];
    onUpdateQueue(q);
  };

  const handleMoveDown = (i: number) => {
    if (i >= queue.length - 1) return;
    const q = [...queue];
    [q[i], q[i + 1]] = [q[i + 1], q[i]];
    onUpdateQueue(q);
  };

  const handleRemove = (id: string) => {
    onUpdateQueue(queue.filter(i => i.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleCancelUpload = async (_id: string, path: string) => {
    try { await CancelUpload(path); } catch (e) { console.error(e); }
  };

  const handleClear = () => {
    onUpdateQueue(queue.filter(i => i.status === "uploading" || i.status === "pending"));
    setEditingId(null);
  };

  const handleSaveEdit = (id: string, patch: Partial<QueueItem>) => {
    onUpdateQueue(queue.map(i => i.id === id ? { ...i, ...patch } : i));
    setEditingId(null);
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-base">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0 shrink-0 border-b border-border-subtle">

        {/* Top bar: title + controls */}
        <div className="flex items-center justify-between px-6 h-14 shrink-0 gap-4">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-accent shrink-0">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
            </svg>
            <span className="text-sm font-bold text-text-primary tracking-tight">Upload Queue</span>
            {queue.length > 0 && (
              <span className="text-xs text-text-secondary font-normal">
                — {pendingCount > 0 && `${pendingCount} pending`}{pendingCount > 0 && uploadingCount > 0 && " · "}{uploadingCount > 0 && `${uploadingCount} uploading`}{doneCount > 0 && ` · ${doneCount} done`}{errorCount > 0 && ` · ${errorCount} error`}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {totalSpeed > 0 && (
              <span className="text-[11px] text-accent font-semibold tabular-nums flex items-center gap-1 bg-accent/5 border border-accent/20 px-2 py-1 rounded-md">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2.05v2.02c3.95.49 7 3.85 7 7.93 0 3.21-1.81 6-4.72 7.72L13 17v5h5l-1.22-1.22C19.91 19.07 22 15.76 22 12c0-5.18-3.95-9.45-9-9.95zM11 2.05C5.95 2.55 2 6.82 2 12c0 3.76 2.09 7.07 5.22 8.78L6 22h5v-5l-2.28 2.28C7.06 18.06 6 15.16 6 12c0-4.08 3.05-7.44 7-7.93V2.05z"/></svg>
                {formatSize(totalSpeed)}/s
              </span>
            )}
            {running && (
              <span className="text-[11px] text-accent font-semibold flex items-center gap-1.5 bg-accent/5 border border-accent/20 px-2 py-1 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Uploading
              </span>
            )}
            {pendingCount > 0 && !running && (
              <button className="btn btn-primary btn-sm gap-1.5" onClick={onStart}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Start ({pendingCount})
              </button>
            )}
            {running && (
              <button className="btn btn-ghost btn-sm gap-1.5 text-yellow-400" onClick={() => onSetRunning(false)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                Pause
              </button>
            )}
            {(doneCount > 0 || errorCount > 0) && (
              <button className="btn btn-ghost btn-sm" onClick={handleClear}>
                Clear done
              </button>
            )}
          </div>
        </div>

        {/* Global progress bar — only when uploading, sits right above the border */}
        {uploadingCount > 0 && (
          <div className="flex items-center gap-3 px-6 pb-2.5">
            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 bg-accent"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-accent shrink-0 w-8 text-right">
              {Math.round(overallProgress)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Queue list ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {queue.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-5 py-16 animate-fadeIn">
            <div className="w-20 h-20 rounded-2xl bg-elevated border border-border-subtle flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-text-secondary">Queue is empty</p>
              <p className="text-xs text-text-muted mt-1">Add videos via the upload button on any clip</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-3xl mx-auto pb-12">

            {/* Section: uploading */}
            {uploadingCount > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 px-1">
                  Uploading ({uploadingCount})
                </p>
                <div className="flex flex-col gap-2">
                  {queue.filter(i => i.status === "uploading").map((item, index) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={queue.length}
                      editingId={editingId}
                      draggingId={draggingId}
                      dragOverId={dragOverId}
                      onEdit={setEditingId}
                      onSaveEdit={handleSaveEdit}
                      onRemove={handleRemove}
                      onCancel={handleCancelUpload}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Section: pending */}
            {pendingCount > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 px-1 flex items-center gap-2">
                  <span>Pending ({pendingCount})</span>
                  <span className="text-[9px] text-text-muted/50 normal-case tracking-normal">— drag to reorder</span>
                </p>
                <div className="flex flex-col gap-2">
                  {queue.filter(i => i.status === "pending").map((item, index) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      index={queue.indexOf(item)}
                      total={queue.length}
                      editingId={editingId}
                      draggingId={draggingId}
                      dragOverId={dragOverId}
                      onEdit={setEditingId}
                      onSaveEdit={handleSaveEdit}
                      onRemove={handleRemove}
                      onCancel={handleCancelUpload}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Section: done */}
            {doneCount > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 px-1">
                  Done ({doneCount})
                </p>
                <div className="flex flex-col gap-2">
                  {queue.filter(i => i.status === "done").map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      index={queue.indexOf(item)}
                      total={queue.length}
                      editingId={editingId}
                      draggingId={draggingId}
                      dragOverId={dragOverId}
                      onEdit={setEditingId}
                      onSaveEdit={handleSaveEdit}
                      onRemove={handleRemove}
                      onCancel={handleCancelUpload}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Section: errors */}
            {errorCount > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-red-400/70 uppercase tracking-widest mb-2 px-1">
                  Errors ({errorCount})
                </p>
                <div className="flex flex-col gap-2">
                  {queue.filter(i => i.status === "error").map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      index={queue.indexOf(item)}
                      total={queue.length}
                      editingId={editingId}
                      draggingId={draggingId}
                      dragOverId={dragOverId}
                      onEdit={setEditingId}
                      onSaveEdit={handleSaveEdit}
                      onRemove={handleRemove}
                      onCancel={handleCancelUpload}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
