import React, { useState, useEffect } from "react";
import { YTPlaylist } from "../../types";
import {
  GetChannelPlaylists,
  AddVideoToPlaylist,
  GetOrCreatePlaylist,
} from "../../../wailsjs/go/backend/App";

interface YouTubePlaylistPickerProps {
  readonly videoId: string;
  readonly defaultPrivacy?: string;
  readonly onPlaylistAdded?: () => void;
}

export default function YouTubePlaylistPicker({
  videoId,
  defaultPrivacy,
  onPlaylistAdded,
}: YouTubePlaylistPickerProps) {
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [createError, setCreateError] = useState("");

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
      setShowPicker(false);
      onPlaylistAdded?.();
      refreshPlaylists();
    } catch (e: unknown) {
      console.error("Failed to add video to playlist:", e);
      alert(e instanceof Error ? e.message : "Failed to add to playlist");
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newTitle.trim()) return;
    setIsLoading(true);
    setCreateError("");
    try {
      const id = await GetOrCreatePlaylist(
        newTitle.trim(),
        "",
        defaultPrivacy || "unlisted",
      );
      await AddVideoToPlaylist(id, videoId);
      setNewTitle("");
      setIsCreating(false);
      setShowPicker(false);
      onPlaylistAdded?.();
      refreshPlaylists();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : String(e ?? "Failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPlaylists = playlists.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="px-3 py-1.5 rounded-lg bg-[#272727] hover:bg-white/10 border border-white/10 text-white/90 transition-colors flex items-center gap-1.5 text-xs font-medium"
        title="Add to playlist"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 5L6 9H2V15H6L11 19V5Z" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
        <span>Add to Playlist</span>
      </button>

      {showPicker && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[#272727] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3 border-b border-white/10 bg-[#0f0f0f]/50 flex items-center justify-between">
            <span className="text-xs font-medium text-white/90">
              {isCreating ? "Create playlist" : "Select playlist"}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-[#3ea6ff] hover:text-[#65b8ff] transition-colors bg-transparent border-none cursor-pointer"
              onClick={() => setIsCreating(!isCreating)}
            >
              {isCreating ? "Cancel" : "+ New"}
            </button>
          </div>

          {isCreating ? (
            <div className="p-4 flex flex-col gap-3">
              <input
                className="w-full bg-[#0f0f0f] border border-transparent rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#3ea6ff]"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Playlist name..."
                autoFocus
                disabled={isLoading}
                onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
              />
              <span className="text-[10px] text-white/50">
                Existing playlist with same name will be reused.
              </span>
              {createError && (
                <span className="text-[10px] text-red-400">{createError}</span>
              )}
              <button
                type="button"
                className="w-full py-2 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-medium transition-colors"
                onClick={handleCreateAndAdd}
                disabled={!newTitle.trim() || isLoading}
              >
                {isLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin mx-auto" />
                ) : (
                  "Create & Add"
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="p-2 border-b border-white/10">
                <div className="relative">
                  <input
                    className="w-full bg-[#0f0f0f] border border-transparent rounded-lg pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-[#3ea6ff]"
                    type="text"
                    placeholder="Search playlists..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50">
                    <svg
                      width="14"
                      height="14"
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
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto custom-scrollbar">
                {filteredPlaylists.length === 0 ? (
                  <div className="p-4 text-center text-xs text-white/50">
                    No playlists found
                  </div>
                ) : (
                  filteredPlaylists.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handleAddToPlaylist(p.id)}
                      className="w-full text-left p-2.5 hover:bg-white/10 transition-colors flex items-center justify-between group"
                    >
                      <div className="flex items-center justify-between w-full min-w-0 gap-2">
                        <span className="text-xs font-medium text-white/90 truncate flex-1">
                          {p.title}
                        </span>
                        <span className="text-[10px] text-white/50 whitespace-nowrap">
                          {p.videoCount} videos
                        </span>
                      </div>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="text-[#3ea6ff] opacity-0 group-hover:opacity-100 transition-opacity ml-1.5"
                      >
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                      </svg>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
