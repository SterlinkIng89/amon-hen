import { useEffect, useRef, useState } from "react";
import { EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime";
import { UploadToYouTube, ShowUploadNotification, SetTrayUploadProgress, CancelUpload } from "../../../wailsjs/go/backend/App";
import { formatName } from "../../utils/videoUtils";

export interface QueueItem {
  id: string;
  videoPath: string;
  videoName: string;
  title: string;
  description: string;
  privacy: "public" | "unlisted" | "private";
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  playlistId?: string;
  gameTag?: string;
  episode?: number;
  url?: string;
  error?: string;
}

interface Props {
  open: boolean;
  queue: QueueItem[];
  running: boolean;
  onClose: () => void;
  onUpdateQueue: (queue: QueueItem[]) => void;
  onSetRunning: (r: boolean) => void;
  onUploadDone?: () => void;
}

const statusIcon = {
  pending: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--text-muted)" }}>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
    </svg>
  ),
  uploading: <div className="spinner-sm" />,
  done: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#4ade80" }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  error: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#f87171" }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  ),
};

// ─── Inline edit form for a single pending item ───────────────────────────────

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
    <div className="flex flex-col gap-2.5 mt-2 p-3 bg-black/20 rounded-md border border-white/5 animate-fadeIn">
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

// ─── Main UploadQueue component ───────────────────────────────────────────────

