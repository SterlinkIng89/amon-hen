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
    setIsCreating(true); // use as generic loading state
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
            You added a new tag <strong>"{tag}"</strong>. Would you like to link a YouTube playlist to this tag so future videos are automatically added to it?
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 p-3 border border-border-subtle rounded bg-elevated">
            <label className="text-xs font-bold text-text-secondary">Create New Playlist</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-surface border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                type="text"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                placeholder="Playlist name..."
                disabled={isCreating}
                autoFocus
              />
              <button
                className="btn btn-primary btn-sm px-4 whitespace-nowrap"
                onClick={handleCreateAndLink}
                disabled={!newPlaylistTitle.trim() || isCreating}
              >
                Create & Link
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-px bg-border-subtle flex-1" />
            <span className="text-xs text-text-muted font-bold uppercase tracking-wider">OR</span>
            <div className="h-px bg-border-subtle flex-1" />
          </div>

          <div className="flex flex-col gap-1.5 p-3 border border-border-subtle rounded bg-elevated">
            <label className="text-xs font-bold text-text-secondary">Link Existing Playlist</label>
            <div className="flex gap-2">
              <select
                className="flex-1 bg-surface border border-border-subtle rounded-sm px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
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
                className="btn btn-secondary btn-sm px-4 whitespace-nowrap"
                onClick={handleLinkExisting}
                disabled={!selectedPlaylistId || isCreating}
              >
                Link Selected
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <button
            className="btn btn-ghost btn-sm text-text-muted hover:text-text-primary"
            onClick={handleSkip}
            disabled={isCreating}
          >
            Not Now (Don't ask again)
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={isCreating}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
