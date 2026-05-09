import { useState, useEffect } from "react";
import {
  SaveYouTubeCredentials,
  IsYouTubeAuthed,
  StartYouTubeAuth,
} from "../../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState("");

  // Check auth state when panel opens
  useEffect(() => {
    if (!open) return;
    IsYouTubeAuthed().then(setAuthed).catch(() => {});
  }, [open]);

  // Listen for OAuth completion event from Go
  useEffect(() => {
    EventsOn("youtube:auth-complete", () => {
      setAuthed(true);
      setConnecting(false);
    });
    return () => { EventsOff("youtube:auth-complete"); };
  }, []);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Both Client ID and Client Secret are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await SaveYouTubeCredentials(clientId.trim(), clientSecret.trim());
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      await StartYouTubeAuth();
      // auth-complete event will update state
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setConnecting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && <div className="panel-backdrop" onClick={onClose} />}

      {/* Slide-in panel */}
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
          {/* YouTube section */}
          <section className="settings-section">
            <div className="settings-section-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#ff4444" }}>
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-2.75 12.12 12.12 0 01-.9-1.94 1.12 1.12 0 00-1.09-.75 1.11 1.11 0 00-1.09.75 12.12 12.12 0 01-.9 1.94A4.83 4.83 0 018.07 6.69 1.12 1.12 0 007 7.78a1.11 1.11 0 00.94 1.09 12 12 0 011.94.9A4.83 4.83 0 0112.63 13a1.11 1.11 0 001.09.75 1.12 1.12 0 001.09-.75 4.83 4.83 0 012.75-3.23 12 12 0 011.94-.9A1.11 1.11 0 0020.59 7.78a1.12 1.12 0 00-1-.09zM12 15a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3z" />
              </svg>
              YouTube Integration
            </div>

            {authed ? (
              <div className="settings-connected">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                Connected to YouTube
              </div>
            ) : (
              <p className="settings-hint">Paste your Google OAuth credentials below, then click Connect.</p>
            )}

            <div className="settings-field">
              <label className="settings-label">Client ID</label>
              <input
                className="settings-input"
                type="text"
                placeholder="*.apps.googleusercontent.com"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>

            <div className="settings-field">
              <label className="settings-label">Client Secret</label>
              <input
                className="settings-input"
                type="password"
                placeholder="GOCSPX-..."
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>

            {error && <p className="settings-error">{error}</p>}

            <div className="settings-actions">
              <button
                className="btn btn-ghost"
                onClick={handleSaveCredentials}
                disabled={saving}
              >
                {savedOk ? "Saved ✓" : saving ? "Saving..." : "Save credentials"}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConnect}
                disabled={connecting || (!clientId && !authed)}
                title={authed ? "Re-authorize YouTube" : "Open browser to authorize"}
              >
                {connecting ? "Waiting for browser..." : authed ? "Re-connect" : "Connect YouTube"}
              </button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
