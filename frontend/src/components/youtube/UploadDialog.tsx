import { useState, useEffect } from "react";
import { VideoFile, YTPlaylist } from "../../types";
import { generateYouTubeTitle } from "../../utils/videoUtils";
import { QueueItem } from "./UploadQueue";
import {
  GetChannelPlaylists,
  GetOrCreatePlaylist,
} from "../../../wailsjs/go/backend/App";

export interface UploadOptions {
  title: string;
  description: string;
  privacy: "public" | "unlisted" | "private";
  playlistId?: string;
}

interface Props {
  video: VideoFile;
  /** Current status of this file in the queue, if any */
  queueStatus?: QueueItem["status"];
  onClose: () => void;
  onUploadNow: (opts: UploadOptions) => void;
  onAddToQueue: (opts: UploadOptions) => void;
}

export default function UploadDialog({
  video,
  queueStatus,
  onClose,
  onUploadNow,
  onAddToQueue,
}: Props) {
  // Block uploading the same file while it is already active
  const isAlreadyActive =
    queueStatus === "pending" ||
    queueStatus === "uploading" ||
    queueStatus === "processing";
  const [title, setTitle] = useState(
    video.youtubeTitle || generateYouTubeTitle(video.name, video.game),
  );
  const [description, setDescription] = useState(video.description || "");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">(
    (video.privacy as "public" | "unlisted" | "private") || "unlisted",
  );
  const [playlistId, setPlaylistId] = useState(video.playlistId || "");
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState("");

  const refreshPlaylists = () =>
    GetChannelPlaylists("recent")
      .then(setPlaylists)
      .catch(() => {});

  useEffect(() => {
    refreshPlaylists();
  }, []);

  useEffect(() => {
    if (playlistId && playlists.length > 0) {
      const p = playlists.find(p => p.id === playlistId);
      if (p) setPlaylistSearch(p.title);
    }
  }, [playlists, playlistId]);

  const handleCreatePlaylist = async () => {
    if (!newPlaylistTitle.trim()) return;
    setIsCreatingPlaylist(true);
    setPlaylistError("");
    try {
      const id = await GetOrCreatePlaylist(newPlaylistTitle.trim(), "", privacy);
      // Refresh from DB — the backend already persisted the playlist row
      await refreshPlaylists();
      setNewPlaylistTitle("");
      setIsCreating(false);
      setPlaylistId(id);
      setPlaylistSearch(newPlaylistTitle.trim());
    } catch (e: any) {
      setPlaylistError(e?.toString() ?? "Failed to get or create playlist");
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const opts = (): UploadOptions => ({
    title,
    description,
    privacy,
    playlistId,
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] bg-card border border-border-subtle rounded-md shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface">
          <h3 className="m-0 text-base font-bold text-text-primary">
            Upload to YouTube
          </h3>
          <button
            className="p-1 bg-transparent border-none text-text-secondary cursor-pointer rounded-sm hover:bg-black/10 hover:text-text-primary transition-colors flex items-center justify-center"
            onClick={onClose}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <div className="p-5 pb-40 flex flex-col gap-4">
          <p
            className="m-0 text-xs font-mono text-text-muted p-2 bg-elevated rounded-sm border border-border-subtle break-words"
            title={video.name}
          >
            {video.name}
          </p>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-xs font-bold text-text-secondary">
              Title
            </label>
            <input
              className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Video title"
              maxLength={100}
            />
            <span className="absolute top-0 right-0 text-[10px] text-text-muted font-medium">
              {title.length}/100
            </span>
            <span className="text-[10px] text-text-muted mt-0.5">
              Pattern: <em>Game - YYYY MM DD - Ep#</em>
            </span>
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-xs font-bold text-text-secondary">
              Description
            </label>
            <textarea
              className="w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)] resize-y min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              maxLength={5000}
            />
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary">
                Add to Playlist (Optional)
              </label>
              <button
                className="text-[10px] font-bold text-accent hover:underline bg-transparent border-none cursor-pointer"
                onClick={() => { setIsCreating(!isCreating); setPlaylistError(""); }}
              >
                {isCreating ? "Cancel" : "+ Get or create"}
              </button>
            </div>

            {isCreating ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-elevated border border-accent rounded-sm px-3 py-2 text-sm text-text-primary outline-none focus:bg-card"
                    type="text"
                    value={newPlaylistTitle}
                    onChange={(e) => setNewPlaylistTitle(e.target.value)}
                    placeholder="Playlist name..."
                    autoFocus
                    disabled={isCreatingPlaylist}
                    onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
                  />
                  <button
                    className="btn btn-primary btn-sm px-4 min-w-[80px]"
                    onClick={handleCreatePlaylist}
                    disabled={!newPlaylistTitle.trim() || isCreatingPlaylist}
                  >
                    {isCreatingPlaylist ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : "Get or create"}
                  </button>
                </div>
                <span className="text-[10px] text-text-muted">
                  If a playlist with this name already exists on your channel, it will be reused.
                </span>
                {playlistError && (
                  <span className="text-[10px] text-red-400 font-medium">{playlistError}</span>
                )}
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <input
                    className="w-full bg-elevated border border-border-subtle rounded-sm pl-9 pr-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card"
                    type="text"
                    value={playlistSearch}
                    onChange={(e) => {
                      setPlaylistSearch(e.target.value);
                      setIsDropdownOpen(true);
                      if (!e.target.value) setPlaylistId("");
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder={
                      playlistId
                        ? playlists.find((p) => p.id === playlistId)?.title
                        : "Search or select playlist..."
                    }
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
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
                  {playlistId && (
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer p-1"
                      onClick={() => {
                        setPlaylistId("");
                        setPlaylistSearch("");
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  )}
                </div>

                {isDropdownOpen && (
                  <div className="absolute left-0 right-0 bottom-full mb-1 bg-card border border-border-medium rounded-sm shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar animate-fadeIn">
                    {playlists
                      .filter((p) =>
                        p.title
                          .toLowerCase()
                          .includes(playlistSearch.toLowerCase()),
                      )
                      .map((p) => (
                        <button
                          key={p.id}
                          className={`w-full text-left px-3 py-2.5 hover:bg-accent/10 transition-colors flex items-center justify-between group ${playlistId === p.id ? "bg-accent/5 text-accent" : "text-text-primary"}`}
                          onClick={() => {
                            setPlaylistId(p.id);
                            setPlaylistSearch(p.title);
                            setIsDropdownOpen(false);
                          }}
                        >
                          <div className="flex items-center justify-between w-full min-w-0 gap-3">
                            <span className="text-xs font-bold truncate flex-1">
                              {p.title}
                            </span>
                            <span className="text-[10px] text-text-muted whitespace-nowrap">
                              {p.videoCount} videos
                            </span>
                          </div>
                          {playlistId === p.id && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-accent"
                            >
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </button>
                      ))}
                    {playlists.filter((p) =>
                      p.title
                        .toLowerCase()
                        .includes(playlistSearch.toLowerCase()),
                    ).length === 0 && (
                      <div className="p-4 text-center text-xs text-text-muted">
                        No playlists found
                      </div>
                    )}
                  </div>
                )}
                {/* Click outside to close */}
                {isDropdownOpen && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-xs font-bold text-text-secondary">
              Privacy
            </label>
            <div className="flex gap-2">
              {(["public", "unlisted", "private"] as const).map((p) => (
                <button
                  key={p}
                  className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-sm text-xs font-semibold cursor-pointer transition-colors ${privacy === p ? "bg-accent text-white border border-accent hover:bg-accent" : "bg-elevated border border-border-subtle text-text-secondary hover:bg-card hover:border-border-medium hover:text-text-primary"}`}
                  onClick={() => setPrivacy(p)}
                >
                  {p === "public" && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                  )}
                  {p === "unlisted" && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </svg>
                  )}
                  {p === "private" && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                    </svg>
                  )}
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Duplicate warning banner */}
        {isAlreadyActive && (
          <div className="mx-4 mb-3 flex items-start gap-2.5 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-sm animate-fadeIn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400 shrink-0 mt-0.5">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-yellow-400">
                {queueStatus === "uploading" ? "Upload already in progress" : "Already in queue"}
              </span>
              <span className="text-[11px] text-yellow-400/70">
                This file is {queueStatus === "uploading" ? "currently being uploaded" : "already waiting in the queue"}. Remove it from the queue first to avoid duplicates.
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border-subtle bg-surface">
          <button
            className="btn btn-ghost"
            disabled={isAlreadyActive}
            onClick={() => {
              onAddToQueue(opts());
              onClose();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
            </svg>
            Add to Queue
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onUploadNow(opts());
              onClose();
            }}
            disabled={!title.trim() || isAlreadyActive}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
            </svg>
            Upload Now
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
