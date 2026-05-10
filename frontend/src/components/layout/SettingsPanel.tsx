import { useState, useEffect } from "react";
import { IsYouTubeAuthed, StartYouTubeAuth, LoadConfig, GetYouTubeChannelInfo } from "../../../wailsjs/go/main/App";
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
  const [credsLoaded, setCredsLoaded] = useState(true); // Assume loaded by default
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<YouTubeChannel | null>(null);

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
    // Check if client_id exists in config
    LoadConfig().then(cfg => {
      setCredsLoaded(!!cfg.youtube_client_id);
    }).catch(() => setCredsLoaded(false));
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
      {open && <div className="panel-backdrop" onClick={onClose} />}

      <aside className={`settings-panel ${open ? "settings-panel--open" : ""}`}>
        <div className="settings-panel-header">
          <span className="settings-panel-title">Settings</span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="settings-panel-body">
          <section className="settings-section">
            <div className="settings-section-header">
              {/* YouTube icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ff4444">
                <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16.8 5 12 5 12 5s-4.8 0-7 .1c-.4.1-1.3.1-2 .9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.2.8C6.8 19 12 19 12 19s4.8 0 7-.2c.4-.1 1.3-.1 2-.8.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.8 14.5V9l5.4 2.8-5.4 2.7z" />
              </svg>
              YouTube Account
            </div>

            {!credsLoaded && (
              <div className="settings-error-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <span>App credentials missing in .env</span>
              </div>
            )}

            {authed ? (
              <div className="yt-connected-card">
                <div className="yt-connected-status">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#4ade80", flexShrink: 0 }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  <div className="yt-channel-info">
                    {channel?.thumbnail && (
                      <img src={channel.thumbnail} alt={channel.title} className="yt-channel-thumb" />
                    )}
                    <div>
                      <p className="yt-connected-label">{channel?.title || "Connected"}</p>
                      <p className="yt-connected-sub">Your YouTube account is linked.</p>
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
              <div className="yt-connect-card">
                <p className="yt-connect-desc">
                  Connect your YouTube account to upload videos directly from Amon Hen.
                </p>
                <button
                  className="btn btn-yt"
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

            {error && <p className="settings-error">{error}</p>}
          </section>
        </div>
      </aside>
    </>
  );
}
