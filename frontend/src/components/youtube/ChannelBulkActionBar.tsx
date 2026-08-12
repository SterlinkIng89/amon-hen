import React, { useState, useRef, useEffect } from "react";
import { YTPlaylist } from "../../types";

interface Props {
  selectedCount: number;
  playlists: YTPlaylist[];
  onClearSelection: () => void;
  onAddToPlaylist: (playlistId: string) => void;
}

export default function ChannelBulkActionBar({
  selectedCount,
  playlists,
  onClearSelection,
  onAddToPlaylist,
}: Props) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedCount === 0) return null;

  const filteredPlaylists = playlists.filter(p => p.title.toLowerCase().includes(playlistSearch.toLowerCase()));

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] animate-slideUp">
      <div className="bg-elevated/90 backdrop-blur-md border border-border-medium rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-4">
        
        {/* Selection Info */}
        <div className="flex items-center gap-2 pl-2">
          <div className="bg-accent text-black text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
            {selectedCount}
          </div>
          <span className="text-xs font-medium text-text-primary">
            {selectedCount === 1 ? "video" : "videos"} selected
          </span>
        </div>

        <div className="h-4 w-px bg-border-medium" />

        {/* Action: Add to Playlist */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="btn btn-primary btn-sm flex items-center gap-2"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Add to Playlist
          </button>

          {isDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-elevated border border-border-medium rounded-lg shadow-2xl z-50 overflow-hidden animate-fadeIn">
              <div className="p-2 border-b border-border-subtle bg-surface/50">
                <div className="relative">
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="w-full bg-black/40 border border-white/10 rounded-md pl-7 pr-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                    placeholder="Search playlists..."
                    value={playlistSearch}
                    onChange={(e) => setPlaylistSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                {filteredPlaylists.length === 0 ? (
                  <p className="px-3 py-2 text-[10px] text-text-muted text-center">No playlists match</p>
                ) : (
                  filteredPlaylists.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-accent/20 rounded-md transition-colors flex items-center justify-between"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onAddToPlaylist(p.id);
                      }}
                    >
                      <span className="truncate pr-2">{p.title}</span>
                      <span className="text-[10px] text-text-muted shrink-0 bg-black/20 px-1.5 py-0.5 rounded">
                        {p.videoCount}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clear Selection */}
        <button
          className="p-1.5 rounded-full text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={onClearSelection}
          title="Clear selection"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        
      </div>
    </div>
  );
}
