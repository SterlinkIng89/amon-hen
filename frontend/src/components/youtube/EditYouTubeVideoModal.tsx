import React, { useState, useEffect, useCallback, useRef } from "react";
import { YTVideo, YTPlaylist, TagPlaylistConfig } from "../../types";
import {
  UpdateYouTubeVideoMetadata,
  AddVideoToPlaylist,
  GetOrCreatePlaylist,
  SelectCustomThumbnailImage,
  UpdateYouTubeThumbnail,
  LoadConfig,
} from "../../../wailsjs/go/backend/App";
import { parseTagPlaylistConfigs } from "../../utils/tagConfigParser";
import YouTubeThumbnailPicker from "./YouTubeThumbnailPicker";

export interface EditYouTubeVideoModalProps {
  readonly video: YTVideo;
  readonly playlists: readonly YTPlaylist[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export default function EditYouTubeVideoModal({
  video,
  playlists,
  onClose,
  onSaved,
}: EditYouTubeVideoModalProps) {
  const [editableTitle, setEditableTitle] = useState(video.title);
  const [editableDescription, setEditableDescription] = useState(
    video.description || "",
  );
  const [editablePrivacy, setEditablePrivacy] = useState<string>(
    video.privacy || "unlisted",
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Playlists section state
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [isPlaylistActionLoading, setIsPlaylistActionLoading] = useState(false);
  const [playlistStatus, setPlaylistStatus] = useState("");
  const [playlistError, setPlaylistError] = useState("");

  // Thumbnail management state
  const [tagPlaylistConfigs, setTagPlaylistConfigs] = useState<
    Record<string, TagPlaylistConfig>
  >({});
  const [isUploadingCustom, setIsUploadingCustom] = useState(false);
  const [uploadCustomError, setUploadCustomError] = useState("");

  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        if (cfg) {
          const raw = cfg.tag_playlist_configs || {};
          const legacy = cfg.tag_playlists || {};
          setTagPlaylistConfigs(parseTagPlaylistConfigs(raw, legacy));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError("");

    try {
      await UpdateYouTubeVideoMetadata(
        video.id,
        editableTitle.trim(),
        editableDescription,
        editablePrivacy,
      );
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg.replace(/^Error:\s*/, ""));
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    video.id,
    editableTitle,
    editableDescription,
    editablePrivacy,
    onSaved,
    onClose,
  ]);

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

  const handleAddToPlaylist = async (playlistId: string, title: string) => {
    setIsPlaylistActionLoading(true);
    setPlaylistError("");
    setPlaylistStatus("");
    try {
      await AddVideoToPlaylist(playlistId, video.id);
      setPlaylistStatus(`Added to "${title}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlaylistError(msg.replace(/^Error:\s*/, ""));
    } finally {
      setIsPlaylistActionLoading(false);
    }
  };

  const handleCreateAndAddPlaylist = async () => {
    if (!newPlaylistTitle.trim() || isPlaylistActionLoading) return;
    setIsPlaylistActionLoading(true);
    setPlaylistError("");
    setPlaylistStatus("");
    try {
      const id = await GetOrCreatePlaylist(
        newPlaylistTitle.trim(),
        "",
        editablePrivacy,
      );
      await AddVideoToPlaylist(id, video.id);
      setPlaylistStatus(`Created and added to "${newPlaylistTitle.trim()}"`);
      setNewPlaylistTitle("");
      setIsCreatingPlaylist(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlaylistError(msg.replace(/^Error:\s*/, ""));
    } finally {
      setIsPlaylistActionLoading(false);
    }
  };

  const handleUploadCustomImage = async () => {
    setUploadCustomError("");
    try {
      const selected = await SelectCustomThumbnailImage();
      if (!selected) return;

      setIsUploadingCustom(true);
      await UpdateYouTubeThumbnail(video.id, selected);
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadCustomError(msg.replace(/^Error:\s*/, ""));
    } finally {
      setIsUploadingCustom(false);
    }
  };

  const filteredPlaylists = playlists.filter((p) =>
    p.title.toLowerCase().includes(playlistSearch.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="edit-youtube-modal-title"
        aria-modal="true"
        className="bg-elevated border border-border-medium rounded-xl shadow-sm w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle bg-surface/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2
                id="edit-youtube-modal-title"
                className="text-sm font-semibold text-text-primary truncate"
              >
                Edit Video Details
              </h2>
              <p className="text-xs text-text-muted font-mono truncate">
                ID: {video.id}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close dialog (Esc)"
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

        {/* Scrollable Body */}
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

          {/* Title & Privacy row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3 flex flex-col gap-1.5">
              <label
                htmlFor="edit-video-title"
                className="text-xs font-medium text-text-secondary"
              >
                Title
              </label>
              <input
                id="edit-video-title"
                type="text"
                className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
                placeholder="Enter video title"
                disabled={isSaving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="edit-video-privacy"
                className="text-xs font-medium text-text-secondary"
              >
                Privacy
              </label>
              <select
                id="edit-video-privacy"
                className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors cursor-pointer"
                value={editablePrivacy}
                onChange={(e) => setEditablePrivacy(e.target.value)}
                disabled={isSaving}
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-video-description"
              className="text-xs font-medium text-text-secondary"
            >
              Description
            </label>
            <textarea
              id="edit-video-description"
              rows={5}
              className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-text-primary outline-none focus:border-accent transition-colors resize-y custom-scrollbar font-sans"
              value={editableDescription}
              onChange={(e) => setEditableDescription(e.target.value)}
              placeholder="Enter video description"
              disabled={isSaving}
            />
          </div>

          {/* Playlists Assignment Accordion */}
          <div className="border border-border-subtle rounded-lg bg-surface/30 overflow-hidden">
            <button
              type="button"
              className="w-full p-3 flex items-center justify-between text-left hover:bg-surface/60 transition-colors"
              onClick={() => setShowPlaylists((prev) => !prev)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-text-muted"
                >
                  <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                </svg>
                <span className="text-xs font-medium text-text-primary">
                  Playlist Assignment
                </span>
                {video.playlistTitle && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-accent/10 text-accent font-medium truncate max-w-[200px]">
                    {video.playlistTitle}
                  </span>
                )}
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`text-text-muted transition-transform duration-200 ${
                  showPlaylists ? "rotate-180" : ""
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showPlaylists && (
              <div className="p-3 border-t border-border-subtle flex flex-col gap-3 bg-surface/40">
                {playlistStatus && (
                  <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                    {playlistStatus}
                  </div>
                )}
                {playlistError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
                    {playlistError}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    placeholder="Search playlists..."
                    value={playlistSearch}
                    onChange={(e) => setPlaylistSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-lg border border-border-subtle hover:bg-surface text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                    onClick={() => setIsCreatingPlaylist((prev) => !prev)}
                  >
                    {isCreatingPlaylist ? "Cancel" : "+ New"}
                  </button>
                </div>

                {isCreatingPlaylist && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface border border-border-subtle">
                    <input
                      type="text"
                      className="flex-1 bg-elevated border border-border-subtle rounded-md px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
                      placeholder="New playlist name..."
                      value={newPlaylistTitle}
                      onChange={(e) => setNewPlaylistTitle(e.target.value)}
                      disabled={isPlaylistActionLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateAndAddPlaylist();
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="px-3 py-1 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
                      onClick={handleCreateAndAddPlaylist}
                      disabled={
                        !newPlaylistTitle.trim() || isPlaylistActionLoading
                      }
                    >
                      {isPlaylistActionLoading ? "Adding..." : "Create & Add"}
                    </button>
                  </div>
                )}

                <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-lg border border-border-subtle bg-surface/30 divide-y divide-border-subtle">
                  {filteredPlaylists.length === 0 ? (
                    <div className="p-3 text-center text-xs text-text-muted">
                      No playlists found
                    </div>
                  ) : (
                    filteredPlaylists.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left p-2.5 hover:bg-surface flex items-center justify-between text-xs text-text-primary group transition-colors"
                        onClick={() => handleAddToPlaylist(p.id, p.title)}
                        disabled={isPlaylistActionLoading}
                      >
                        <span className="truncate flex-1 font-medium group-hover:text-accent">
                          {p.title}
                        </span>
                        <span className="text-[11px] text-text-muted ml-2 shrink-0">
                          {p.videoCount} videos
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Thumbnail Management Section */}
          <div className="border border-border-subtle rounded-lg bg-surface/30 p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary">
                Thumbnail Management
              </span>
              <button
                type="button"
                className="px-2.5 py-1 rounded-lg border border-border-subtle hover:bg-surface text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
                onClick={handleUploadCustomImage}
                disabled={isUploadingCustom}
              >
                {isUploadingCustom ? "Uploading..." : "Upload Image File..."}
              </button>
            </div>

            {uploadCustomError && (
              <p role="alert" className="text-xs text-red-400">
                {uploadCustomError}
              </p>
            )}

            <YouTubeThumbnailPicker
              videoPath={video.localFile || `yt:${video.id}`}
              gameTag={video.gameTag || ""}
              episodeNumber={video.episode || 1}
              tagThumbnailConfig={
                video.gameTag
                  ? tagPlaylistConfigs[video.gameTag]?.thumbnail_config
                  : undefined
              }
              youtubeId={video.id}
              onYouTubeUpdated={() => onSaved()}
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
              disabled={isSaving || !editableTitle.trim()}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
