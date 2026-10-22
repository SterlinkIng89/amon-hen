import React, { useState, useRef, useEffect } from "react";
import { YTPlaylist } from "../../types";

export interface ChannelBulkActionBarProps {
  readonly selectedCount: number;
  readonly playlists: YTPlaylist[];
  readonly isInsidePlaylist?: boolean;
  readonly isUpdating?: boolean;
  readonly onClearSelection: () => void;
  readonly onAddToPlaylist: (playlistId: string) => void;
  readonly onCreateAndAddToPlaylist?: (title: string) => Promise<void>;
  readonly onBulkUpdatePrivacy?: (privacy: "public" | "unlisted" | "private") => void;
  readonly onOpenBulkEditModal?: () => void;
  readonly onRemoveFromPlaylist?: () => void;
  readonly onDeleteFromYouTube?: () => void;
}

export default function ChannelBulkActionBar({
  selectedCount,
  playlists,
  isInsidePlaylist = false,
  isUpdating = false,
  onClearSelection,
  onAddToPlaylist,
  onCreateAndAddToPlaylist,
  onBulkUpdatePrivacy,
  onOpenBulkEditModal,
  onRemoveFromPlaylist,
  onDeleteFromYouTube,
}: ChannelBulkActionBarProps) {
  const [activeDropdown, setActiveDropdown] = useState<"playlist" | "visibility" | null>(null);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setActiveDropdown(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (selectedCount === 0) return null;

  const filteredPlaylists = playlists.filter((p) =>
    p.title.toLowerCase().includes(playlistSearch.toLowerCase()),
  );

  const handleCreatePlaylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newPlaylistTitle.trim();
    if (!title || !onCreateAndAddToPlaylist || isCreatingPlaylist) return;

    setIsCreatingPlaylist(true);
    try {
      await onCreateAndAddToPlaylist(title);
      setNewPlaylistTitle("");
      setActiveDropdown(null);
    } catch (err) {
      console.error("Failed to create and add to playlist", err);
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] animate-slideUp select-none">
      <div
        ref={containerRef}
        className="bg-elevated/95 backdrop-blur-md border border-border-medium rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-3"
      >
        {/* Selection Info */}
        <div className="flex items-center gap-2 pl-2">
          <div className="bg-accent text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
            {selectedCount}
          </div>
          <span className="text-xs font-medium text-text-primary whitespace-nowrap">
            {selectedCount === 1 ? "video selected" : "videos selected"}
          </span>
        </div>

        <div className="h-4 w-px bg-border-medium" />

        {/* Action: Add to Playlist */}
        <div className="relative">
          <button
            className="btn btn-primary btn-sm flex items-center gap-2"
            onClick={() =>
              setActiveDropdown((prev) => (prev === "playlist" ? null : "playlist"))
            }
            disabled={isUpdating}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Add to Playlist
          </button>

          {activeDropdown === "playlist" && (
            <div className="absolute bottom-full left-0 mb-2 w-72 bg-elevated border border-border-medium rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
              <div className="p-2 border-b border-border-subtle bg-surface/50">
                <div className="relative">
                  <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

              <div className="max-h-52 overflow-y-auto custom-scrollbar p-1">
                {filteredPlaylists.length === 0 ? (
                  <p className="px-3 py-2 text-[10px] text-text-muted text-center">
                    No playlists match
                  </p>
                ) : (
                  filteredPlaylists.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-accent/20 rounded-md transition-colors flex items-center justify-between"
                      onClick={() => {
                        setActiveDropdown(null);
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

              {onCreateAndAddToPlaylist && (
                <form
                  onSubmit={handleCreatePlaylistSubmit}
                  className="p-2 border-t border-border-subtle bg-surface/40 flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                    placeholder="New playlist title..."
                    value={newPlaylistTitle}
                    onChange={(e) => setNewPlaylistTitle(e.target.value)}
                    disabled={isCreatingPlaylist}
                  />
                  <button
                    type="submit"
                    disabled={!newPlaylistTitle.trim() || isCreatingPlaylist}
                    className="btn btn-primary btn-sm text-[11px] px-2.5 py-1 shrink-0 disabled:opacity-40"
                  >
                    {isCreatingPlaylist ? "Adding..." : "Create & Add"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Action: Set Visibility */}
        {onBulkUpdatePrivacy && (
          <div className="relative">
            <button
              className="btn btn-secondary btn-sm flex items-center gap-2"
              onClick={() =>
                setActiveDropdown((prev) => (prev === "visibility" ? null : "visibility"))
              }
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Set Visibility</span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </>
              )}
            </button>

            {activeDropdown === "visibility" && !isUpdating && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-elevated border border-border-medium rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn p-1">
                <button
                  className="w-full text-left px-3 py-2 text-xs font-medium text-text-primary hover:bg-green-500/15 hover:text-green-400 rounded-lg transition-colors flex items-center gap-2.5"
                  onClick={() => {
                    setActiveDropdown(null);
                    onBulkUpdatePrivacy("public");
                  }}
                >
                  <div className="w-5 h-5 rounded bg-green-500/10 text-green-400 flex items-center justify-center shrink-0">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span>Public</span>
                    <span className="text-[10px] text-text-muted">
                      Anyone can search and view
                    </span>
                  </div>
                </button>

                <button
                  className="w-full text-left px-3 py-2 text-xs font-medium text-text-primary hover:bg-sky-500/15 hover:text-sky-400 rounded-lg transition-colors flex items-center gap-2.5"
                  onClick={() => {
                    setActiveDropdown(null);
                    onBulkUpdatePrivacy("unlisted");
                  }}
                >
                  <div className="w-5 h-5 rounded bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span>Unlisted</span>
                    <span className="text-[10px] text-text-muted">
                      Anyone with the link can view
                    </span>
                  </div>
                </button>

                <button
                  className="w-full text-left px-3 py-2 text-xs font-medium text-text-primary hover:bg-amber-500/15 hover:text-amber-400 rounded-lg transition-colors flex items-center gap-2.5"
                  onClick={() => {
                    setActiveDropdown(null);
                    onBulkUpdatePrivacy("private");
                  }}
                >
                  <div className="w-5 h-5 rounded bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span>Private</span>
                    <span className="text-[10px] text-text-muted">
                      Only you can view
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action: Edit Metadata */}
        {onOpenBulkEditModal && (
          <button
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            onClick={onOpenBulkEditModal}
            disabled={isUpdating}
            title="Bulk edit video titles and descriptions"
          >
            <svg
              width="14"
              height="14"
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
            <span>Edit Metadata</span>
          </button>
        )}

        {/* Action: Remove from Playlist (only inside a playlist) */}
        {isInsidePlaylist && onRemoveFromPlaylist && (
          <button
            className="btn btn-secondary btn-sm text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 flex items-center gap-1.5"
            onClick={onRemoveFromPlaylist}
            disabled={isUpdating}
            title="Remove selected videos from this playlist"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Remove from Playlist</span>
          </button>
        )}

        {/* Action: Delete from YouTube */}
        {onDeleteFromYouTube && (
          <button
            className="btn btn-danger btn-sm flex items-center gap-1.5"
            onClick={onDeleteFromYouTube}
            disabled={isUpdating}
            title="Delete selected videos from YouTube"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Delete from YouTube</span>
          </button>
        )}

        {/* Clear Selection */}
        <button
          className="p-1.5 rounded-full text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={onClearSelection}
          disabled={isUpdating}
          title="Clear selection"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
