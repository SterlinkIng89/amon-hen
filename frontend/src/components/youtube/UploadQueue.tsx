import { useEffect, useRef } from "react";
import { EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime";
import { UploadToYouTube } from "../../../wailsjs/go/main/App";
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

export default function UploadQueue({ open, queue, running, onClose, onUpdateQueue, onSetRunning }: Props) {
  // Keep a ref so event callbacks always see fresh queue
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const runningRef = useRef(running);
  runningRef.current = running;

  // Listen to YouTube progress/done/error events
  useEffect(() => {
    EventsOn("youtube:progress", (data: { path: string; percent: number }) => {
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
      // Move to next item
      processNext(updated);
    });

    EventsOn("youtube:error", (data: { path: string; message: string }) => {
      const updated = queueRef.current.map((item) =>
        item.videoPath === data.path
          ? { ...item, status: "error" as const, error: data.message }
          : item
      );
      onUpdateQueue(updated);
      processNext(updated);
    });

    return () => { EventsOff("youtube:progress", "youtube:done", "youtube:error"); };
  }, []);

  const processNext = (currentQueue: QueueItem[]) => {
    const next = currentQueue.find((i) => i.status === "pending");
    if (!next) {
      onSetRunning(false);
      return;
    }
    UploadToYouTube(next.videoPath, next.title, next.description, next.privacy).catch(() => {});
  };

  const handleStart = () => {
    const first = queue.find((i) => i.status === "pending");
    if (!first) return;
    onSetRunning(true);
    UploadToYouTube(first.videoPath, first.title, first.description, first.privacy).catch(() => {});
  };

  const handleRemove = (id: string) => {
    onUpdateQueue(queue.filter((i) => i.id !== id));
  };

  const handleClear = () => {
    onUpdateQueue(queue.filter((i) => i.status === "uploading"));
  };

  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const doneCount = queue.filter((i) => i.status === "done").length;

  return (
    <div className={`upload-queue ${open ? "upload-queue--open" : ""}`}>
      {/* Queue header */}
      <div className="queue-header">
        <div className="queue-header-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
          <span className="queue-title">
            Upload Queue
            {queue.length > 0 && (
              <span className="queue-badge">{queue.length}</span>
            )}
          </span>
          {doneCount > 0 && (
            <span className="queue-done-count">{doneCount} done</span>
          )}
        </div>
        <div className="queue-header-right">
          {pendingCount > 0 && !running && (
            <button className="btn btn-primary btn-sm" onClick={handleStart}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start ({pendingCount})
            </button>
          )}
          {running && (
            <span className="queue-running-badge">Uploading...</span>
          )}
          {queue.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClear} title="Clear completed/errored">
              Clear
            </button>
          )}
          <button className="icon-btn" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Queue items */}
      <div className="queue-list">
        {queue.length === 0 ? (
          <div className="queue-empty">
            <p>No videos in queue</p>
            <p className="queue-empty-hint">Click "Add to Queue" on any video to add it here</p>
          </div>
        ) : (
          queue.map((item) => (
            <div key={item.id} className={`queue-item queue-item--${item.status}`}>
              <div className="queue-item-icon">{statusIcon[item.status]}</div>

              <div className="queue-item-info">
                <span className="queue-item-name" title={item.title}>
                  {item.title || formatName(item.videoName)}
                </span>
                <span className="queue-item-filename" title={item.videoName}>{item.videoName}</span>
                <div className="queue-item-meta">
                  <span className="queue-privacy-badge">{item.privacy}</span>
                  {item.status === "uploading" && (
                    <span className="queue-progress-text">{item.progress}%</span>
                  )}
                  {item.status === "done" && item.url && (
                    <a className="queue-yt-link" href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                  )}
                  {item.status === "error" && (
                    <span className="queue-error-text">{item.error}</span>
                  )}
                </div>

                {item.status === "uploading" && (
                  <div className="queue-progress-bar">
                    <div
                      className="queue-progress-fill"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.status === "done" && (
                  <div className="queue-progress-bar">
                    <div className="queue-progress-fill queue-progress-fill--done" style={{ width: "100%" }} />
                  </div>
                )}
              </div>

              {item.status !== "uploading" && (
                <button
                  className="icon-btn icon-btn--sm"
                  onClick={() => handleRemove(item.id)}
                  title="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
