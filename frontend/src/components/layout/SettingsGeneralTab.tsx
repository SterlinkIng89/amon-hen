import { useState } from "react";
import {
  SetAutoLaunch,
  SetWatchFolderEnabled,
  SetTitleSeparator,
  SetDefaultExportFolder,
  SelectExportFolder,
  OpenFolderInExplorer,
} from "../../../wailsjs/go/backend/App";
import { CardDensity } from "../../types";
import { useAppStore } from "../../store/useAppStore";

export interface SettingsGeneralTabProps {
  readonly titleSeparator: string;
  readonly setTitleSeparator: (sep: string) => void;
  readonly autoLaunch: boolean;
  readonly setAutoLaunch: React.Dispatch<React.SetStateAction<boolean>>;
  readonly watchFolder: boolean;
  readonly setWatchFolder: React.Dispatch<React.SetStateAction<boolean>>;
  readonly defaultExportFolder: string;
  readonly setDefaultExportFolder: (folder: string) => void;
}

const PRESET_SEPARATORS = [" - ", " — ", " | ", " : "] as const;

const DENSITY_OPTIONS: { value: CardDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

export function SettingsGeneralTab({
  titleSeparator,
  setTitleSeparator,
  autoLaunch,
  setAutoLaunch,
  watchFolder,
  setWatchFolder,
  defaultExportFolder,
  setDefaultExportFolder,
}: SettingsGeneralTabProps) {
  const {
    cardDensity,
    setCardDensity,
    defaultVideoPrivacy,
    setDefaultVideoPrivacy,
    defaultPlaylistPrivacy,
    setDefaultPlaylistPrivacy,
  } = useAppStore();

  const [customSepActive, setCustomSepActive] = useState(false);
  const [titleSepSaving, setTitleSepSaving] = useState(false);
  const [autoLaunchSaving, setAutoLaunchSaving] = useState(false);
  const [watchFolderSaving, setWatchFolderSaving] = useState(false);
  const [exportFolderSaving, setExportFolderSaving] = useState(false);

  return (
    <>
      {/* Card 1: Appearance & Formatting */}
      <section className="bg-elevated border border-border-subtle rounded-lg divide-y divide-border-subtle">
        <div className="p-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-text-primary">
              Grid Card Density
            </p>
            <p className="text-[10px] text-text-secondary mt-0.5">
              Adjust thumbnail and card size across Library and Channel views
            </p>
          </div>
          <div className="flex items-center bg-base border border-border-subtle rounded-lg p-0.5 gap-0.5">
            {DENSITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCardDensity(opt.value)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  cardDensity === opt.value
                    ? "bg-accent text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3.5 flex flex-col gap-2">
          <p className="text-xs font-medium text-text-primary">
            Title Separator
          </p>
          <p className="text-[10px] text-text-secondary">
            Used between segments in auto-generated titles
          </p>
          <div className="bg-base border border-border-subtle rounded px-2.5 py-1.5 text-[11px] font-mono text-text-muted truncate">
            Battlefield 6{titleSeparator}Conquest{titleSeparator}2026-10-23
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
            {PRESET_SEPARATORS.map((preset) => (
              <button
                key={preset}
                type="button"
                title={`Use "${preset}" as separator`}
                onClick={async () => {
                  setCustomSepActive(false);
                  setTitleSepSaving(true);
                  try {
                    await SetTitleSeparator(preset);
                    setTitleSeparator(preset);
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setTitleSepSaving(false);
                  }
                }}
                disabled={titleSepSaving}
                className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                  titleSeparator === preset && !customSepActive
                    ? "bg-accent text-white border-accent"
                    : "bg-surface border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-medium"
                }`}
              >
                {`"${preset}"`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomSepActive(true)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors cursor-pointer ${
                customSepActive || !PRESET_SEPARATORS.includes(titleSeparator as any)
                  ? "bg-accent text-white border-accent"
                  : "bg-surface border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-medium"
              }`}
            >
              Custom
            </button>
          </div>
          {(customSepActive || !PRESET_SEPARATORS.includes(titleSeparator as any)) && (
            <input
              type="text"
              value={titleSeparator}
              onChange={(e) => setTitleSeparator(e.target.value)}
              onBlur={async () => {
                setTitleSepSaving(true);
                try {
                  await SetTitleSeparator(titleSeparator);
                } catch (e) {
                  console.error(e);
                } finally {
                  setTitleSepSaving(false);
                }
              }}
              placeholder=" - "
              className="mt-1 w-full bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-accent"
            />
          )}
        </div>
      </section>

      {/* Card 2: Default Privacy */}
      <section className="bg-elevated border border-border-subtle rounded-lg divide-y divide-border-subtle">
        <div className="p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-text-primary">
              Default Video Privacy
            </p>
            <span className="text-[10px] text-text-muted capitalize">
              {defaultVideoPrivacy}
            </span>
          </div>
          <p className="text-[10px] text-text-secondary">
            Fallback privacy applied when adding or uploading new videos
          </p>
          <div className="flex items-center bg-base border border-border-subtle rounded-lg p-0.5 gap-0.5 mt-1">
            {(["public", "unlisted", "private"] as const).map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`video-privacy-${p}`}
                onClick={() => setDefaultVideoPrivacy(p)}
                className={`flex-1 py-1 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${
                  defaultVideoPrivacy === p
                    ? "bg-accent text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-text-primary">
              Default Playlist Privacy
            </p>
            <span className="text-[10px] text-text-muted capitalize">
              {defaultPlaylistPrivacy}
            </span>
          </div>
          <p className="text-[10px] text-text-secondary">
            Default privacy used when creating new YouTube playlists
          </p>
          <div className="flex items-center bg-base border border-border-subtle rounded-lg p-0.5 gap-0.5 mt-1">
            {(["public", "unlisted", "private"] as const).map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`playlist-privacy-${p}`}
                onClick={() => setDefaultPlaylistPrivacy(p)}
                className={`flex-1 py-1 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${
                  defaultPlaylistPrivacy === p
                    ? "bg-accent text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Card 3: Library & Export */}
      <section className="bg-elevated border border-border-subtle rounded-lg divide-y divide-border-subtle">
        <div className="p-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-text-primary">
              Launch on Windows startup
            </p>
            <p className="text-[10px] text-text-secondary mt-0.5">
              Start Amon-Hen automatically when you log in
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoLaunch}
            disabled={autoLaunchSaving}
            onClick={async () => {
              setAutoLaunchSaving(true);
              try {
                await SetAutoLaunch(!autoLaunch);
                setAutoLaunch((v) => !v);
              } catch (e) {
                console.error("Failed to set auto-launch:", e);
              } finally {
                setAutoLaunchSaving(false);
              }
            }}
            className={`relative w-10 h-5 rounded-full transition-colors duration-200 border flex-shrink-0 cursor-pointer ${
              autoLaunch
                ? "bg-accent border-accent/60"
                : "bg-surface border-border-medium"
            } ${autoLaunchSaving ? "opacity-50 cursor-wait" : ""}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                autoLaunch ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="p-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-text-primary">
              Watch folders for new videos
            </p>
            <p className="text-[10px] text-text-secondary mt-0.5">
              Auto-refresh library when new video files are detected
            </p>
          </div>
          <button
            role="switch"
            aria-checked={watchFolder}
            disabled={watchFolderSaving}
            onClick={async () => {
              setWatchFolderSaving(true);
              try {
                await SetWatchFolderEnabled(!watchFolder);
                setWatchFolder((v) => !v);
              } catch (e) {
                console.error("Failed to set watch folder:", e);
              } finally {
                setWatchFolderSaving(false);
              }
            }}
            className={`relative w-10 h-5 rounded-full transition-colors duration-200 border flex-shrink-0 cursor-pointer ${
              watchFolder
                ? "bg-accent border-accent/60"
                : "bg-surface border-border-medium"
            } ${watchFolderSaving ? "opacity-50 cursor-wait" : ""}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                watchFolder ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="p-3.5 flex flex-col gap-2">
          <p className="text-xs font-medium text-text-primary">
            Default Export Destination
          </p>
          <p className="text-[10px] text-text-secondary">
            Default folder used when bulk exporting videos with renamed titles
          </p>
          <div className="flex gap-2 items-center mt-1">
            <input
              type="text"
              value={defaultExportFolder}
              onChange={(e) => setDefaultExportFolder(e.target.value)}
              onBlur={async () => {
                setExportFolderSaving(true);
                try {
                  await SetDefaultExportFolder(defaultExportFolder);
                } catch (e) {
                  console.error("Failed to save default export folder", e);
                } finally {
                  setExportFolderSaving(false);
                }
              }}
              placeholder="e.g. C:\Users\...\Videos\AmonHen"
              className="flex-1 min-w-0 bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const dir = await SelectExportFolder();
                  if (dir) {
                    setDefaultExportFolder(dir);
                    await SetDefaultExportFolder(dir);
                  }
                } catch (e) {
                  console.error("Failed to select export folder", e);
                }
              }}
              disabled={exportFolderSaving}
              className="px-2.5 py-1.5 rounded text-xs bg-surface border border-border-subtle text-text-secondary hover:border-border-medium hover:text-text-primary transition-colors cursor-pointer shrink-0"
            >
              Browse...
            </button>
            <button
              type="button"
              onClick={() => {
                if (defaultExportFolder) {
                  OpenFolderInExplorer(defaultExportFolder);
                }
              }}
              disabled={!defaultExportFolder}
              className="px-2.5 py-1.5 rounded text-xs bg-surface border border-border-subtle text-text-secondary hover:border-border-medium hover:text-text-primary transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Open Folder
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
