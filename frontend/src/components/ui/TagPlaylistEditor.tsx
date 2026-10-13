import React, { useState, useEffect, useMemo } from "react";
import {
  GetChannelPlaylists,
  GetOrCreatePlaylist,
  SetTagPlaylist,
  SetTagPlaylistConfig,
  SetTagThumbnailConfig,
  LoadConfig,
} from "../../../wailsjs/go/backend/App";
import { backend } from "../../../wailsjs/go/models";
import { YTPlaylist, PlaylistPrivacy, TagThumbnailConfig } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { parseTagPlaylistConfig } from "../../utils/tagConfigParser";
import TagThumbnailConfigSection from "./TagThumbnailConfigSection";

export interface TagPlaylistEditorProps {
  readonly tag: string;
  readonly onSaved: () => void;
  readonly onCancel?: () => void;
  readonly showCancel?: boolean;
}

export default function TagPlaylistEditor({
  tag,
  onSaved,
  onCancel,
  showCancel = false,
}: TagPlaylistEditorProps) {
  // Playlist State
  const [vodPlaylistId, setVodPlaylistId] = useState("");
  const [clipPlaylistId, setClipPlaylistId] = useState("");
  const [thumbConfig, setThumbConfig] = useState<
    TagThumbnailConfig | undefined
  >(undefined);
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  // VOD playlist section state
  const [selectedVodId, setSelectedVodId] = useState("");
  const [vodSearchQuery, setVodSearchQuery] = useState("");
  const [newVodTitle, setNewVodTitle] = useState(tag);
  const [vodPrivacy, setVodPrivacy] = useState<PlaylistPrivacy>(
    () => useAppStore.getState().defaultPlaylistPrivacy,
  );

  // Clip playlist section state
  const [selectedClipId, setSelectedClipId] = useState("");
  const [clipSearchQuery, setClipSearchQuery] = useState("");
  const [newClipTitle, setNewClipTitle] = useState(`${tag} Clips`);
  const [clipPrivacy, setClipPrivacy] = useState<PlaylistPrivacy>(
    () => useAppStore.getState().defaultPlaylistPrivacy,
  );

  useEffect(() => {
    setNewVodTitle(tag);
    setNewClipTitle(`${tag} Clips`);
    setError("");

    LoadConfig()
      .then((cfg) => {
        const parsed = parseTagPlaylistConfig(
          cfg.tag_playlist_configs?.[tag],
          cfg.tag_playlists?.[tag],
        );
        setVodPlaylistId(parsed.vod_playlist_id);
        setSelectedVodId(parsed.vod_playlist_id);
        setClipPlaylistId(parsed.clip_playlist_id);
        setSelectedClipId(parsed.clip_playlist_id);
        setThumbConfig(parsed.thumbnail_config);
      })
      .catch(console.error);

    GetChannelPlaylists("recent")
      .then((res) => {
        setPlaylists(res || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [tag]);

  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true }),
    );
  }, [playlists]);

  const filteredVodPlaylists = useMemo(() => {
    const query = vodSearchQuery.trim().toLowerCase();
    if (!query) return sortedPlaylists;
    return sortedPlaylists.filter((p) => p.title.toLowerCase().includes(query));
  }, [sortedPlaylists, vodSearchQuery]);

  const filteredClipPlaylists = useMemo(() => {
    const query = clipSearchQuery.trim().toLowerCase();
    if (!query) return sortedPlaylists;
    return sortedPlaylists.filter((p) => p.title.toLowerCase().includes(query));
  }, [sortedPlaylists, clipSearchQuery]);

  const currentVodPlaylist = playlists.find((p) => p.id === vodPlaylistId);
  const currentClipPlaylist = playlists.find((p) => p.id === clipPlaylistId);

  // Link / Create VOD Handlers
  const handleLinkVod = async () => {
    if (!selectedVodId) return;
    setIsCreating(true);
    setError("");
    try {
      setVodPlaylistId(selectedVodId);
      await SetTagPlaylistConfig(tag, selectedVodId, clipPlaylistId);
      await SetTagPlaylist(tag, selectedVodId);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateAndLinkVod = async () => {
    if (!newVodTitle.trim()) return;
    setIsCreating(true);
    setError("");
    try {
      useAppStore.setState({ defaultPlaylistPrivacy: vodPrivacy });
      const id = await GetOrCreatePlaylist(newVodTitle.trim(), "", vodPrivacy);
      setVodPlaylistId(id);
      setSelectedVodId(id);
      await SetTagPlaylistConfig(tag, id, clipPlaylistId);
      await SetTagPlaylist(tag, id);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleUnlinkVod = async () => {
    setIsCreating(true);
    setError("");
    try {
      setVodPlaylistId("");
      setSelectedVodId("");
      await SetTagPlaylistConfig(tag, "", clipPlaylistId);
      await SetTagPlaylist(tag, "");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  // Link / Create Clip Handlers
  const handleLinkClip = async () => {
    if (!selectedClipId) return;
    setIsCreating(true);
    setError("");
    try {
      setClipPlaylistId(selectedClipId);
      await SetTagPlaylistConfig(tag, vodPlaylistId, selectedClipId);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateAndLinkClip = async () => {
    if (!newClipTitle.trim()) return;
    setIsCreating(true);
    setError("");
    try {
      useAppStore.setState({ defaultPlaylistPrivacy: clipPrivacy });
      const id = await GetOrCreatePlaylist(
        newClipTitle.trim(),
        "",
        clipPrivacy,
      );
      setClipPlaylistId(id);
      setSelectedClipId(id);
      await SetTagPlaylistConfig(tag, vodPlaylistId, id);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleUnlinkClip = async () => {
    setIsCreating(true);
    setError("");
    try {
      setClipPlaylistId("");
      setSelectedClipId("");
      await SetTagPlaylistConfig(tag, vodPlaylistId, "");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  // Thumbnail handler
  const handleSaveThumbnail = async () => {
    setIsCreating(true);
    setError("");
    try {
      if (thumbConfig) {
        await SetTagThumbnailConfig(
          tag,
          backend.TagThumbnailConfig.createFrom(thumbConfig),
        );
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSkip = async () => {
    try {
      await SetTagPlaylistConfig(tag, "none", "none");
      await SetTagPlaylist(tag, "none");
    } catch (e) {
      console.error(e);
    }
    onSaved();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Tag Header & Skip */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
        <div>
          <h2 className="text-base font-bold text-text-primary m-0 flex items-center gap-2">
            Settings for{" "}
            <span data-testid="editor-tag-name" className="text-accent">
              "{tag}"
            </span>
          </h2>
        </div>

        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-subtle bg-elevated hover:bg-card hover:border-border-medium transition-colors text-xs font-medium text-text-secondary hover:text-text-primary cursor-pointer shrink-0"
          onClick={handleSkip}
          disabled={isCreating}
          title="Mark tag as having no playlist"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-text-muted"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <span>No playlist for "{tag}" — don't ask again</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-2.5 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Grid: VOD Playlist & Clip Playlist in one screen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ─── VOD Playlist Card ─── */}
        <div className="flex flex-col gap-3 p-4 border border-border-subtle rounded-lg bg-elevated/40">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text-primary m-0">
              VOD Playlist
            </h3>
            {currentVodPlaylist && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">
                Linked
              </span>
            )}
          </div>

          {currentVodPlaylist ? (
            <div className="flex items-center justify-between px-3 py-2 rounded bg-card border border-border-subtle text-xs">
              <span className="text-text-secondary truncate">
                Linked:{" "}
                <strong className="text-text-primary">
                  {currentVodPlaylist.title}
                </strong>
              </span>
              <button
                type="button"
                className="text-[11px] text-red-400 hover:text-red-300 ml-2 underline cursor-pointer"
                onClick={handleUnlinkVod}
                disabled={isCreating}
              >
                Unlink
              </button>
            </div>
          ) : (
            <div className="text-xs text-text-muted italic px-1">
              No VOD playlist linked currently.
            </div>
          )}

          {/* Link Existing VOD */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle">
            <label
              htmlFor="vod-playlist-search-input"
              className="text-xs font-bold text-text-secondary"
            >
              Link Existing Playlist
            </label>
            <div className="relative flex items-center">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-2.5 text-text-muted pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="vod-playlist-search-input"
                className="w-full h-[32px] bg-surface border border-border-subtle rounded pl-8 pr-7 text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                type="text"
                value={vodSearchQuery}
                onChange={(e) => setVodSearchQuery(e.target.value)}
                placeholder="Search playlists..."
                disabled={isLoading || isCreating}
                aria-label="Search playlists"
              />
              {vodSearchQuery && (
                <button
                  type="button"
                  onClick={() => setVodSearchQuery("")}
                  className="absolute right-2 text-xs text-text-muted hover:text-text-primary p-0.5 cursor-pointer"
                  aria-label="Clear playlist search"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <select
                className="flex-1 min-w-0 h-[34px] bg-surface border border-border-subtle rounded px-2 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
                value={selectedVodId}
                onChange={(e) => setSelectedVodId(e.target.value)}
                disabled={
                  isLoading || isCreating || filteredVodPlaylists.length === 0
                }
                aria-label="Select playlist"
              >
                <option value="">
                  {isLoading
                    ? "Loading playlists..."
                    : filteredVodPlaylists.length === 0
                      ? "No playlists found..."
                      : "Select a playlist..."}
                </option>
                {filteredVodPlaylists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary h-[34px] px-3 text-xs font-semibold whitespace-nowrap shrink-0"
                onClick={handleLinkVod}
                disabled={!selectedVodId || isCreating}
              >
                Link Selected
              </button>
            </div>
          </div>

          {/* Create New VOD */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle">
            <label className="text-xs font-bold text-text-secondary">
              Create New VOD Playlist
            </label>
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 min-w-0 h-[34px] bg-surface border border-border-subtle rounded px-2.5 text-xs text-text-primary outline-none focus:border-accent"
                type="text"
                value={newVodTitle}
                onChange={(e) => setNewVodTitle(e.target.value)}
                placeholder="Playlist name..."
                disabled={isCreating}
              />
              <button
                className="btn btn-primary h-[34px] px-3 text-xs font-semibold whitespace-nowrap shrink-0"
                onClick={handleCreateAndLinkVod}
                disabled={!newVodTitle.trim() || isCreating}
              >
                Create & Link
              </button>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-text-muted mr-1 font-medium">
                Visibility:
              </span>
              {(["public", "unlisted", "private"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setVodPrivacy(p);
                    useAppStore.setState({ defaultPlaylistPrivacy: p });
                  }}
                  disabled={isCreating}
                  className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors cursor-pointer ${
                    vodPrivacy === p
                      ? "bg-card border-accent text-accent"
                      : "bg-surface border-border-subtle text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Clip Playlist Card ─── */}
        <div className="flex flex-col gap-3 p-4 border border-border-subtle rounded-lg bg-elevated/40">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text-primary m-0">
              Clip Playlist
            </h3>
            {currentClipPlaylist && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-semibold">
                Linked
              </span>
            )}
          </div>

          {currentClipPlaylist ? (
            <div className="flex items-center justify-between px-3 py-2 rounded bg-card border border-border-subtle text-xs">
              <span className="text-text-secondary truncate">
                Linked:{" "}
                <strong className="text-text-primary">
                  {currentClipPlaylist.title}
                </strong>
              </span>
              <button
                type="button"
                className="text-[11px] text-red-400 hover:text-red-300 ml-2 underline cursor-pointer"
                onClick={handleUnlinkClip}
                disabled={isCreating}
              >
                Unlink
              </button>
            </div>
          ) : (
            <div className="text-xs text-text-muted italic px-1">
              No Clip playlist linked currently.
            </div>
          )}

          {/* Link Existing Clip */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle">
            <label
              htmlFor="clip-playlist-search-input"
              className="text-xs font-bold text-text-secondary"
            >
              Link Existing Playlist
            </label>
            <div className="relative flex items-center">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-2.5 text-text-muted pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="clip-playlist-search-input"
                className="w-full h-[32px] bg-surface border border-border-subtle rounded pl-8 pr-7 text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                type="text"
                value={clipSearchQuery}
                onChange={(e) => setClipSearchQuery(e.target.value)}
                placeholder="Search playlists..."
                disabled={isLoading || isCreating}
                aria-label="Search clip playlists"
              />
              {clipSearchQuery && (
                <button
                  type="button"
                  onClick={() => setClipSearchQuery("")}
                  className="absolute right-2 text-xs text-text-muted hover:text-text-primary p-0.5 cursor-pointer"
                  aria-label="Clear playlist search"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <select
                className="flex-1 min-w-0 h-[34px] bg-surface border border-border-subtle rounded px-2 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
                value={selectedClipId}
                onChange={(e) => setSelectedClipId(e.target.value)}
                disabled={
                  isLoading || isCreating || filteredClipPlaylists.length === 0
                }
                aria-label="Select clip playlist"
              >
                <option value="">
                  {isLoading
                    ? "Loading playlists..."
                    : filteredClipPlaylists.length === 0
                      ? "No playlists found..."
                      : "Select a playlist..."}
                </option>
                {filteredClipPlaylists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary h-[34px] px-3 text-xs font-semibold whitespace-nowrap shrink-0"
                onClick={handleLinkClip}
                disabled={!selectedClipId || isCreating}
              >
                Link Clip
              </button>
            </div>
          </div>

          {/* Create New Clip */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle">
            <label className="text-xs font-bold text-text-secondary">
              Create New Clip Playlist
            </label>
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 min-w-0 h-[34px] bg-surface border border-border-subtle rounded px-2.5 text-xs text-text-primary outline-none focus:border-accent"
                type="text"
                value={newClipTitle}
                onChange={(e) => setNewClipTitle(e.target.value)}
                placeholder="Clip playlist name..."
                disabled={isCreating}
              />
              <button
                className="btn btn-primary h-[34px] px-3 text-xs font-semibold whitespace-nowrap shrink-0"
                onClick={handleCreateAndLinkClip}
                disabled={!newClipTitle.trim() || isCreating}
              >
                Create & Link
              </button>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-text-muted mr-1 font-medium">
                Visibility:
              </span>
              {(["public", "unlisted", "private"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setClipPrivacy(p);
                    useAppStore.setState({ defaultPlaylistPrivacy: p });
                  }}
                  disabled={isCreating}
                  className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors cursor-pointer ${
                    clipPrivacy === p
                      ? "bg-card border-accent text-accent"
                      : "bg-surface border-border-subtle text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Thumbnail Automation Section ─── */}
      <div className="flex flex-col gap-3 p-4 border border-border-subtle rounded-lg bg-elevated/40">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
          <h3 className="text-xs font-semibold text-text-primary m-0">
            Thumbnail Template
          </h3>
          <button
            type="button"
            className="btn btn-primary btn-sm px-4 text-xs font-semibold"
            onClick={handleSaveThumbnail}
            disabled={isCreating}
          >
            {isCreating ? "Saving..." : "Save Thumbnail Template"}
          </button>
        </div>

        <TagThumbnailConfigSection
          tag={tag}
          value={thumbConfig}
          onChange={setThumbConfig}
        />
      </div>

      {showCancel && onCancel && (
        <div className="flex justify-end pt-2 border-t border-border-subtle">
          <button
            className="btn btn-ghost btn-sm text-text-muted hover:text-text-primary"
            onClick={onCancel}
            disabled={isCreating}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
