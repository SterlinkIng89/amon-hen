import { useState, useRef, useCallback, useEffect } from "react";
import { QueueItem } from "../components/youtube/UploadQueue";
import { QueueRow } from "../components/youtube/QueueRow";
import {
  CancelUpload,
  ResumeUpload,
  DiscardUploadSession,
} from "../../wailsjs/go/backend/App";
import { formatSize } from "../utils/videoUtils";

interface QueuePageProps {
  queue: QueueItem[];
  running: boolean;
  onUpdateQueue: (queue: QueueItem[]) => void;
  onSetRunning: (r: boolean) => void;
  onStart: () => void;
}

// ── Main QueuePage ────────────────────────────────────────────────────────────

export default function QueuePage({
  queue,
  running,
  onUpdateQueue,
  onSetRunning,
  onStart,
}: QueuePageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Stats
  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const uploadingCount = queue.filter((i) => i.status === "uploading").length;
  const interruptedCount = queue.filter((i) => i.status === "interrupted").length;
  const doneCount = queue.filter((i) => i.status === "done").length;
  const errorCount = queue.filter((i) => i.status === "error").length;

  // Global upload speed
  const totalSpeed = queue
    .filter((i) => i.status === "uploading" && i.uploadSpeed)
    .reduce((sum, i) => sum + (i.uploadSpeed || 0), 0);

  // Global progress (of currently active batch)
  const activeItems = queue.filter(
    (i) => i.status === "uploading" || i.status === "done",
  );
  const overallProgress =
    activeItems.length > 0
      ? activeItems.reduce((sum, i) => sum + (i.progress || 100), 0) /
        activeItems.length
      : 0;

  // ── Drag to reorder ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((id: string) => setDraggingId(id), []);
  const handleDragOver = useCallback((id: string) => setDragOverId(id), []);
  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(() => {
    if (!draggingId || !dragOverId || draggingId === dragOverId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = queue.findIndex((i) => i.id === draggingId);
    const toIdx = queue.findIndex((i) => i.id === dragOverId);
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
    onUpdateQueue(queue.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleRetry = (id: string) => {
    onUpdateQueue(
      queue.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "pending",
              error: undefined,
              uploadSpeed: undefined,
              progress: 0,
            }
          : i,
      ),
    );
  };

  const handleCancelUpload = async (_id: string, path: string) => {
    try {
      await CancelUpload(path);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResumeUpload = async (id: string, path: string) => {
    onUpdateQueue(
      queue.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "uploading" as const,
              error: undefined,
            }
          : i,
      ),
    );
    try {
      await ResumeUpload(path);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDiscardSession = async (id: string, path: string) => {
    try {
      await DiscardUploadSession(path);
    } catch (e) {
      console.error(e);
    }
    onUpdateQueue(queue.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleClear = () => {
    onUpdateQueue(
      queue.filter(
        (i) =>
          i.status === "uploading" ||
          i.status === "pending" ||
          i.status === "interrupted",
      ),
    );
    setEditingId(null);
  };

  const handleSaveEdit = (id: string, patch: Partial<QueueItem>) => {
    onUpdateQueue(queue.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setEditingId(null);
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-base">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0 shrink-0 border-b border-border-subtle">
        {/* Top bar: title + controls */}
        <div className="flex items-center justify-between px-6 h-14 shrink-0 gap-4">
          <div className="flex items-center gap-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-accent shrink-0"
            >
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
            </svg>
            <span className="text-sm font-bold text-text-primary tracking-tight">
              Upload Queue
            </span>
            {queue.length > 0 && (
              <span className="text-xs text-text-secondary font-normal">
                — {pendingCount > 0 && `${pendingCount} pending`}
                {pendingCount > 0 && uploadingCount > 0 && " · "}
                {uploadingCount > 0 && `${uploadingCount} uploading`}
                {interruptedCount > 0 && ` · ${interruptedCount} interrupted`}
                {doneCount > 0 && ` · ${doneCount} done`}
                {errorCount > 0 && ` · ${errorCount} error`}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {totalSpeed > 0 && (
              <span className="text-[11px] text-accent font-semibold tabular-nums flex items-center gap-1 bg-accent/5 border border-accent/20 px-2 py-1 rounded-md">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M13 2.05v2.02c3.95.49 7 3.85 7 7.93 0 3.21-1.81 6-4.72 7.72L13 17v5h5l-1.22-1.22C19.91 19.07 22 15.76 22 12c0-5.18-3.95-9.45-9-9.95zM11 2.05C5.95 2.55 2 6.82 2 12c0 3.76 2.09 7.07 5.22 8.78L6 22h5v-5l-2.28 2.28C7.06 18.06 6 15.16 6 12c0-4.08 3.05-7.44 7-7.93V2.05z" />
                </svg>
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
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={onStart}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                Start ({pendingCount})
              </button>
            )}
            {running && (
              <button
                className="btn btn-ghost btn-sm gap-1.5 text-yellow-400"
                onClick={() => onSetRunning(false)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
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
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-text-muted"
              >
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-text-secondary">
                Queue is empty
              </p>
              <p className="text-xs text-text-muted mt-1">
                Add videos via the upload button on any clip
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-3xl mx-auto pb-12">
            {/* Section: uploading */}
            {uploadingCount > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-text-muted tracking-widest mb-2 px-1">
                  Uploading ({uploadingCount})
                </p>
                <div className="flex flex-col gap-2">
                  {queue
                    .filter((i) => i.status === "uploading")
                    .map((item, index) => (
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
                        onRetry={handleRetry}
                        onCancel={handleCancelUpload}
                        onResume={handleResumeUpload}
                        onDiscard={handleDiscardSession}
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

            {/* Section: interrupted */}
            {interruptedCount > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-amber-400/90 tracking-widest mb-2 px-1 flex items-center gap-2">
                  <span>Interrupted ({interruptedCount})</span>
                  <span className="text-[9px] text-text-muted/60 normal-case tracking-normal">
                    — saved progress ready to resume
                  </span>
                </p>
                <div className="flex flex-col gap-2">
                  {queue
                    .filter((i) => i.status === "interrupted")
                    .map((item) => (
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
                        onRetry={handleRetry}
                        onCancel={handleCancelUpload}
                        onResume={handleResumeUpload}
                        onDiscard={handleDiscardSession}
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
                <p className="text-[10px] font-semibold text-text-muted tracking-widest mb-2 px-1 flex items-center gap-2">
                  <span>Pending ({pendingCount})</span>
                  <span className="text-[9px] text-text-muted/50 normal-case tracking-normal">
                    — drag to reorder
                  </span>
                </p>
                <div className="flex flex-col gap-2">
                  {queue
                    .filter((i) => i.status === "pending")
                    .map((item, index) => (
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
                        onRetry={handleRetry}
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
                <p className="text-[10px] font-semibold text-text-muted tracking-widest mb-2 px-1">
                  Done ({doneCount})
                </p>
                <div className="flex flex-col gap-2">
                  {queue
                    .filter((i) => i.status === "done")
                    .map((item) => (
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
                        onRetry={handleRetry}
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
                <p className="text-[10px] font-semibold text-red-400/70 tracking-widest mb-2 px-1">
                  Errors ({errorCount})
                </p>
                <div className="flex flex-col gap-2">
                  {queue
                    .filter((i) => i.status === "error")
                    .map((item) => (
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
                        onRetry={handleRetry}
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
