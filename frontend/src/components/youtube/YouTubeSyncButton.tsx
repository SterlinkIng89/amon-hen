import { useState, useEffect, useRef, useCallback } from "react";
import {
  SyncRecentVideos,
  SyncChannelData,
} from "../../../wailsjs/go/backend/App";
import { EventsOn } from "../../../wailsjs/runtime/runtime";

export interface YouTubeSyncButtonProps {
  readonly onSyncComplete?: () => void;
  readonly className?: string;
}

interface SyncProgressPayload {
  readonly count?: number;
  readonly total?: number;
  readonly stage?: string;
  readonly message?: string;
}

export default function YouTubeSyncButton({
  onSyncComplete,
  className = "",
}: YouTubeSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeSyncType, setActiveSyncType] = useState<"light" | "full" | null>(
    null,
  );
  const [syncStatus, setSyncStatus] = useState("");
  const [showSyncMenu, setShowSyncMenu] = useState(false);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current !== null) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearStatusTimer();
  }, [clearStatusTimer]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        syncMenuRef.current &&
        !syncMenuRef.current.contains(e.target as Node)
      ) {
        setShowSyncMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const unsub1 = EventsOn(
      "youtube:sync-progress",
      (data: string | SyncProgressPayload) => {
        clearStatusTimer();
        setIsSyncing(true);
        if (typeof data === "string") {
          setSyncStatus(data);
        } else if (data && typeof data === "object") {
          if (
            data.stage &&
            data.count !== undefined &&
            data.total !== undefined
          ) {
            setSyncStatus(
              `Syncing: ${data.stage} (${data.count}/${data.total})`,
            );
          } else if (data.stage) {
            setSyncStatus(data.stage);
          } else if (data.message) {
            setSyncStatus(data.message);
          } else {
            setSyncStatus("Syncing...");
          }
        }
      },
    );

    const unsub2 = EventsOn("youtube:sync-done", () => {
      clearStatusTimer();
      setIsSyncing(false);
      setActiveSyncType(null);
      setSyncStatus("Sync complete!");
      statusTimerRef.current = setTimeout(() => {
        setSyncStatus("");
        statusTimerRef.current = null;
      }, 3000);
      onSyncComplete?.();
    });

    const unsub3 = EventsOn("youtube:done", () => {
      clearStatusTimer();
      setIsSyncing(false);
      setActiveSyncType(null);
      onSyncComplete?.();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [onSyncComplete, clearStatusTimer]);

  const runSync = useCallback(
    async (
      type: "light" | "full",
      statusLabel: string,
      syncFn: () => Promise<unknown>,
      errorLabel: string,
    ) => {
      if (isSyncing) return;
      clearStatusTimer();
      setShowSyncMenu(false);
      setIsSyncing(true);
      setActiveSyncType(type);
      setSyncStatus(statusLabel);
      try {
        await syncFn();
      } catch (e) {
        console.error(errorLabel, e);
        setSyncStatus("Sync failed");
        statusTimerRef.current = setTimeout(() => {
          setSyncStatus("");
          statusTimerRef.current = null;
        }, 3000);
      } finally {
        setIsSyncing(false);
        setActiveSyncType(null);
      }
    },
    [isSyncing, clearStatusTimer],
  );

  const handleSyncLight = () =>
    runSync(
      "light",
      "Quick sync — last 20 videos...",
      () => SyncRecentVideos(20),
      "Light sync failed:",
    );

  const handleSyncFull = () =>
    runSync(
      "full",
      "Full sync — fetching entire channel...",
      () => SyncChannelData(),
      "Full sync failed:",
    );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {syncStatus && (
        <span
          className={`text-[10px] font-bold ${
            isSyncing ? "text-accent animate-pulse" : "text-green-500"
          } max-w-[140px] truncate`}
        >
          {syncStatus}
        </span>
      )}

      <div ref={syncMenuRef} className="relative flex items-center">
        <button
          type="button"
          onClick={handleSyncLight}
          disabled={isSyncing}
          className={`flex items-center gap-1 pl-2 pr-1.5 py-1.5 rounded-l-lg border-y border-l transition-all group active:scale-95 ${
            isSyncing
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-elevated/50 text-text-secondary hover:text-text-primary hover:bg-elevated border-border-subtle"
          } disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`}
          title={
            isSyncing
              ? activeSyncType === "full"
                ? "Full sync in progress..."
                : "Light sync in progress..."
              : "Light sync — fetch recent 20 videos"
          }
        >
          <svg
            className={`${
              isSyncing
                ? "animate-spin"
                : "group-hover:rotate-180 transition-transform duration-500"
            }`}
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span className="text-[10px] font-bold">
            {isSyncing && activeSyncType === "full" ? "Full" : "Light"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowSyncMenu((v) => !v)}
          disabled={isSyncing}
          className={`flex items-center justify-center px-1 py-1.5 rounded-r-lg border transition-all ${
            isSyncing
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-elevated/50 text-text-secondary hover:text-text-primary hover:bg-elevated border-border-subtle"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title="More sync options"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showSyncMenu && (
          <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] bg-surface border border-border-subtle rounded-xl shadow-2xl overflow-hidden animate-slideDown">
            <button
              type="button"
              onClick={handleSyncLight}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-elevated/60 transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-accent"
                >
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">
                  Light sync
                </p>
                <p className="text-[10px] text-text-muted">
                  Recent 20 videos only
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleSyncFull}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-elevated/60 transition-colors group border-t border-border-subtle/50"
            >
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-accent"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">
                  Full sync
                </p>
                <p className="text-[10px] text-text-muted">
                  Entire channel history
                </p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
