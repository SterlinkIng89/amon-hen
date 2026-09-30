import React, { useState, useEffect, useMemo } from "react";
import {
  GetChannelPlaylists,
  GetOrCreatePlaylist,
  SetTagPlaylist,
  SetTagPlaylistConfig,
  LoadConfig,
} from "../../../wailsjs/go/backend/App";
import { YTPlaylist, PlaylistPrivacy } from "../../types";
import { useAppStore } from "../../store/useAppStore";

interface Props {
  tag: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function TagPlaylistModal({ tag, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<"vod" | "clip">("vod");
  const [vodPlaylistId, setVodPlaylistId] = useState("");
  const [clipPlaylistId, setClipPlaylistId] = useState("");
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState(tag); // default to tag name
  const [privacy, setPrivacy] = useState<PlaylistPrivacy>(
    () => useAppStore.getState().defaultPlaylistPrivacy,
  );
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [error, setError] = useState("");

  const handlePrivacyChange = (newPrivacy: PlaylistPrivacy) => {
    setPrivacy(newPrivacy);
    useAppStore.setState({ defaultPlaylistPrivacy: newPrivacy });
  };

  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        const tagCfg = cfg.tag_playlist_configs?.[tag];
        const legacyVod = cfg.tag_playlists?.[tag];
        let initialVod = "";
        let initialClip = "";
        if (tagCfg?.vod_playlist_id && tagCfg.vod_playlist_id !== "none") {
          initialVod = tagCfg.vod_playlist_id;
        } else if (legacyVod && legacyVod !== "none") {
          initialVod = legacyVod;
        }
        if (tagCfg?.clip_playlist_id && tagCfg.clip_playlist_id !== "none") {
          initialClip = tagCfg.clip_playlist_id;
        }
        setVodPlaylistId(initialVod);
        setClipPlaylistId(initialClip);
        setSelectedPlaylistId(initialVod);
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

  const handleTabChange = (tab: "vod" | "clip") => {
    setActiveTab(tab);
    setSearchQuery("");
    setError("");
    if (tab === "vod") {
      setNewPlaylistTitle(tag);
      setSelectedPlaylistId(
        vodPlaylistId && vodPlaylistId !== "none" ? vodPlaylistId : "",
      );
    } else {
      setNewPlaylistTitle(`${tag} Clips`);
      setSelectedPlaylistId(
        clipPlaylistId && clipPlaylistId !== "none" ? clipPlaylistId : "",
      );
    }
  };

  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true }),
    );
  }, [playlists]);

  const filteredPlaylists = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedPlaylists;
    return sortedPlaylists.filter((p) => p.title.toLowerCase().includes(query));
  }, [sortedPlaylists, searchQuery]);

  useEffect(() => {
    if (
      selectedPlaylistId &&
      !filteredPlaylists.some((p) => p.id === selectedPlaylistId)
    ) {
      setSelectedPlaylistId("");
    }
  }, [filteredPlaylists, selectedPlaylistId]);

  const currentLinkedId = activeTab === "vod" ? vodPlaylistId : clipPlaylistId;
  const currentLinkedPlaylist = playlists.find((p) => p.id === currentLinkedId);

  const handleCreateAndLink = async () => {
    if (!newPlaylistTitle.trim()) return;
    setIsCreating(true);
    setError("");
    try {
      useAppStore.setState({ defaultPlaylistPrivacy: privacy });
      const id = await GetOrCreatePlaylist(
        newPlaylistTitle.trim(),
        "",
        privacy,
      );
      if (activeTab === "vod") {
        setVodPlaylistId(id);
        await SetTagPlaylistConfig(tag, id, clipPlaylistId);
        await SetTagPlaylist(tag, id);
      } else {
        setClipPlaylistId(id);
        await SetTagPlaylistConfig(tag, vodPlaylistId, id);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setIsCreating(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!selectedPlaylistId) return;
    setIsCreating(true);
    setError("");
    try {
      if (activeTab === "vod") {
        setVodPlaylistId(selectedPlaylistId);
        await SetTagPlaylistConfig(tag, selectedPlaylistId, clipPlaylistId);
        await SetTagPlaylist(tag, selectedPlaylistId);
      } else {
        setClipPlaylistId(selectedPlaylistId);
        await SetTagPlaylistConfig(tag, vodPlaylistId, selectedPlaylistId);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setIsCreating(false);
    }
  };

  const handleUnlinkCurrent = async () => {
    setIsCreating(true);
    setError("");
    try {
      if (activeTab === "vod") {
        setVodPlaylistId("");
        setSelectedPlaylistId("");
        await SetTagPlaylistConfig(tag, "", clipPlaylistId);
        await SetTagPlaylist(tag, "");
      } else {
        setClipPlaylistId("");
        setSelectedPlaylistId("");
        await SetTagPlaylistConfig(tag, vodPlaylistId, "");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border-subtle rounded-lg shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <div>
          <h2 className="text-lg font-bold text-text-primary m-0">
            Link Playlist to Tag
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Configure YouTube playlist destinations for tag <strong>"{tag}"</strong> for both full VODs and short clips.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-border-subtle gap-2">
          <button
            type="button"
            className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === "vod"
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
            onClick={() => handleTabChange("vod")}
          >
            <span>VOD Playlist</span>
            {vodPlaylistId && vodPlaylistId !== "none" && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
          <button
            type="button"
            className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === "clip"
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
            onClick={() => handleTabChange("clip")}
          >
            <span>Clip Playlist</span>
            {clipPlaylistId && clipPlaylistId !== "none" && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            )}
          </button>
        </div>

        {currentLinkedPlaylist && (
          <div className="flex items-center justify-between px-3 py-2 rounded bg-card border border-border-subtle text-xs">
            <span className="text-text-secondary truncate">
              Linked {activeTab === "vod" ? "VOD" : "Clip"}:{" "}
              <strong className="text-text-primary">{currentLinkedPlaylist.title}</strong>
            </span>
            <button
              type="button"
              className="text-[11px] text-red-400 hover:text-red-300 ml-2 underline cursor-pointer"
              onClick={handleUnlinkCurrent}
              disabled={isCreating}
            >
              Unlink
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Skip option */}
        <button
          className="flex items-center gap-2 w-full px-4 py-2 rounded-md border border-border-subtle bg-elevated hover:bg-card hover:border-border-medium transition-colors text-xs font-medium text-text-secondary hover:text-text-primary text-left"
          onClick={handleSkip}
          disabled={isCreating}
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
            className="shrink-0 text-text-muted"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <span>
            No playlist for <strong>"{tag}"</strong> — don't ask again
          </span>
        </button>

        <div className="flex items-center gap-4">
          <div className="h-px bg-border-subtle flex-1" />
          <span className="text-xs text-text-muted font-bold tracking-wider">
            or configure {activeTab === "vod" ? "VOD" : "clip"} playlist
          </span>
          <div className="h-px bg-border-subtle flex-1" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 p-3 border border-border-subtle rounded bg-elevated">
            <label className="text-xs font-bold text-text-secondary">
              Create New {activeTab === "vod" ? "VOD" : "Clip"} Playlist
            </label>
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
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[11px] text-text-muted mr-1 font-medium">
                Visibility:
              </span>
              {(["public", "unlisted", "private"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePrivacyChange(p)}
                  disabled={isCreating}
                  className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                    privacy === p
                      ? "bg-card border-accent text-accent"
                      : "bg-surface border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-medium"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 p-3 border border-border-subtle rounded bg-elevated">
            <label
              htmlFor="playlist-search-input"
              className="text-xs font-bold text-text-secondary"
            >
              Link Existing Playlist
            </label>
            <div className="relative flex items-center">
              <svg
                width="14"
                height="14"
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
                id="playlist-search-input"
                className="w-full h-[34px] bg-surface border border-border-subtle rounded-sm pl-8 pr-7 text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search playlists..."
                disabled={isLoading || isCreating}
                aria-label="Search playlists"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-xs text-text-muted hover:text-text-primary p-0.5"
                  aria-label="Clear playlist search"
                >
                  <svg
                    width="12"
                    height="12"
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
              )}
            </div>
            <div className="flex gap-2 items-center">
              <select
                className="flex-1 min-w-0 h-[38px] bg-surface border border-border-subtle rounded-sm px-2 text-sm text-text-primary outline-none focus:border-accent"
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
                disabled={
                  isLoading || isCreating || filteredPlaylists.length === 0
                }
                aria-label="Select playlist"
              >
                <option value="">
                  {isLoading
                    ? "Loading playlists..."
                    : filteredPlaylists.length === 0
                      ? "No playlists found..."
                      : "Select a playlist..."}
                </option>
                {filteredPlaylists.map((p) => (
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
