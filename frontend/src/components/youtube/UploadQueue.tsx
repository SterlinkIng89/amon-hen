/**
 * UploadQueue — Logic-only component (no UI rendered).
 *
 * Listens to backend WebSocket events (youtube:progress, youtube:done, youtube:error)
 * and drives the queue state. The actual queue UI lives in pages/QueuePage.tsx.
 */
import { useEffect, useRef } from "react";
import { EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime";
import {
 UploadToYouTube,
 ShowUploadNotification,
 SetTrayUploadProgress,
 CancelUpload,
 LogFrontendEvent,
} from "../../../wailsjs/go/backend/App";

export interface QueueItem {
 id: string;
 videoPath: string;
 videoName: string;
 size: number;
 title: string;
 description: string;
 privacy: "public" | "unlisted" | "private";
 status: "pending" | "uploading" | "processing" | "done" | "error";
 progress: number;
 playlistId?: string;
 gameTag?: string;
 episode?: number;
 error?: string;
 url?: string;
 uploadSpeed?: number;
 startedAt?: number; // ms timestamp when upload began
 completedAt?: number; // ms timestamp when upload finished
}

interface Props {
 queue: QueueItem[];
 running: boolean;
 onUpdateQueue: (queue: QueueItem[]) => void;
 onSetRunning: (r: boolean) => void;
 onUploadDone?: () => void;
 /** Called when processQueue needs to start new uploads */
 onStartUpload?: (item: QueueItem) => void;
}

const MAX_CONCURRENT_UPLOADS = 3;

export default function UploadQueue({
 queue,
 running,
 onUpdateQueue,
 onSetRunning,
 onUploadDone,
}: Props) {
 const queueRef = useRef(queue);
 queueRef.current = queue;
 const runningRef = useRef(running);
 runningRef.current = running;
 const onUploadDoneRef = useRef(onUploadDone);
 onUploadDoneRef.current = onUploadDone;

 const processQueue = (currentQueue: QueueItem[]) => {
 if (!runningRef.current) return;

 const uploadingCount = currentQueue.filter(i => i.status === "uploading").length;
 if (uploadingCount >= MAX_CONCURRENT_UPLOADS) return;

 const pendingItems = currentQueue.filter(i => i.status === "pending");
 if (pendingItems.length === 0 && uploadingCount === 0) {
 // If we were running, log that we finished
 if (runningRef.current) {
 LogFrontendEvent("[Queue] Queue completely finished. All uploads done.");
 }
 onSetRunning(false);
 return;
 }

 const slotsAvailable = MAX_CONCURRENT_UPLOADS - uploadingCount;
 const itemsToStart = pendingItems.slice(0, slotsAvailable);
 if (itemsToStart.length === 0) return;

 const updatedQueue = [...currentQueue];
 itemsToStart.forEach(item => {
 const idx = updatedQueue.findIndex(i => i.id === item.id);
 if (idx !== -1) {
 updatedQueue[idx] = { ...updatedQueue[idx], status: "uploading", startedAt: Date.now() };
 LogFrontendEvent(`[Queue] Initiating upload for: '${item.title}'`);
 }
 UploadToYouTube(
 item.videoPath, item.title, item.description, item.privacy,
 item.playlistId || "", item.gameTag || "", item.episode || 0,
 ).catch(() => {});
 });

 onUpdateQueue(updatedQueue);
 };

 // Expose processQueue so Dashboard can call it on Start
 (UploadQueue as any).__processQueue = processQueue;

 useEffect(() => {
 const unsub1 = EventsOn("youtube:progress", (data: { path: string; percent: number; speed?: number }) => {
 SetTrayUploadProgress(data.percent).catch(() => {});
 onUpdateQueue(
 queueRef.current.map(item =>
 item.videoPath === data.path
 ? { ...item, status: "uploading", progress: data.percent, uploadSpeed: data.speed }
 : item,
 ),
 );
 });

 const unsub2 = EventsOn("youtube:done", (data: { path: string; url: string }) => {
 const updated = queueRef.current.map(item =>
 item.videoPath === data.path
 ? { ...item, status: "done" as const, progress: 100, url: data.url, completedAt: Date.now() }
 : item,
 );
 onUpdateQueue(updated);
 SetTrayUploadProgress(-1).catch(() => {});
 const doneItem = queueRef.current.find(i => i.videoPath === data.path);
 const videoTitle = doneItem?.title || doneItem?.videoName || "Video";
 ShowUploadNotification("Upload complete!", videoTitle).catch(() => {});

 // Notify parent immediately so it can trigger a YT refresh per-video
 onUploadDoneRef.current?.();

 // Check if the full batch is now complete (no more uploading or pending)
 const stillActive = updated.filter(i => i.status === "uploading" || i.status === "pending").length;
 if (stillActive === 0) {
 LogFrontendEvent(`[Queue] Queue completely finished after '${videoTitle}'.`);
 onSetRunning(false);
 } else {
 LogFrontendEvent(`[Queue] Videos remaining in queue: ${stillActive}`);
 processQueue(updated);
 }
 });

 const unsub3 = EventsOn("youtube:error", (data: { path: string; message: string }) => {
 const updated = queueRef.current.map(item =>
 item.videoPath === data.path
 ? { ...item, status: "error" as const, error: data.message }
 : item,
 );
 onUpdateQueue(updated);
 SetTrayUploadProgress(-1).catch(() => {});

 // Check if the full batch is now complete
 const stillActive = updated.filter(i => i.status === "uploading" || i.status === "pending").length;
 if (stillActive === 0) {
 LogFrontendEvent("[Queue] Queue completely finished with errors on last item.");
 onSetRunning(false);
 } else {
 LogFrontendEvent(`[Queue] Videos remaining in queue: ${stillActive}`);
 processQueue(updated);
 }
 });

 return () => {
 unsub1();
 unsub2();
 unsub3();
 };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Track manual start/stop of the queue via the running prop
 useEffect(() => {
 if (running) {
 LogFrontendEvent(`[Queue] Queue started manually (Total items: ${queueRef.current.length})`);
 } else if (!running && runningRef.current) {
 LogFrontendEvent("[Queue] Queue paused or stopped manually");
 }
 }, [running]);

 // This component renders nothing — it's purely a logic/event driver
 return null;
}

// Re-export processQueue trigger so Dashboard can call it
export function triggerProcessQueue(queue: QueueItem[]) {
 const fn = (UploadQueue as any).__processQueue;
 if (fn) fn(queue);
}
