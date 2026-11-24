import { useState, useEffect, useRef, useCallback } from "react";
import {
  GetVideosFromFolders,
  GetExportedVideos,
  AddFolder,
  RemoveFolder,
  LoadConfig,
  SaveFolders,
} from "../../wailsjs/go/backend/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { useToast } from "../components/ui/ToastContainer";
import { VideoFile } from "../types";

export const EXPORTS_UPDATED_EVENT = "amonhen:exports-updated";

export function useVideoLibrary() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolders, setActiveFolders] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportedPendingPaths, setExportedPendingPaths] = useState<Set<string>>(
    () => new Set(),
  );

  const dragCounterRef = useRef(0);
  const { addToast } = useToast();

  const refreshExportedPending = useCallback(async () => {
    try {
      const records = await GetExportedVideos("exported");
      const next = new Set<string>();
      for (const rec of records ?? []) {
        if (rec.status === "exported" && rec.sourcePath) {
          next.add(rec.sourcePath);
        }
      }
      setExportedPendingPaths(next);
    } catch {
      // Non-fatal: manifest may be unavailable before DB init or in isolated tests
    }
  }, []);

  const scanFolders = useCallback(async (foldersToScan: string[]): Promise<VideoFile[]> => {
    if (foldersToScan.length === 0) return [];
    setScanning(true);
    setError("");
    try {
      const [result] = await Promise.all([
        GetVideosFromFolders(foldersToScan),
        refreshExportedPending(),
      ]);
      const list = result ?? [];
      setVideos(list);
      if (list.length === 0)
        setError("No videos found in the selected folders.");
      return list;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Scan failed: ${msg}`);
      return [];
    } finally {
      setScanning(false);
    }
  }, [refreshExportedPending]);

  // Load config and start scanning on mount
  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        const savedFolders = cfg.folders ?? [];
        if (savedFolders.length > 0) {
          setFolders(savedFolders);
          scanFolders(savedFolders);
        } else {
          refreshExportedPending();
        }
      })
      .catch(console.error);

    // Listen for new files detected by the folder watcher
    const unsubFilesNew = EventsOn("files:new", (_path: string) => {
      setFolders((currentFolders) => {
        scanFolders(currentFolders);
        return currentFolders;
      });
      addToast("New video detected — library updated.", "success");
    });

    const unsubSyncDone = EventsOn("youtube:sync-done", refreshExportedPending);

    window.addEventListener(EXPORTS_UPDATED_EVENT, refreshExportedPending);

    return () => {
      unsubFilesNew();
      unsubSyncDone();
      window.removeEventListener(EXPORTS_UPDATED_EVENT, refreshExportedPending);
    };
  }, [refreshExportedPending, scanFolders]);

  // Drag & drop folder support
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCounterRef.current += 1;
      setIsDraggingOver(true);
    };
    const onDragLeave = () => {
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      const items = Array.from(e.dataTransfer?.items ?? []);
      const dirs: string[] = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          const file = item.getAsFile();
          if (file) {
            // @ts-ignore — Wails exposes the real FS path
            const p: string = file.path ?? "";
            if (p) dirs.push(p);
          }
        }
      }
      if (dirs.length === 0) return;
      const updated = [...folders];
      for (const d of dirs) {
        if (!updated.includes(d)) updated.push(d);
      }
      await SaveFolders(updated);
      setFolders(updated);
      await scanFolders(updated);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [folders]);

  const handleAddFolder = async () => {
    try {
      const dir = await AddFolder();
      if (!dir) return;
      const updated = folders.includes(dir) ? folders : [...folders, dir];
      setFolders(updated);
      await scanFolders(updated);
    } catch {
      setError("Failed to add folder.");
    }
  };

  const handleRemoveFolder = async (path: string) => {
    await RemoveFolder(path);
    const updated = folders.filter((f) => f !== path);
    setFolders(updated);
    setActiveFolders((a) => a.filter((f) => f !== path));
    await scanFolders(updated);
  };

  const handleRescan = () => scanFolders(folders);

  const toggleFolder = (path: string) => {
    setActiveFolders((prev) =>
      prev.includes(path) ? prev.filter((f) => f !== path) : [...prev, path],
    );
  };

  return {
    videos,
    folders,
    activeFolders,
    scanning,
    error,
    isDraggingOver,
    exportedPendingPaths,
    refreshExportedPending,
    handleAddFolder,
    handleRemoveFolder,
    handleRescan,
    toggleFolder,
  };
}
