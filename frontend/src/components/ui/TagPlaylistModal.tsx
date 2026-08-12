import React, { useState, useEffect } from "react";
import { GetChannelPlaylists, GetOrCreatePlaylist, SetTagPlaylist } from "../../../wailsjs/go/backend/App";
import { YTPlaylist } from "../../types";

interface Props {
  tag: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function TagPlaylistModal({ tag, onClose, onSaved }: Props) {
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState(tag); // default to tag name
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    GetChannelPlaylists("recent")
      .then((res) => {
        setPlaylists(res || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  const handleCreateAndLink = async () => {
    if (!newPlaylistTitle.trim()) return;
    setIsCreating(true);
    setError("");
    try {
      const id = await GetOrCreatePlaylist(newPlaylistTitle.trim(), "", "unlisted");
      await SetTagPlaylist(tag, id);
      onSaved();
    } catch (e: any) {
      setError(e.toString());
      setIsCreating(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!selectedPlaylistId) return;
    setIsCreating(true);
    setError("");
    try {
      await SetTagPlaylist(tag, selectedPlaylistId);
      onSaved();
    } catch (e: any) {
      setError(e.toString());
      setIsCreating(false);
    }
  };

  const handleSkip = async () => {
    // Set to "none" so it doesn't prompt again
    try {
      await SetTagPlaylist(tag, "none");
    } catch (e) {
      console.error(e);
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border-subtle rounded-lg shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <div>
          <h2 className="text-lg font-bold text-text-primary m-0">Link Playlist to Tag</h2>
          <p className="text-sm text-text-secondary mt-1">
            You added a new tag <strong>"{tag}"</strong>. Link a YouTube playlist so future videos are auto-added to it — or skip if you don't want auto-linking for this tag.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Skip option — prominently placed */}
        <button
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-md border border-border-subtle bg-elevated hover:bg-card hover:border-border-medium transition-colors text-sm font-medium text-text-secondary hover:text-text-primary text-left"
          onClick={handleSkip}
          disabled={isCreating}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <span>No playlist for <strong>"{tag}"</strong> — don't ask again</span>
        </button>

        <div className="flex items-center gap-4">
          <div className="h-px bg-border-subtle flex-1" />
          <span className="text-xs text-text-muted font-bold uppercase tracking-wider">or link one</span>
          <div className="h-px bg-border-subtle flex-1" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 p-3 border border-border-subtle rounded bg-elevated">
            <label className="text-xs font-bold text-text-secondary">Create New Playlist</label>
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 min-w-0 h-[38px] bg-surface border border-border-subtle rounded-sm px-3 text-sm text-text-primary outline-none focus:border-accent"
                type="text"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                placeholder="Playlist name..."
                disabled={isCreating}
                autoFocus
              />
              <button
                className="btn btn-primary h-[36px] px-3.5 text-xs font-semibold whitespace-nowrap shrink-0"
                onClick={handleCreateAndLink}
                disabled={!newPlaylistTitle.trim() || isCreating}
              >
                Create & Link
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-3 border border-border-subtle rounded bg-elevated">
            <label className="text-xs font-bold text-text-secondary">Link Existing Playlist</label>
            <div className="flex gap-2 items-center">
              <select
                className="flex-1 min-w-0 h-[38px] bg-surface border border-border-subtle rounded-sm px-2 text-sm text-text-primary outline-none focus:border-accent"
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
                disabled={isLoading || isCreating}
              >
                <option value="">Select a playlist...</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary h-[36px] px-3.5 text-xs font-semibold whitespace-nowrap shrink-0"
                onClick={handleLinkExisting}
                disabled={!selectedPlaylistId || isCreating}
              >
                Link Selected
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            className="btn btn-ghost btn-sm text-text-muted hover:text-text-primary"
            onClick={onClose}
            disabled={isCreating}
          >
            Cancel (ask again later)
          </button>
        </div>
      </div>
    </div>
  );
}
