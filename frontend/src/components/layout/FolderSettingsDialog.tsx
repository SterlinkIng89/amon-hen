import { useState, useEffect } from "react";
import { GetFolderSettings, SaveFolderSettings } from "../../../wailsjs/go/backend/App";
import { backend } from "../../../wailsjs/go/models";

// Define the shape manually to match the Go struct since it might not be auto-generated in models yet
// Actually we can use the type from index.ts or define it
interface FolderSettingsProps {
  folder: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onSave?: (folder: string, settings: backend.FolderConfig) => void;
}

export default function FolderSettingsDialog({ folder, open, onClose, onSaved }: FolderSettingsProps) {
  const [recursive, setRecursive] = useState(false);
  const [maxDur, setMaxDur] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    GetFolderSettings(folder)
      .then((cfg: any) => {
        setRecursive(cfg.recursive || false);
        setMaxDur(cfg.max_duration_secs > 0 ? cfg.max_duration_secs : "");
      })
      .catch(console.error);
  }, [open, folder]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const dur = typeof maxDur === "number" ? maxDur : 0;
      await SaveFolderSettings(folder, {
        recursive: recursive,
        max_duration_secs: dur,
      } as any);
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  // Convert seconds to mm:ss for display
  const formatSecs = (s: number) => {
    if (s <= 0) return "No limit";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-surface border border-border-subtle rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-elevated">
          <h2 className="text-sm font-bold text-text-primary">Folder Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-black/20 transition-colors bg-transparent border-none cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-6">
          <div className="text-xs text-text-secondary truncate bg-black/20 p-2 rounded-md font-mono border border-border-subtle" title={folder}>
            {folder}
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
              />
              <div className="w-4 h-4 border border-border-medium rounded bg-elevated peer-checked:bg-accent peer-checked:border-accent transition-colors" />
              <svg
                className="absolute w-3 h-3 text-base pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">Include Subfolders (Recursive)</span>
              <span className="text-xs text-text-muted mt-0.5">Scan all directories inside this folder</span>
            </div>
          </label>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary flex flex-col">
              Max video duration (seconds)
              <span className="text-xs text-text-muted font-normal mt-0.5">Leave blank or 0 for no limit. Useful for "Clips" folders.</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                value={maxDur}
                onChange={(e) => setMaxDur(e.target.value ? parseInt(e.target.value) : "")}
                placeholder="e.g. 90 for 1m30s"
                className="flex-1 px-3 py-2 bg-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:border-accent outline-none"
              />
              <div className="text-xs font-mono text-accent bg-accent/10 px-2 py-1 rounded border border-accent/20 min-w-[50px] text-center">
                {formatSecs(typeof maxDur === "number" ? maxDur : 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-elevated border-t border-border-subtle flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-text-secondary bg-transparent border border-border-subtle rounded-md hover:bg-black/20 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 text-sm font-semibold text-base bg-accent rounded-md transition-colors cursor-pointer flex items-center justify-center min-w-[80px] ${
              saving ? "opacity-70 cursor-wait" : "hover:bg-accent-hover"
            }`}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
