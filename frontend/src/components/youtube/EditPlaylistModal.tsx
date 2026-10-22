import React, { useState, useEffect, useCallback, useRef } from "react";
import { YTPlaylist } from "../../types";
import { UpdatePlaylistMetadata } from "../../../wailsjs/go/backend/App";

export interface EditPlaylistModalProps {
  readonly playlist: YTPlaylist;
  readonly onClose: () => void;
  readonly onSaved: (updated: YTPlaylist) => void;
}

export default function EditPlaylistModal({
  playlist,
  onClose,
  onSaved,
}: EditPlaylistModalProps) {
  const [title, setTitle] = useState(playlist.title);
  const [description, setDescription] = useState(playlist.description || "");
  const [privacy, setPrivacy] = useState<string>(playlist.privacy || "unlisted");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setSaveError("Playlist title cannot be empty");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      await UpdatePlaylistMetadata(
        playlist.id,
        cleanTitle,
        description,
        privacy,
      );
      onSaved({
        ...playlist,
        title: cleanTitle,
        description,
        privacy,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg.replace(/^Error:\s*/, ""));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, title, description, privacy, playlist, onSaved, onClose]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        handleSaveRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSaveRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-playlist-modal-title"
        className="w-full max-w-lg bg-card border border-border-subtle rounded-xl shadow-sm flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div>
              <h2
                id="edit-playlist-modal-title"
                className="text-sm font-semibold text-text-primary"
              >
                Edit Playlist
              </h2>
              <p className="text-xs text-text-muted">
                Update playlist details on YouTube
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close modal"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          {saveError && (
            <div
              role="alert"
              className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-start gap-2"
            >
              <svg
                className="w-4 h-4 shrink-0 mt-0.5 text-red-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{saveError}</span>
            </div>
          )}

          {/* Title input */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-playlist-title"
              className="text-xs font-medium text-text-secondary"
            >
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="edit-playlist-title"
              type="text"
              className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter playlist title"
              disabled={isSaving}
              autoFocus
            />
          </div>

          {/* Privacy select */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-playlist-privacy"
              className="text-xs font-medium text-text-secondary"
            >
              Privacy
            </label>
            <select
              id="edit-playlist-privacy"
              className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors cursor-pointer"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              disabled={isSaving}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>

          {/* Description textarea */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-playlist-description"
              className="text-xs font-medium text-text-secondary"
            >
              Description
            </label>
            <textarea
              id="edit-playlist-description"
              rows={4}
              className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-text-primary outline-none focus:border-accent transition-colors resize-y custom-scrollbar font-sans"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter playlist description"
              disabled={isSaving}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle bg-surface/40">
          <span className="text-[11px] text-text-muted hidden sm:inline">
            Press <kbd className="px-1 py-0.5 rounded bg-surface border border-border-subtle font-mono text-[10px]">Ctrl+S</kbd> to save
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              className="px-3.5 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
