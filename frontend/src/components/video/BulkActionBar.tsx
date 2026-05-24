import React, { useState, useEffect, useRef } from "react";
import {
  SetVideoGames,
  DeleteFiles,
  GetChannelPlaylists,
  SetVideosPlaylist,
  CreatePlaylist,
} from "../../../wailsjs/go/backend/App";
import { useRecentTags } from "../../hooks/useRecentTags";
import { VideoFile, YTPlaylist } from "../../types";
import { generateYouTubeTitle } from "../../utils/videoUtils";
import TagInput from "../ui/TagInput";
import { QueueItem } from "../youtube/UploadQueue";

interface Props {
  selectedPaths: string[];
  selectedVideos: VideoFile[];
  onClearSelection: () => void;
  onTagsSaved: () => void;
  onFilesDeleted: () => void;
  onAddToQueue: (items: QueueItem[]) => void;
}

export default function BulkActionBar({
  selectedPaths,
  selectedVideos,
  onClearSelection,
  onTagsSaved,
  onFilesDeleted,
  onAddToQueue,
}: Props) {
  const [game, setGame] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  // playlistSearch: text in the search input (for filtering)
  const [playlistSearch, setPlaylistSearch] = useState("");
  // selectedPlaylistTitle: the playlist already chosen (shown as a chip)
  const [selectedPlaylistTitle, setSelectedPlaylistTitle] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);

  // "Create new playlist" inline form state
  const [creatingNew, setCreatingNew] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [creatingNewLoading, setCreatingNewLoading] = useState(false);
  const newPlaylistInputRef = useRef<HTMLInputElement>(null);
  const playlistInputRef = useRef<HTMLInputElement>(null);

  const { suggestions, addRecentTag } = useRecentTags();

  // Derive the default search hint from the first selected video's game tag
  const defaultSearch = selectedVideos[0]?.game || "";

  // Fetch playlists whenever dropdown opens (always fresh) and pre-fill search
  useEffect(() => {
    if (isDropdownOpen) {
      GetChannelPlaylists("recent").then(setPlaylists).catch(console.error);
      // Pre-fill with game tag if search is still empty and no playlist chosen yet
      if (!playlistSearch && !selectedPlaylistTitle) {
        setPlaylistSearch(defaultSearch);
      }
      // Focus the search input
      setTimeout(() => playlistInputRef.current?.focus(), 50);
    }
  }, [isDropdownOpen]);

  // Focus the new playlist input when the form opens
  useEffect(() => {
    if (creatingNew) {
      setTimeout(() => newPlaylistInputRef.current?.focus(), 50);
    }
  }, [creatingNew]);

  if (selectedPaths.length === 0) return null;

  const handleSave = async () => {
    if (!game.trim()) return;
    setSaving(true);
    try {
      await SetVideoGames(selectedPaths, game);
      if (game) addRecentTag(game);
      setGame("");
      onTagsSaved();
    } catch (e) {
      console.error("Failed to save tags", e);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlaylist = async (pId: string, pTitle: string) => {
    setSavingPlaylist(true);
    try {
      await SetVideosPlaylist(selectedPaths, pId, pTitle);
      setSelectedPlaylistTitle(pTitle);
      setPlaylistSearch("");
      setIsDropdownOpen(false);
      setCreatingNew(false);
      onTagsSaved();
    } catch (e) {
      console.error("Failed to save playlist bulk", e);
    } finally {
      setSavingPlaylist(false);
    }
  };

  const handleCreateNewPlaylist = async () => {
    const title = newPlaylistTitle.trim();
    if (!title) return;
    setCreatingNewLoading(true);
    try {
      // Create the playlist on YouTube (unlisted by default)
      const newId = await CreatePlaylist(title, "", "unlisted");
      if (newId) {
        // Immediately assign selected videos to the new playlist
        await handleSavePlaylist(newId, title);
        setNewPlaylistTitle("");
        setCreatingNew(false);
      }
    } catch (e) {
      console.error("Failed to create playlist", e);
    } finally {
      setCreatingNewLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await DeleteFiles(selectedPaths);
      onFilesDeleted();
    } catch (e: any) {
      alert(e?.message || e || "Failed to delete files");
      console.error("Failed to delete files", e);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleAddAllToQueue = () => {
    if (selectedVideos.length === 0) return;
    const first = selectedVideos[0];
    const rest = selectedVideos.slice(1).sort((a, b) => a.modTime - b.modTime);
    const orderedVideos = [first, ...rest];

    const items: QueueItem[] = orderedVideos
      .filter((v) => !v.youtubeId)
      .map((v) => ({
        id: crypto.randomUUID(),
        videoPath: v.path,
        videoName: v.name,
        title: v.youtubeTitle || generateYouTubeTitle(v.name, v.game, v.episode),
        description: v.description || "",
        privacy: (v.privacy as "public" | "unlisted" | "private") || "unlisted",
        status: "pending" as const,
        progress: 0,
        playlistId: v.playlistId || "",
        gameTag: v.game || "",
        episode: v.episode || 0,
      }));

    if (items.length === 0) return;
    onAddToQueue(items);
    onClearSelection();
  };

  const uploadableCount = selectedVideos.filter((v) => !v.youtubeId).length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") onClearSelection();
  };

  const filteredPlaylists = playlists.filter((p) =>
    p.title.toLowerCase().includes(playlistSearch.toLowerCase())
  );

  return (
    <div className="w-full bg-elevated border-b border-border-medium z-40 px-4 py-2 flex items-center justify-between animate-fadeIn shrink-0">
      {/* Left: selection count + clear */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
            <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
          </svg>
          <span>{selectedPaths.length} selected</span>
        </div>
        <button
          className="flex items-center gap-1 px-1.5 py-0.5 bg-transparent border-none text-[10px] text-text-secondary cursor-pointer rounded-sm hover:bg-black/20 hover:text-text-primary transition-colors font-medium"
          onClick={onClearSelection}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
          Clear
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Tag action */}
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6, flexShrink: 0 }}>
            <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
          </svg>
          <TagInput
            value={game}
            onChange={setGame}
            onEnter={handleSave}
            disabled={saving}
            className="w-[160px] bg-black/30 border border-white/10 rounded-sm px-2 py-1.5 text-xs text-text-primary outline-none transition-colors hover:border-white/20 focus:border-accent focus:bg-black/50"
          />
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !game.trim()}>
            {saving ? "Saving..." : "Apply Tag"}
          </button>
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* Playlist action */}
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6, flexShrink: 0 }}>
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>

          {/* Show selected playlist as a chip, or the trigger button */}
          {selectedPlaylistTitle ? (
            <div className="flex items-center gap-1 h-[26px] px-2 bg-accent/15 border border-accent/30 rounded-sm text-[11px] font-medium text-accent max-w-[180px]">
              <span className="truncate">{selectedPlaylistTitle}</span>
              <button
                className="ml-1 p-0 bg-transparent border-none text-accent/70 hover:text-accent cursor-pointer leading-none shrink-0"
                onClick={() => { setSelectedPlaylistTitle(""); setPlaylistSearch(""); }}
                title="Change playlist"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                ref={playlistInputRef}
                type="text"
                className="w-[160px] bg-black/30 border border-white/10 rounded-sm px-2 py-1.5 text-xs text-text-primary outline-none transition-colors hover:border-white/20 focus:border-accent focus:bg-black/50"
                placeholder={savingPlaylist ? "Applying..." : `Playlist (${defaultSearch || "search..."})` }
                value={playlistSearch}
                onChange={(e) => {
                  setPlaylistSearch(e.target.value);
                  setCreatingNew(false);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                disabled={savingPlaylist}
              />

              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-elevated border border-border-medium rounded-md shadow-2xl z-[60] max-h-60 overflow-y-auto custom-scrollbar animate-fadeIn">
                  {/* ── Existing playlists ─────────────────────────────── */}
                  {filteredPlaylists.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-[11px] text-text-primary hover:bg-accent/10 transition-colors border-none bg-transparent cursor-pointer flex items-center justify-between"
                      onClick={() => handleSavePlaylist(p.id, p.title)}
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="text-[9px] text-text-muted ml-2 shrink-0">{p.videoCount} videos</span>
                    </button>
                  ))}

                  {/* ── Create new playlist ─────────────────────────────── */}
                  <div className="border-t border-border-subtle">
                    {!creatingNew ? (
                      <button
                        className="w-full text-left px-3 py-2 text-[11px] font-bold text-accent hover:bg-accent/10 transition-colors border-none bg-transparent cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setCreatingNew(true);
                          // Pre-fill with current search or game tag
                          setNewPlaylistTitle(playlistSearch || defaultSearch);
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
                        </svg>
                        {playlistSearch ? `Create "${playlistSearch}"` : "Create new playlist"}
                      </button>
                    ) : (
                      <div className="px-3 py-2 flex items-center gap-2">
                        <input
                          ref={newPlaylistInputRef}
                          type="text"
                          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                          placeholder="Playlist name..."
                          value={newPlaylistTitle}
                          onChange={(e) => setNewPlaylistTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateNewPlaylist();
                            if (e.key === "Escape") setCreatingNew(false);
                          }}
                        />
                        <button
                          className="btn btn-primary btn-sm shrink-0"
                          onClick={handleCreateNewPlaylist}
                          disabled={creatingNewLoading || !newPlaylistTitle.trim()}
                        >
                          {creatingNewLoading ? "..." : "Create"}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm shrink-0"
                          onClick={() => setCreatingNew(false)}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {filteredPlaylists.length === 0 && !creatingNew && (
                    <p className="px-3 py-2 text-[10px] text-text-muted text-center">No playlists match</p>
                  )}
                </div>
              )}

              {/* Click-outside dismissal */}
              {isDropdownOpen && (
                <div
                  className="fixed inset-0 z-[55]"
                  onClick={() => { setIsDropdownOpen(false); setCreatingNew(false); }}
                />
              )}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* Bulk queue action */}
        {uploadableCount > 0 && (
          <>
            <button
              className="btn btn-ghost btn-sm flex items-center gap-1.5"
              onClick={handleAddAllToQueue}
              title={`Add ${uploadableCount} video${uploadableCount > 1 ? "s" : ""} to upload queue`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
              </svg>
              Queue {uploadableCount}
            </button>
            <div className="w-px h-5 bg-white/10" />
          </>
        )}

        {/* Delete action */}
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400 font-medium">
              Delete {selectedPaths.length} file{selectedPaths.length > 1 ? "s" : ""}?
            </span>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-sm hover:!text-red-400 hover:!border-red-400/30 hover:!bg-red-500/10"
            onClick={handleDelete}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
