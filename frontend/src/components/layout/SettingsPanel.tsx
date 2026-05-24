import { useState, useEffect } from "react";
import { IsYouTubeAuthed, StartYouTubeAuth, LoadConfig, GetYouTubeChannelInfo, GetAutoLaunch, SetAutoLaunch, GetWatchFolderEnabled, SetWatchFolderEnabled } from "../../../wailsjs/go/backend/App";
import { EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime";

interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [authed, setAuthed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [credsLoaded, setCredsLoaded] = useState(true);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<YouTubeChannel | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchSaving, setAutoLaunchSaving] = useState(false);
  const [watchFolder, setWatchFolder] = useState(false);
  const [watchFolderSaving, setWatchFolderSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    IsYouTubeAuthed().then(async isAuthed => {
      setAuthed(isAuthed);
      if (isAuthed) {
        try {
          const info = await GetYouTubeChannelInfo();
          setChannel(info);
        } catch (e) {
          console.error("Failed to get channel info:", e);
        }
      }
    }).catch(() => {});
    LoadConfig().then(cfg => {
      setCredsLoaded(!!cfg.youtube_client_id);
    }).catch(() => setCredsLoaded(false));
    // Load auto-launch state
    GetAutoLaunch().then(setAutoLaunch).catch(() => {});
    // Load watch-folder state
    GetWatchFolderEnabled().then(setWatchFolder).catch(() => {});
  }, [open]);

  useEffect(() => {
    EventsOn("youtube:auth-complete", async () => {
      setAuthed(true);
      setConnecting(false);
      try {
        const info = await GetYouTubeChannelInfo();
        setChannel(info);
      } catch {}
    });
    return () => { EventsOff("youtube:auth-complete"); };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      await StartYouTubeAuth();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setConnecting(false);
    }
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />}

      <aside className={`fixed top-0 right-0 h-full w-[380px] max-w-[90vw] bg-surface border-l border-border-subtle shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-50 transform transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
          <span className="text-base font-semibold text-text-primary">Settings</span>
          <button className="bg-transparent border-none text-text-secondary cursor-pointer p-1 rounded-sm hover:text-text-primary hover:bg-elevated transition-colors" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          <section className="flex flex-col gap-4">
            <div className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2 border-b border-border-subtle pb-2 mb-2">
              {/* YouTube icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ff4444">
                <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16.8 5 12 5 12 5s-4.8 0-7 .1c-.4.1-1.3.1-2 .9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.2.8C6.8 19 12 19 12 19s4.8 0 7-.2c.4-.1 1.3-.1 2-.8.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.8 14.5V9l5.4 2.8-5.4 2.7z" />
              </svg>
              YouTube Account
            </div>

            {!credsLoaded && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-xs mt-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <span>App credentials missing in .env</span>
              </div>
            )}

            {authed ? (
              <div className="flex items-center justify-between gap-3 p-3 bg-elevated border border-border-subtle rounded-md">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#4ade80", flexShrink: 0 }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  <div className="flex items-center gap-2.5">
                    {channel?.thumbnail && (
                      <img src={channel.thumbnail} alt={channel.title} className="w-7 h-7 rounded-full object-cover" />
                    )}
                    <div>
                      <p className="font-medium text-xs text-text-primary mb-0.5">{channel?.title || "Connected"}</p>
                      <p className="text-[10px] text-text-secondary">Your YouTube account is linked.</p>
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting ? "Opening browser..." : "Switch account"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-4 bg-elevated border border-border-subtle rounded-md items-start">
                <p className="text-xs text-text-secondary leading-relaxed">
                  Connect your YouTube account to upload videos directly from Amon Hen.
                </p>
                <button
                  className="flex items-center gap-2 py-2 px-3 bg-white text-black font-semibold text-xs rounded-sm border border-transparent cursor-pointer hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16.8 5 12 5 12 5s-4.8 0-7 .1c-.4.1-1.3.1-2 .9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.2.8C6.8 19 12 19 12 19s4.8 0 7-.2c.4-.1 1.3-.1 2-.8.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.8 14.5V9l5.4 2.8-5.4 2.7z" />
                  </svg>
                  {connecting ? "Waiting for browser..." : "Sign in with Google"}
                </button>
              </div>
            )}

            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </section>

          {/* Auto-launch section */}
          <section className="flex flex-col gap-4">
            <div className="text-xs font-semibold text-text-primary flex items-center gap-2 border-b border-border-subtle pb-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted">
                <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
              </svg>
              Startup
            </div>
            <div className="flex items-center justify-between gap-3 p-3 bg-elevated border border-border-subtle rounded-md">
              <div>
                <p className="text-xs font-medium text-text-primary">Launch on Windows startup</p>
                <p className="text-[10px] text-text-secondary mt-0.5">Start Amon-Hen automatically when you log in</p>
              </div>
              <button
                role="switch"
                aria-checked={autoLaunch}
                disabled={autoLaunchSaving}
                onClick={async () => {
                  setAutoLaunchSaving(true);
                  try {
                    await SetAutoLaunch(!autoLaunch);
                    setAutoLaunch(v => !v);
                  } catch (e) {
                    console.error("Failed to set auto-launch:", e);
                  } finally {
                    setAutoLaunchSaving(false);
                  }
                }}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 border flex-shrink-0 cursor-pointer ${
                  autoLaunch
                    ? "bg-accent border-accent/60"
                    : "bg-elevated border-border-medium"
                } ${autoLaunchSaving ? "opacity-50 cursor-wait" : ""}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    autoLaunch ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Watch folder toggle */}
            <div className="flex items-center justify-between gap-3 p-3 bg-elevated border border-border-subtle rounded-md">
              <div>
                <p className="text-xs font-medium text-text-primary">Watch folders for new videos</p>
                <p className="text-[10px] text-text-secondary mt-0.5">Auto-refresh library when new video files are detected</p>
              </div>
              <button
                role="switch"
                aria-checked={watchFolder}
                disabled={watchFolderSaving}
                onClick={async () => {
                  setWatchFolderSaving(true);
                  try {
                    await SetWatchFolderEnabled(!watchFolder);
                    setWatchFolder(v => !v);
                  } catch (e) {
                    console.error("Failed to set watch folder:", e);
                  } finally {
                    setWatchFolderSaving(false);
                  }
                }}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 border flex-shrink-0 cursor-pointer ${
                  watchFolder
                    ? "bg-accent border-accent/60"
                    : "bg-elevated border-border-medium"
                } ${watchFolderSaving ? "opacity-50 cursor-wait" : ""}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    watchFolder ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
