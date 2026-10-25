import { useState } from "react";
import {
  SaveGameProfile,
  DeleteGameProfile,
} from "../../../wailsjs/go/backend/App";
import { GameProfile } from "../../types";
import { generateYouTubeTitle } from "../../utils/videoUtils";

export interface SettingsGamesTabProps {
  readonly gameProfiles: Record<string, GameProfile>;
  readonly setGameProfiles: React.Dispatch<
    React.SetStateAction<Record<string, GameProfile>>
  >;
  readonly titleSeparator: string;
  readonly onOpenTagManagement?: () => void;
  readonly allTags?: string[];
  readonly recentTagSuggestions?: string[];
}

const TEMPLATE_VARIABLE_CHIPS = [
  "{game}",
  "{event}",
  "{gamemode}",
  "{date}",
  "{episode}",
] as const;

export function SettingsGamesTab({
  gameProfiles,
  setGameProfiles,
  titleSeparator,
  onOpenTagManagement,
  allTags,
  recentTagSuggestions,
}: SettingsGamesTabProps) {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    tag: string;
    profile: GameProfile;
    modesStr?: string;
  }>({ tag: "", profile: { type: "singleplayer", titleTemplate: "" } });
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<string | null>(null);

  const tagSuggestions = Array.from(
    new Set([...(recentTagSuggestions || []), ...(allTags || [])]),
  ).filter((tag) => Boolean(tag) && !gameProfiles[tag]);

  return (
    <>
      {/* Tag & Playlist Studio Launcher */}
      {onOpenTagManagement && (
        <div className="bg-elevated border border-border-subtle rounded-lg p-3 flex flex-col gap-2">
          <div>
            <p className="text-xs font-semibold text-text-primary">
              Tag & Playlist Studio
            </p>
            <p className="text-[10px] text-text-secondary">
              Configure Steam tags, playlists, and custom artwork in the dedicated Tag Studio.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm w-full flex items-center justify-center gap-1.5 cursor-pointer"
            onClick={onOpenTagManagement}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            Open Full Tag & Playlist Studio
          </button>
        </div>
      )}

      {/* Game Profiles section */}
      <section className="flex flex-col gap-4">
        <div className="text-xs font-semibold text-text-primary flex items-center justify-between border-b border-border-subtle pb-2 mb-2">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-text-muted"
            >
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 8 19.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
            </svg>
            Game Profiles
          </div>
          <button
            className="text-[10px] text-accent hover:text-white transition-colors cursor-pointer"
            onClick={() => {
              setEditingTag("");
              setEditForm({
                tag: "",
                profile: {
                  type: "multiplayer",
                  titleTemplate: "{event} - {gamemode} - {date}",
                },
                modesStr: "",
              });
            }}
          >
            + Add Profile
          </button>
        </div>

        {editingTag !== null && (
          <div className="bg-elevated border border-accent/30 rounded-md p-3 flex flex-col gap-3">
            <input
              type="text"
              list="game-tag-suggestions"
              placeholder="Game Tag (e.g. League of Legends)"
              className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
              value={editForm.tag}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, tag: e.target.value }))
              }
              disabled={editingTag !== ""}
            />
            {editingTag === "" && tagSuggestions.length > 0 && (
              <datalist id="game-tag-suggestions">
                {tagSuggestions.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            )}
            <select
              className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
              value={editForm.profile.type}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, type: e.target.value },
                }))
              }
            >
              <option value="singleplayer">
                Singleplayer (Episode counter)
              </option>
              <option value="multiplayer">
                Multiplayer (Custom template)
              </option>
            </select>
            {editForm.profile.type === "multiplayer" && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary">
                    Template Variables (click to insert):
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLE_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 border border-white/10 hover:bg-white/10 hover:border-accent text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                        onClick={() => {
                          setEditForm((prev) => {
                            const current = prev.profile.titleTemplate || "";
                            const needsSpace =
                              current.length > 0 &&
                              !current.endsWith(" ") &&
                              !current.endsWith("-");
                            return {
                              ...prev,
                              profile: {
                                ...prev.profile,
                                titleTemplate:
                                  current + (needsSpace ? " " : "") + chip,
                              },
                            };
                          });
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="e.g. {event} - {gamemode} - {date}"
                  className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
                  value={editForm.profile.titleTemplate}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      profile: {
                        ...prev.profile,
                        titleTemplate: e.target.value,
                      },
                    }))
                  }
                />

                <div
                  data-testid="profile-title-preview"
                  className="bg-black/40 border border-white/5 rounded p-2 text-xs flex flex-col gap-1"
                >
                  <span className="text-[10px] text-text-muted">
                    Live Title Preview
                  </span>
                  <span className="font-mono text-text-primary text-[11px] truncate">
                    {generateYouTubeTitle(
                      "2026-10-24.mp4",
                      editForm.tag || "Game Title",
                      1,
                      editForm.profile,
                      "Tournament",
                      editForm.modesStr?.split(",")[0]?.trim() || "Solo",
                      undefined,
                      undefined,
                      titleSeparator,
                    )}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 mt-1">
                  <label className="text-[10px] text-text-secondary">
                    Game Modes (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aram, Ranked, Normal"
                    className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    value={editForm.modesStr || ""}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        modesStr: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end mt-1">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingTag(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!editForm.tag.trim() || savingProfile}
                onClick={async () => {
                  setSavingProfile(true);
                  try {
                    const finalProfile = {
                      ...editForm.profile,
                      modes:
                        editForm.modesStr
                          ?.split(",")
                          .map((m) => m.trim())
                          .filter(Boolean) || [],
                    };
                    await SaveGameProfile(
                      editForm.tag.trim(),
                      finalProfile,
                    );
                    setGameProfiles((prev) => ({
                      ...prev,
                      [editForm.tag.trim()]: finalProfile,
                    }));
                    setEditingTag(null);
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setSavingProfile(false);
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {Object.entries(gameProfiles).length === 0 ? (
            <p className="text-[10px] text-text-muted text-center py-2">
              No custom profiles. Games default to Singleplayer.
            </p>
          ) : (
            Object.entries(gameProfiles).map(([tag, prof]) => (
              <div
                key={tag}
                className="flex items-center justify-between p-2.5 bg-elevated border border-border-subtle rounded-md group gap-2"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary truncate">
                      {tag}
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                        prof.type === "multiplayer"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      }`}
                    >
                      {prof.type === "multiplayer"
                        ? "Multiplayer"
                        : "Singleplayer"}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-secondary truncate mt-0.5">
                    {prof.type === "multiplayer"
                      ? `Template: ${prof.titleTemplate}`
                      : "Singleplayer Mode"}
                  </span>
                  {prof.modes && prof.modes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <span className="text-[10px] text-text-muted">Modes:</span>
                      {prof.modes.map((mode) => (
                        <span
                          key={mode}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-secondary"
                        >
                          {mode}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {deleteConfirmTag === tag ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-red-400 font-medium">
                      Delete?
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-red-400 hover:text-red-300 px-1.5 py-0.5"
                      onClick={async () => {
                        try {
                          await DeleteGameProfile(tag);
                          setGameProfiles((prev) => {
                            const next = { ...prev };
                            delete next[tag];
                            return next;
                          });
                          setDeleteConfirmTag(null);
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-text-secondary hover:text-text-primary px-1.5 py-0.5"
                      onClick={() => setDeleteConfirmTag(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      className="p-1 rounded text-text-muted hover:bg-white/10 hover:text-white cursor-pointer"
                      title={`Edit profile for ${tag}`}
                      aria-label={`Edit profile for ${tag}`}
                      onClick={() => {
                        setEditingTag(tag);
                        setEditForm({
                          tag,
                          profile: prof,
                          modesStr: prof.modes?.join(", ") || "",
                        });
                      }}
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
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded text-text-muted hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
                      title={`Delete profile for ${tag}`}
                      aria-label={`Delete profile for ${tag}`}
                      onClick={() => setDeleteConfirmTag(tag)}
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
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
