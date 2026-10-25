import { useState } from "react";
import {
  StartYouTubeAuth,
  SyncChannelData,
  InvalidateYouTubeClient,
  SyncSteamData,
  SaveSteamAPIKey,
  LoginSteam,
  DisconnectSteam,
  GetCacheDir,
  ImportYouTubeJSON,
  OpenFolderInExplorer,
} from "../../../wailsjs/go/backend/App";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
}

export interface SettingsAccountsTabProps {
  readonly credsLoaded: boolean;
  readonly authed: boolean;
  readonly channel: YouTubeChannel | null;
  readonly steamId: string;
  readonly steamApiKey: string;
  readonly onAuthDisconnect: () => void;
  readonly onSteamConnected: (id: string) => void;
  readonly onSteamDisconnected: () => void;
  readonly onSteamApiKeyChange: (key: string) => void;
  readonly onOpenDevLogs?: () => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function SettingsAccountsTab({
  credsLoaded,
  authed,
  channel,
  steamId,
  steamApiKey,
  onAuthDisconnect,
  onSteamConnected,
  onSteamDisconnected,
  onSteamApiKeyChange,
  onOpenDevLogs,
}: SettingsAccountsTabProps) {
  const [connecting, setConnecting] = useState(false);
  const [ytSyncing, setYtSyncing] = useState(false);
  const [steamConnecting, setSteamConnecting] = useState(false);
  const [steamSyncing, setSteamSyncing] = useState(false);
  const [editingSteamKey, setEditingSteamKey] = useState(false);
  const [showSteamKey, setShowSteamKey] = useState(false);
  const [importingJson, setImportingJson] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      await StartYouTubeAuth();
    } catch (e: unknown) {
      setError(toErrorMessage(e));
      setConnecting(false);
    }
  };

  const handleSteamConnect = async () => {
    if (!steamApiKey) {
      setError("Please enter a Steam Web API Key first");
      return;
    }
    setSteamConnecting(true);
    setError("");
    try {
      await SaveSteamAPIKey(steamApiKey);
      const id = await LoginSteam();
      onSteamConnected(id as string);
      setEditingSteamKey(false);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setSteamConnecting(false);
    }
  };

  const handleSteamDisconnect = async () => {
    try {
      await DisconnectSteam();
      onSteamDisconnected();
      setEditingSteamKey(false);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  };

  return (
    <>
      {/* YouTube Account Section */}
      <section className="flex flex-col gap-4">
        <div className="text-xs font-semibold text-text-primary tracking-wider flex items-center gap-2 border-b border-border-subtle pb-2 mb-2">
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ color: "#4ade80", flexShrink: 0 }}
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <div className="flex items-center gap-2.5">
                {channel?.thumbnail && (
                  <img
                    src={channel.thumbnail}
                    alt={channel.title}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="font-medium text-xs text-text-primary mb-0.5">
                    {channel?.title || "Connected"}
                  </p>
                  <p className="text-[10px] text-text-secondary">
                    Your YouTube account is linked.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={ytSyncing}
                onClick={async () => {
                  setYtSyncing(true);
                  try {
                    await SyncChannelData();
                  } catch (e: unknown) {
                    setError(toErrorMessage(e));
                  } finally {
                    setYtSyncing(false);
                  }
                }}
              >
                {ytSyncing ? "Syncing..." : "Sync"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? "Opening browser..." : "Switch account"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm text-red-400 hover:text-red-300"
                onClick={async () => {
                  try {
                    await InvalidateYouTubeClient();
                    onAuthDisconnect();
                  } catch (e: unknown) {
                    setError(toErrorMessage(e));
                  }
                }}
              >
                Disconnect
              </button>
            </div>
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

      {/* Steam Account Section */}
      <section className="flex flex-col gap-4">
        <div className="text-xs font-semibold text-text-primary flex items-center gap-2 border-b border-border-subtle pb-2 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#66c0f4">
            <path d="M12 2a10 10 0 0 0-10 10c0 4.7 3.3 8.7 7.7 9.7l2.8-4a2.5 2.5 0 0 1-.5-1.5 2.5 2.5 0 0 1 2.5-2.5c.3 0 .7.1 1 .2l2.7-3.9a3.5 3.5 0 1 1 3.8 5.7l-3.9 2.7c.1.3.2.7.2 1a2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-1.5-.5l-4 2.8A10 10 0 1 0 12 2z" />
          </svg>
          Steam Account
        </div>

        {steamId && !editingSteamKey ? (
          <div className="flex flex-col gap-3 p-4 bg-elevated border border-border-subtle rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                <span className="text-xs font-medium text-text-primary">
                  Steam Connected
                </span>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {steamId}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingSteamKey(true)}
              >
                Edit API Key
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={steamSyncing}
                onClick={async () => {
                  setSteamSyncing(true);
                  setError("");
                  try {
                    await SyncSteamData();
                  } catch (e: unknown) {
                    setError(toErrorMessage(e));
                  } finally {
                    setSteamSyncing(false);
                  }
                }}
              >
                {steamSyncing ? "Syncing..." : "Sync Steam"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm text-red-400 hover:text-red-300 ml-auto"
                onClick={handleSteamDisconnect}
              >
                Disconnect Steam
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4 bg-elevated border border-border-subtle rounded-md items-start">
            <div className="w-full flex items-center justify-between">
              <label className="text-xs font-semibold text-text-primary">
                Steam Web API Key
              </label>
              <button
                type="button"
                onClick={() => BrowserOpenURL("https://steamcommunity.com/dev/apikey")}
                className="text-[11px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                Get Steam Web API Key
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                </svg>
              </button>
            </div>

            <div className="relative w-full">
              <input
                type={showSteamKey ? "text" : "password"}
                style={{ backgroundColor: "#141416", color: "#f4f4f5" }}
                className="w-full bg-[#141416] border border-white/10 rounded px-2.5 py-1.5 pr-8 text-xs text-text-primary outline-none focus:border-accent"
                placeholder="Steam Web API Key"
                value={steamApiKey}
                onChange={(e) => onSteamApiKeyChange(e.target.value)}
              />
              <button
                type="button"
                aria-label="Toggle API key visibility"
                onClick={() => setShowSteamKey(!showSteamKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
              >
                {showSteamKey ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                  </svg>
                )}
              </button>
            </div>

            <div className="w-full flex items-center justify-end gap-2 mt-2">
              {editingSteamKey && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setEditingSteamKey(false)}
                >
                  Cancel
                </button>
              )}
              <button
                className="flex items-center justify-center gap-2 px-4 py-1.5 bg-[#171a21] text-[#c6d4df] font-semibold text-xs rounded-sm border border-[#2a475e] hover:bg-[#2a475e] hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                onClick={handleSteamConnect}
                disabled={steamConnecting}
              >
                {steamConnecting
                  ? "Waiting for login..."
                  : editingSteamKey
                  ? "Save Key"
                  : "Connect with Steam"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* System & Diagnostics Section */}
      <section className="flex flex-col gap-4">
        <div className="text-xs font-semibold text-text-primary flex items-center gap-2 border-b border-border-subtle pb-2 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          System & Diagnostics
        </div>

        <div className="flex flex-col gap-2 p-4 bg-elevated border border-border-subtle rounded-md">
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-medium text-text-primary">Cache Folder</p>
              <p className="text-[10px] text-text-secondary">
                Open the local Amon Hen media & metadata cache folder
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                try {
                  const dir = await GetCacheDir();
                  if (dir) await OpenFolderInExplorer(dir);
                } catch (e: unknown) {
                  setError(toErrorMessage(e));
                }
              }}
            >
              Open Cache Folder
            </button>
          </div>

          <div className="flex items-center justify-between py-1 border-t border-border-subtle pt-2">
            <div>
              <p className="text-xs font-medium text-text-primary">
                Import YouTube Backup
              </p>
              <p className="text-[10px] text-text-secondary">
                Import channel data from a YouTube Takeout or export JSON file
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={importingJson}
              onClick={async () => {
                setImportingJson(true);
                setError("");
                try {
                  await ImportYouTubeJSON();
                } catch (e: unknown) {
                  setError(toErrorMessage(e));
                } finally {
                  setImportingJson(false);
                }
              }}
            >
              {importingJson ? "Importing..." : "Import YouTube JSON"}
            </button>
          </div>

          {onOpenDevLogs && (
            <div className="flex items-center justify-between py-1 border-t border-border-subtle pt-2">
              <div>
                <p className="text-xs font-medium text-text-primary">
                  API Quota & Dev Logs
                </p>
                <p className="text-[10px] text-text-secondary">
                  Monitor YouTube API usage, quota limits, and system logs
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onOpenDevLogs}
              >
                API Quota & Logs
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