export default function UploadQueue({ open, queue, running, onClose, onUpdateQueue, onSetRunning, onUploadDone }: Props) {
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const runningRef = useRef(running);
  runningRef.current = running;
  const onUploadDoneRef = useRef(onUploadDone);
  onUploadDoneRef.current = onUploadDone;

  // Track which pending item (by id) is currently being edited
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    EventsOn("youtube:progress", (data: { path: string; percent: number }) => {
      SetTrayUploadProgress(data.percent).catch(() => {});
      onUpdateQueue(queueRef.current.map((item) =>
        item.videoPath === data.path
          ? { ...item, status: "uploading", progress: data.percent }
          : item
      ));
    });

    EventsOn("youtube:done", (data: { path: string; url: string }) => {
      const updated = queueRef.current.map((item) =>
        item.videoPath === data.path
          ? { ...item, status: "done" as const, progress: 100, url: data.url }
          : item
      );
      onUpdateQueue(updated);
      SetTrayUploadProgress(-1).catch(() => {});
      const doneItem = queueRef.current.find(i => i.videoPath === data.path);
      const videoTitle = doneItem?.title || doneItem?.videoName || "Video";
      ShowUploadNotification("Upload complete!", videoTitle).catch(() => {});
      processQueue(updated);
      onUploadDoneRef.current?.();
    });

    EventsOn("youtube:error", (data: { path: string; message: string }) => {
      const updated = queueRef.current.map((item) =>
        item.videoPath === data.path
          ? { ...item, status: "error" as const, error: data.message }
          : item
      );
      onUpdateQueue(updated);
      SetTrayUploadProgress(-1).catch(() => {});
      processQueue(updated);
    });

    return () => { EventsOff("youtube:progress", "youtube:done", "youtube:error"); };
  }, []);

  const MAX_CONCURRENT_UPLOADS = 3;

  const processQueue = (currentQueue: QueueItem[]) => {
    if (!runningRef.current) return;
    
    const uploadingCount = currentQueue.filter(i => i.status === "uploading").length;
    
    if (uploadingCount >= MAX_CONCURRENT_UPLOADS) return;

    const pendingItems = currentQueue.filter(i => i.status === "pending");
    if (pendingItems.length === 0 && uploadingCount === 0) {
      onSetRunning(false);
      return;
    }

    const slotsAvailable = MAX_CONCURRENT_UPLOADS - uploadingCount;
    const itemsToStart = pendingItems.slice(0, slotsAvailable);

    if (itemsToStart.length === 0) return;

    // Marcamos localmente como 'uploading' para no volver a iniciarlos
    const updatedQueue = [...currentQueue];
    itemsToStart.forEach(item => {
      const idx = updatedQueue.findIndex(i => i.id === item.id);
      if (idx !== -1) updatedQueue[idx] = { ...updatedQueue[idx], status: "uploading" };
      UploadToYouTube(item.videoPath, item.title, item.description, item.privacy, item.playlistId || "", item.gameTag || "", item.episode || 0).catch(() => {});
    });

    onUpdateQueue(updatedQueue);
  };

  const handleStart = () => {
    onSetRunning(true);
    runningRef.current = true;
    // Usar el estado más reciente
    processQueue(queue);
  };

  const handlePause = () => {
    onSetRunning(false);
    runningRef.current = false;
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newQueue = [...queue];
    [newQueue[index - 1], newQueue[index]] = [newQueue[index], newQueue[index - 1]];
    onUpdateQueue(newQueue);
  };

  const handleMoveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const newQueue = [...queue];
    [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
    onUpdateQueue(newQueue);
  };

  const handleRemove = (id: string) => {
    onUpdateQueue(queue.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleCancelUpload = async (id: string, path: string) => {
    try {
      await CancelUpload(path);
      // The backend will emit youtube:error with "Upload cancelled", which will
      // update the state in our youtube:error event handler automatically.
    } catch (e) {
      console.error("Failed to cancel upload:", e);
    }
  };

  const handleClear = () => {
    onUpdateQueue(queue.filter((i) => i.status === "uploading"));
    setEditingId(null);
  };

  const handleSaveEdit = (id: string, patch: Partial<QueueItem>) => {
    onUpdateQueue(queue.map((i) => i.id === id ? { ...i, ...patch } : i));
    setEditingId(null);
  };

  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const doneCount = queue.filter((i) => i.status === "done").length;

  return (
    <div className={`fixed bottom-4 right-4 w-[360px] bg-card border border-border-medium rounded-md shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex flex-col z-[100] transform transition-all duration-300 ${open ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-[120%] opacity-0 pointer-events-none"}`}>
      {/* Queue header */}
      <div className="flex items-center justify-between p-3 border-b border-border-subtle bg-surface">
        <div className="flex items-center gap-2 text-accent">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
          <span className="text-sm font-bold flex items-center gap-2">
            Upload Queue
            {queue.length > 0 && (
              <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-[10px]">{queue.length}</span>
            )}
          </span>
          {doneCount > 0 && (
            <span className="text-[10px] text-green-400 font-medium ml-1">{doneCount} done</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && !running && (
            <button className="btn btn-primary btn-sm" onClick={handleStart}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start ({pendingCount})
            </button>
          )}
          {running && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-accent font-semibold flex items-center gap-1 bg-accent-dim px-2 py-0.5 rounded-[10px]">
                Uploading...
              </span>
              <button className="btn btn-ghost btn-sm text-yellow-400 hover:text-yellow-300" onClick={handlePause}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Pause Queue
              </button>
            </div>
          )}
          {queue.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClear} title="Clear completed/errored">
              Clear
            </button>
          )}
          <button className="p-1 bg-transparent border-none text-text-secondary cursor-pointer rounded-sm hover:bg-black/10 hover:text-text-primary transition-colors flex items-center justify-center" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Queue items */}
      <div className="flex flex-col p-2 gap-2 max-h-[50vh] overflow-y-auto bg-base">
        {queue.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-muted">
            <p>No videos in queue</p>
            <p className="text-[10px] mt-1 opacity-70">Click "Add to Queue" on any video to add it here</p>
          </div>
        ) : (
          queue.map((item, index) => (
            <div
              key={item.id}
              className={`flex flex-col p-2.5 bg-elevated border rounded-sm ${
                item.status === "uploading"
                  ? "border-accent bg-accent/5"
                  : item.status === "done"
                  ? "border-green-500/30 bg-green-500/5"
                  : item.status === "error"
                  ? "border-red-500/30 bg-red-500/5"
                  : editingId === item.id
                  ? "border-accent/30"
                  : "border-border-subtle"
              }`}
            >
              {/* Item row */}
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">{statusIcon[item.status]}</div>

                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-xs font-semibold text-text-primary truncate" title={item.title}>
                    {item.title || formatName(item.videoName)}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted truncate" title={item.videoName}>{item.videoName}</span>
                  <div className="flex items-center gap-2 flex-wrap text-[10px] mt-0.5">
                    <span className="font-bold text-text-secondary">{item.privacy}</span>
                    {item.status === "uploading" && (
                      <span className="text-accent font-semibold">{item.progress}%</span>
                    )}
                    {item.status === "done" && item.url && (
                      <a className="text-accent hover:underline truncate max-w-[150px]" href={item.url} target="_blank" rel="noreferrer" title={item.url}>
                        {item.url}
                      </a>
                    )}
                    {item.status === "error" && (
                      <span className="text-red-400 truncate max-w-[150px]" title={item.error}>{item.error}</span>
                    )}
                  </div>

                  {item.status === "uploading" && (
                    <div className="h-1 bg-black/40 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-accent transition-all duration-300" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                  {item.status === "done" && (
                    <div className="h-1 bg-black/40 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-green-400 transition-all duration-300" style={{ width: "100%" }} />
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-start gap-1 shrink-0">
                  {/* Reorder Up */}
                  {item.status === "pending" && (
                    <button
                      className={`p-0.5 w-5 h-5 bg-transparent border-none text-text-secondary cursor-pointer rounded-sm transition-colors flex items-center justify-center ${index === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-black/10 hover:text-text-primary"}`}
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      title="Move Up"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 14l5-5 5 5z" />
                      </svg>
                    </button>
                  )}
                  {/* Reorder Down */}
                  {item.status === "pending" && (
                    <button
                      className={`p-0.5 w-5 h-5 bg-transparent border-none text-text-secondary cursor-pointer rounded-sm transition-colors flex items-center justify-center ${index === queue.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-black/10 hover:text-text-primary"}`}
                      onClick={() => handleMoveDown(index)}
                      disabled={index === queue.length - 1}
                      title="Move Down"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                      </svg>
                    </button>
                  )}
                  {/* Edit — only for pending */}
                  {item.status === "pending" && (
                    <button
                      className={`p-0.5 w-5 h-5 bg-transparent border-none cursor-pointer rounded-sm transition-colors flex items-center justify-center ${
                        editingId === item.id
                          ? "text-accent"
                          : "text-text-secondary hover:bg-black/10 hover:text-text-primary"
                      }`}
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                      title={editingId === item.id ? "Close editor" : "Edit metadata"}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                      </svg>
                    </button>
                  )}
                  {/* Cancel Upload */}
                  {item.status === "uploading" && (
                    <button
                      className="p-0.5 w-5 h-5 bg-transparent border-none text-red-400/80 cursor-pointer rounded-sm hover:bg-red-500/20 hover:text-red-400 transition-colors flex items-center justify-center"
                      onClick={() => handleCancelUpload(item.id, item.videoPath)}
                      title="Cancel Upload"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  )}
                  {/* Remove */}
                  {item.status !== "uploading" && (
                    <button
                      className="p-0.5 w-5 h-5 bg-transparent border-none text-text-secondary cursor-pointer rounded-sm hover:bg-black/10 hover:text-text-primary transition-colors flex items-center justify-center"
                      onClick={() => handleRemove(item.id)}
                      title="Remove"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Inline edit form */}
              {editingId === item.id && (
                <EditForm
                  item={item}
                  onSave={(patch) => handleSaveEdit(item.id, patch)}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
