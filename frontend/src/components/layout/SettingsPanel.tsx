import { useState, useEffect } from "react";
import {
  IsYouTubeAuthed,
  LoadConfig,
  GetYouTubeChannelInfo,
  GetAutoLaunch,
  GetWatchFolderEnabled,
  GetDefaultExportFolder,
  GetAllGameTags,
} from "../../../wailsjs/go/backend/App";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { GameProfile } from "../../types";
import { useRecentTags } from "../../hooks/useRecentTags";
import { SettingsGeneralTab } from "./SettingsGeneralTab";
import {
  SettingsAccountsTab,
  YouTubeChannel,
} from "./SettingsAccountsTab";
import { SettingsGamesTab } from "./SettingsGamesTab";

export interface SettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onOpenTagManagement?: () => void;
  readonly onOpenDevLogs?: () => void;
}

type SettingsTab = "general" | "accounts" | "games";

export default function SettingsPanel({
  open,
  onClose,
  onOpenTagManagement,
  onOpenDevLogs,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [authed, setAuthed] = useState(false);
  const [credsLoaded, setCredsLoaded] = useState(true);
  const [channel, setChannel] = useState<YouTubeChannel | null>(null);

  // Steam Auth state
  const [steamApiKey, setSteamApiKey] = useState("");
  const [steamId, setSteamId] = useState("");

  // App & Formatting state
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [watchFolder, setWatchFolder] = useState(false);
  const [titleSeparator, setTitleSeparator] = useState(" - ");
  const [defaultExportFolder, setDefaultExportFolder] = useState("");

  // Game Profiles state
  const [gameProfiles, setGameProfiles] = useState<Record<string, GameProfile>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const { suggestions: recentTagSuggestions } = useRecentTags();

  useEffect(() => {
    if (!open) return;
    IsYouTubeAuthed()
      .then(async (isAuthed) => {
        setAuthed(isAuthed);
        if (isAuthed) {
          try {
            const info = await GetYouTubeChannelInfo();
            setChannel(info);
          } catch (e) {
            console.error("Failed to get channel info:", e);
          }
        }
      })
      .catch(() => {});

    LoadConfig()
      .then((cfg) => {
        setCredsLoaded(!!cfg.youtube_client_id);
        setGameProfiles(cfg.game_profiles || {});
        setTitleSeparator(cfg.title_separator || " - ");
        if (cfg.steam_api_key) setSteamApiKey(cfg.steam_api_key);
        if (cfg.steam_id) setSteamId(cfg.steam_id);
      })
      .catch(() => setCredsLoaded(false));

    GetDefaultExportFolder()
      .then(setDefaultExportFolder)
      .catch(() => {});

    GetAutoLaunch()
      .then(setAutoLaunch)
      .catch(() => {});

    GetWatchFolderEnabled()
      .then(setWatchFolder)
      .catch(() => {});

    GetAllGameTags()
      .then(setAllTags)
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    const unsub = EventsOn("youtube:auth-complete", async () => {
      setAuthed(true);
      try {
        const info = await GetYouTubeChannelInfo();
        setChannel(info);
      } catch {}
    });
    return () => {
      unsub();
    };
  }, []);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-[380px] max-w-[90vw] bg-surface border-l border-border-subtle shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-50 transform transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
          <span className="text-base font-semibold text-text-primary">
            Settings
          </span>
          <button
            className="bg-transparent border-none text-text-secondary cursor-pointer p-1 rounded-sm hover:text-text-primary hover:bg-elevated transition-colors"
            onClick={onClose}
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div
          role="tablist"
          className="flex border-b border-border-subtle shrink-0 px-5 pt-2 gap-4"
        >
          <button
            role="tab"
            aria-selected={activeTab === "general"}
            onClick={() => setActiveTab("general")}
            className={`pb-2 text-xs font-semibold cursor-pointer transition-colors border-b-2 ${
              activeTab === "general"
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            General
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "accounts"}
            onClick={() => setActiveTab("accounts")}
            className={`pb-2 text-xs font-semibold cursor-pointer transition-colors border-b-2 ${
              activeTab === "accounts"
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Accounts
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "games"}
            onClick={() => setActiveTab("games")}
            className={`pb-2 text-xs font-semibold cursor-pointer transition-colors border-b-2 ${
              activeTab === "games"
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Games & Titles
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {activeTab === "general" && (
            <SettingsGeneralTab
              titleSeparator={titleSeparator}
              setTitleSeparator={setTitleSeparator}
              autoLaunch={autoLaunch}
              setAutoLaunch={setAutoLaunch}
              watchFolder={watchFolder}
              setWatchFolder={setWatchFolder}
              defaultExportFolder={defaultExportFolder}
              setDefaultExportFolder={setDefaultExportFolder}
            />
          )}

          {activeTab === "accounts" && (
            <SettingsAccountsTab
              credsLoaded={credsLoaded}
              authed={authed}
              channel={channel}
              steamId={steamId}
              steamApiKey={steamApiKey}
              onAuthDisconnect={() => {
                setAuthed(false);
                setChannel(null);
              }}
              onSteamConnected={(id) => setSteamId(id)}
              onSteamDisconnected={() => {
                setSteamApiKey("");
                setSteamId("");
              }}
              onSteamApiKeyChange={setSteamApiKey}
              onOpenDevLogs={onOpenDevLogs}
            />
          )}

          {activeTab === "games" && (
            <SettingsGamesTab
              gameProfiles={gameProfiles}
              setGameProfiles={setGameProfiles}
              titleSeparator={titleSeparator}
              onOpenTagManagement={onOpenTagManagement}
              allTags={allTags}
              recentTagSuggestions={recentTagSuggestions}
            />
          )}
        </div>
      </aside>
    </>
  );
}
