import React, { useState, useEffect } from "react";
import { YTPlaylist } from "../../types";
import {
  GetChannelPlaylists,
  AddVideoToPlaylist,
  GetOrCreatePlaylist,
} from "../../../wailsjs/go/backend/App";

interface YouTubePlaylistPickerProps {
  readonly videoId: string;
  readonly playlistTitle?: string;
  readonly defaultPrivacy?: string;
  readonly onPlaylistAdded?: () => void;
}

export default function YouTubePlaylistPicker({
  videoId,
  playlistTitle,
  defaultPrivacy,
  onPlaylistAdded,
}: YouTubePlaylistPickerProps) {
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [isCreatingPlaylistLoading, setIsCreatingPlaylistLoading] = useState(false);
  const [playlistCreateError, setPlaylistCreateError] = useState("");

  const refreshPlaylists = () => {
    GetChannelPlaylists("recent")
      .then(setPlaylists)
      .catch(() => {});
  };

  useEffect(() => {
    refreshPlaylists();
  }, []);

  const handleAddToPlaylist = async (playlistId: string) => {
    try {
      await AddVideoToPlaylist(playlistId, videoId);
      setIsPlaylistDropdownOpen(false);
      setPlaylistSearch("");
      onPlaylistAdded?.();
      refreshPlaylists();
    } catch (e: unknown) {
      console.error("Failed to add video to playlist:", e);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistTitle.trim()) return;
    setIsCreatingPlaylistLoading(true);
    setPlaylistCreateError("");
    try {
      const id = await GetOrCreatePlaylist(
        newPlaylistTitle.trim(),
        "",
        defaultPrivacy || "unlisted",
      );
      await AddVideoToPlaylist(id, videoId);
      setNewPlaylistTitle("");
      setIsCreatingPlaylist(false);
      onPlaylistAdded?.();
      refreshPlaylists();
    } catch (e: unknown) {
      setPlaylistCreateError(
        e instanceof Error ? e.message : String(e ?? "Failed to create playlist"),
      );
    } finally {
      setIsCreatingPlaylistLoading(false);
    }
  };

  const filteredPlaylists = playlists.filter((p) =>
    p.title.toLowerCase().includes(playlistSearch.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-white/60">
            Playlist
          </label>
          {playlistTitle && (
            <span className="text-xs bg-[#3ea6ff]/10 text-[#3ea6ff] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
              </svg>
              Linked: {playlistTitle}
            </span>
          )}
        </div>
        <button
          type="button"
          className="text-xs font-medium text-[#3ea6ff] hover:text-[#65b8ff] transition-colors bg-transparent border-none cursor-pointer"
          onClick={() => {
            setIsCreatingPlaylist(!isCreatingPlaylist);
            setPlaylistCreateError("");
          }}
        >
          {isCreatingPlaylist ? "Cancel" : "New Playlist"}
        </button>
      </div>

      {isCreatingPlaylist ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card"
              type="text"
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              placeholder="Playlist name..."
              autoFocus
              disabled={isCreatingPlaylistLoading}
              onKeyDown={(e) =>
                e.key === "Enter" && handleCreatePlaylist()
              }
            />
            <button
              type="button"
              className="bg-white text-black hover:bg-gray-200 rounded-sm px-5 text-sm font-medium transition-colors"
              onClick={handleCreatePlaylist}
              disabled={
                !newPlaylistTitle.trim() ||
                isCreatingPlaylistLoading
              }
            >
              {isCreatingPlaylistLoading ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                "Create"
              )}
            </button>
          </div>
          <span className="text-xs text-white/50">
            Existing playlist with same name will be reused.
          </span>
          {playlistCreateError && (
            <span className="text-xs text-red-400">
              {playlistCreateError}
            </span>
          )}
        </div>
      ) : (
        <div className="relative">
          <input
            className="w-full bg-elevated border border-border-subtle rounded-sm pl-10 pr-10 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card"
            type="text"
            value={playlistSearch}
            onChange={(e) => {
              setPlaylistSearch(e.target.value);
              setIsPlaylistDropdownOpen(true);
            }}
            onFocus={() => setIsPlaylistDropdownOpen(true)}
            placeholder="Select playlist..."
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          {playlistSearch && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              onClick={() => {
                setPlaylistSearch("");
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}

          {isPlaylistDropdownOpen && (
            <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#272727] border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
              {filteredPlaylists.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors flex items-center justify-between text-white/90"
                  onClick={() => handleAddToPlaylist(p.id)}
                >
                  <div className="flex items-center justify-between w-full min-w-0 gap-2">
                    <span className="text-sm font-medium truncate flex-1">
                      {p.title}
                    </span>
                    <span className="text-xs text-white/50 whitespace-nowrap">
                      {p.videoCount} videos
                    </span>
                  </div>
                </button>
              ))}
              {filteredPlaylists.length === 0 && (
                <div className="p-4 text-center text-xs text-white/50">
                  No playlists found
                </div>
              )}
            </div>
          )}
          {isPlaylistDropdownOpen && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsPlaylistDropdownOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
