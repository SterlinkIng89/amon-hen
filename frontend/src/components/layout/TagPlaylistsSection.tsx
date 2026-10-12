import React, { useState, useEffect, useRef, useMemo } from "react";
import { YTPlaylist, TagThumbnailConfig, TagPlaylistConfig } from "../../types";
import { parseTagPlaylistConfigs } from "../../utils/tagConfigParser";
import {
  LoadConfig,
  SetTagPlaylist,
  SetTagThumbnailConfig,
} from "../../../wailsjs/go/backend/App";
import TagThumbnailConfigSection from "../ui/TagThumbnailConfigSection";

export interface TagPlaylistsSectionProps {
  readonly allTags: string[];
  readonly recentTagSuggestions: string[];
  readonly availablePlaylists: YTPlaylist[];
}

export default function TagPlaylistsSection({
  allTags,
  recentTagSuggestions,
  availablePlaylists,
}: TagPlaylistsSectionProps) {
  const [tagPlaylists, setTagPlaylists] = useState<Record<string, string>>({});
  const [tagPlaylistConfigs, setTagPlaylistConfigs] = useState<
    Record<string, TagPlaylistConfig>
  >({});
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedPlaylistForTag, setSelectedPlaylistForTag] = useState("none");
  const [tagPlaylistSaving, setTagPlaylistSaving] = useState<string | null>(
    null,
  );
  const [tagThumbConfig, setTagThumbConfig] = useState<
    TagThumbnailConfig | undefined
  >(undefined);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    LoadConfig()
      .then((cfg) => {
        setTagPlaylists(cfg.tag_playlists || {});
        setTagPlaylistConfigs(
          parseTagPlaylistConfigs(cfg.tag_playlist_configs, cfg.tag_playlists),
        );
      })
      .catch((err) => {
        console.error("Failed to load tag playlist configs", err);
      });
  }, []);

  const orderedTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const tag of recentTagSuggestions) {
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        list.push(tag);
      }
    }
    for (const tag of allTags) {
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        list.push(tag);
      }
    }
    return list;
  }, [recentTagSuggestions, allTags]);

  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return orderedTags;
    const q = tagSearchQuery.toLowerCase();
    return orderedTags.filter((t) => t.toLowerCase().includes(q));
  }, [orderedTags, tagSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(e.target as Node)
      ) {
        setIsTagDropdownOpen(false);
        if (selectedTag && tagSearchQuery !== selectedTag) {
          setTagSearchQuery(selectedTag);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedTag, tagSearchQuery]);

  const handleSelectTag = (tag: string) => {
    setSelectedTag(tag);
    setTagSearchQuery(tag);
    setIsTagDropdownOpen(false);
    if (tag) {
      setSelectedPlaylistForTag(tagPlaylists[tag] || "none");
      setTagThumbConfig(tagPlaylistConfigs[tag]?.thumbnail_config);
    }
  };

  const handleClearTag = () => {
    setSelectedTag("");
    setTagSearchQuery("");
    setIsTagDropdownOpen(false);
  };

  const handleSave = async () => {
    if (!selectedTag) return;
    setTagPlaylistSaving(selectedTag);
    try {
      await SetTagPlaylist(selectedTag, selectedPlaylistForTag);
      if (tagThumbConfig) {
        await SetTagThumbnailConfig(selectedTag, tagThumbConfig);
        setTagPlaylistConfigs((prev) => ({
          ...prev,
          [selectedTag]: {
            ...(prev[selectedTag] || {
              vod_playlist_id: selectedPlaylistForTag,
              clip_playlist_id: "",
            }),
            thumbnail_config: tagThumbConfig,
          },
        }));
      }
      setTagPlaylists((prev) => ({
        ...prev,
        [selectedTag]: selectedPlaylistForTag,
      }));
    } catch (err) {
      console.error("Error setting tag playlist/thumbnail config", err);
    } finally {
      setTagPlaylistSaving(null);
    }
  };

  return (
    <section className="border-b border-white/5 pb-4 last:border-0">
      <h3 className="text-sm font-semibold text-text-muted mb-3 px-2">
        Tag Playlists
      </h3>
      <div className="bg-elevated border border-border-subtle rounded-md p-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 relative" ref={tagDropdownRef}>
          <label className="text-xs font-medium text-text-secondary">
            Select Game Tag
          </label>
          <div className="relative flex items-center">
            <input
              type="text"
              className="w-full bg-[#141416] border border-white/10 rounded pl-2.5 pr-14 py-1.5 text-xs text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
              placeholder="Search or select game tag..."
              value={tagSearchQuery}
              onChange={(e) => {
                setTagSearchQuery(e.target.value);
                setIsTagDropdownOpen(true);
              }}
              onFocus={() => setIsTagDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filteredTags.length > 0) {
                    handleSelectTag(filteredTags[0]);
                  } else if (tagSearchQuery.trim()) {
                    handleSelectTag(tagSearchQuery.trim());
                  }
                } else if (e.key === "Escape") {
                  setIsTagDropdownOpen(false);
                }
              }}
            />

            <div className="absolute right-2 flex items-center gap-1">
              {tagSearchQuery && (
                <button
                  type="button"
                  onClick={handleClearTag}
                  className="text-text-muted hover:text-white transition-colors p-0.5 cursor-pointer"
                  title="Clear tag"
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
              <button
                type="button"
                onClick={() => setIsTagDropdownOpen((prev) => !prev)}
                className="text-text-muted hover:text-white transition-colors p-0.5 cursor-pointer"
                title="Toggle tags list"
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
                  className={`transition-transform duration-150 ${
                    isTagDropdownOpen ? "rotate-180" : ""
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>

          {isTagDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#141416] border border-white/10 rounded shadow-xl z-50 max-h-56 overflow-y-auto custom-scrollbar flex flex-col py-1">
              {filteredTags.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-muted">
                  No matching tags found.
                </div>
              ) : (
                filteredTags.map((tag) => {
                  const isLinked =
                    tagPlaylists[tag] && tagPlaylists[tag] !== "none";
                  const hasThumb =
                    tagPlaylistConfigs[tag]?.thumbnail_config?.enabled;
                  const isSelected = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "bg-accent/20 text-white font-medium"
                          : "text-text-primary hover:bg-white/5"
                      }`}
                      onClick={() => handleSelectTag(tag)}
                    >
                      <span className="truncate">{tag}</span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {hasThumb && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 font-medium">
                            Thumb
                          </span>
                        )}
                        {isLinked && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-accent/15 text-accent font-medium">
                            Linked
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}

              {tagSearchQuery.trim() &&
                !filteredTags.some(
                  (t) =>
                    t.toLowerCase() === tagSearchQuery.trim().toLowerCase(),
                ) && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-accent hover:bg-accent/10 border-t border-white/5 cursor-pointer font-medium"
                    onClick={() => handleSelectTag(tagSearchQuery.trim())}
                  >
                    + Use "{tagSearchQuery.trim()}"
                  </button>
                )}
            </div>
          )}
        </div>

        {selectedTag && (
          <div className="flex flex-col gap-3 pt-3 border-t border-white/5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Associated YouTube Playlist
              </label>
              <select
                style={{ backgroundColor: "#141416", color: "#f4f4f5" }}
                className="bg-[#141416] border border-white/10 rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
                value={selectedPlaylistForTag}
                onChange={(e) => setSelectedPlaylistForTag(e.target.value)}
              >
                <option
                  value="none"
                  style={{ backgroundColor: "#141416", color: "#71717a" }}
                >
                  No Playlist
                </option>
                {availablePlaylists.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    style={{ backgroundColor: "#141416", color: "#f4f4f5" }}
                  >
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            <TagThumbnailConfigSection
              tag={selectedTag}
              value={tagThumbConfig}
              onChange={setTagThumbConfig}
            />

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-text-muted truncate max-w-[200px]">
                {tagPlaylists[selectedTag] &&
                tagPlaylists[selectedTag] !== "none" ? (
                  <span>
                    Current:{" "}
                    <span className="text-accent">
                      {availablePlaylists.find(
                        (p) => p.id === tagPlaylists[selectedTag],
                      )?.title || tagPlaylists[selectedTag]}
                    </span>
                  </span>
                ) : (
                  <span>No playlist linked</span>
                )}
              </div>

              <button
                className="btn btn-primary btn-sm text-xs px-3"
                disabled={tagPlaylistSaving === selectedTag}
                onClick={handleSave}
              >
                {tagPlaylistSaving === selectedTag ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
