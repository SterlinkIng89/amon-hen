import React, { useState, useMemo, useEffect } from "react";
import { useTagConfigs } from "../../hooks/useTagConfigs";
import { useRecentTags } from "../../hooks/useRecentTags";
import TagPlaylistEditor from "./TagPlaylistEditor";

export interface TagManagementModalProps {
  readonly onClose: () => void;
}

export default function TagManagementModal({ onClose }: TagManagementModalProps) {
  const { allTags, configs, legacyPlaylists, isLoading, reload } = useTagConfigs();
  const { suggestions: recentTags } = useRecentTags();

  const [selectedTag, setSelectedTag] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Ordered list prioritizing recent tags, followed by all library tags
  const orderedTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];

    for (const t of recentTags) {
      if (t && !seen.has(t)) {
        seen.add(t);
        list.push(t);
      }
    }

    for (const t of allTags) {
      if (t && !seen.has(t)) {
        seen.add(t);
        list.push(t);
      }
    }

    return list;
  }, [recentTags, allTags]);

  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orderedTags;
    return orderedTags.filter((t) => t.toLowerCase().includes(q));
  }, [orderedTags, searchQuery]);

  // Automatically select the first available tag if none is selected
  useEffect(() => {
    if (!selectedTag && orderedTags.length > 0) {
      setSelectedTag(orderedTags[0]);
    }
  }, [selectedTag, orderedTags]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCreateNewTag = (tagName: string) => {
    const clean = tagName.trim();
    if (!clean) return;
    setSelectedTag(clean);
    setSearchQuery("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border-subtle rounded-xl shadow-2xl w-[85vw] xl:w-[70vw] 2xl:w-[50vw] max-w-[1480px] min-w-[900px] h-[82vh] min-h-[680px] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
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
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary m-0">
                Tag Settings & Playlists
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface/50 transition-colors cursor-pointer"
            onClick={onClose}
            aria-label="Close modal"
          >
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body - 2 Columns */}
        <div className="flex flex-1 min-h-0">
          {/* Left Column: Tag List */}
          <div className="w-80 border-r border-border-subtle flex flex-col bg-elevated/20 shrink-0">
            <div className="p-3 border-b border-border-subtle">
              <div className="relative flex items-center">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-2.5 text-text-muted pointer-events-none"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface border border-border-subtle rounded-md pl-8 pr-7 py-1.5 text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                  aria-label="Search tags"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-text-muted hover:text-text-primary p-0.5 cursor-pointer"
                    aria-label="Clear tag search"
                  >
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
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* List of tags */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {isLoading ? (
                <div className="p-4 text-xs text-text-muted text-center">
                  Loading tags...
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="p-4 flex flex-col items-center gap-2 text-center">
                  <span className="text-xs text-text-muted">No tags found.</span>
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => handleCreateNewTag(searchQuery)}
                      className="text-xs text-accent hover:underline cursor-pointer font-medium"
                    >
                      + Add "{searchQuery.trim()}"
                    </button>
                  )}
                </div>
              ) : (
                filteredTags.map((t) => {
                  const isSelected = selectedTag === t;
                  const cfg = configs[t];
                  const hasVod =
                    Boolean(cfg?.vod_playlist_id && cfg.vod_playlist_id !== "none") ||
                    Boolean(legacyPlaylists[t] && legacyPlaylists[t] !== "none");
                  const hasClip = Boolean(cfg?.clip_playlist_id && cfg.clip_playlist_id !== "none");
                  const hasThumb = Boolean(cfg?.thumbnail_config?.enabled);

                  return (
                    <button
                      key={t}
                      type="button"
                      data-testid={`tag-item-${t}`}
                      onClick={() => setSelectedTag(t)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer group ${
                        isSelected
                          ? "bg-accent/15 text-white font-medium border border-accent/30"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface/80 border border-transparent"
                      }`}
                    >
                      <span className="truncate mr-2">{t}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasThumb && (
                          <span
                            className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-semibold"
                            title="Thumbnail automated"
                          >
                            Thumb
                          </span>
                        )}
                        {hasClip && (
                          <span
                            className="text-[9px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 font-semibold"
                            title="Clip playlist configured"
                          >
                            Clip
                          </span>
                        )}
                        {hasVod && (
                          <span
                            className="text-[9px] px-1 py-0.2 rounded bg-accent/15 text-accent font-semibold"
                            title="VOD playlist configured"
                          >
                            VOD
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Tag Settings Editor */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-surface">
            {selectedTag ? (
              <TagPlaylistEditor
                key={selectedTag}
                tag={selectedTag}
                onSaved={() => reload()}
                showCancel={false}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-text-muted">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-40 mb-3"
                >
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                <p className="text-sm font-medium text-text-secondary">
                  No tag selected
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Choose a tag from the left column to configure its settings.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
