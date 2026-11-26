import React, { useState, useEffect, useCallback } from "react";
import type { YTVideo, GameProfile } from "../../types";
import {
  GetTitleNormalizationDraft,
  SaveTitleNormalizationDraft,
  MarkTitleNormalizationDraftSynced,
  UpdateYouTubeVideoMetadata,
  UpdateYouTubeVideoGameMeta,
} from "../../../wailsjs/go/backend/App";
import { backend } from "../../../wailsjs/go/models";
import {
  extractNormalizedFields,
  evaluateNormalizedTitle,
  type ExtractedTitleFields,
  type DateSource,
} from "../../utils/titleNormalizer";
import { extractCustomVars } from "../../utils/videoUtils";
import { useRecentFieldValues } from "../../hooks/useRecentFieldValues";
import FieldInput from "../ui/FieldInput";
import TagInput from "../ui/TagInput";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface TitleNormalizerPanelProps {
  readonly video: YTVideo;
  readonly playlistId?: string;
  readonly gameProfiles: Record<string, GameProfile>;
  readonly recentFieldValues?: Record<string, string[]>;
  readonly titleSeparator?: string;
  readonly defaultGameTag?: string;
  readonly onSynced: (
    videoId: string,
    newTitle: string,
    gameTag: string,
    episode: number,
  ) => void;
  readonly onSyncAndNext?: () => void;
  readonly hasNext?: boolean;
}

type ActionState =
  | { kind: "idle" }
  | { kind: "saving_draft" }
  | { kind: "syncing" }
  | { kind: "draft_saved" }
  | { kind: "synced" }
  | { kind: "error"; message: string };

const DATE_SOURCE_LABELS: Record<DateSource, string> = {
  title: "From title",
  published: "From upload",
  manual: "Manual",
};

const EMPTY_FIELDS: ExtractedTitleFields = {
  event: "",
  gameMode: "",
  date: "",
  dateSource: "manual",
  episode: "",
  customVars: {},
};

/**
 * Profile-aware title normalization form with SQLite draft persistence and
 * direct YouTube metadata synchronization.
 */
export default function TitleNormalizerPanel({
  video,
  playlistId,
  gameProfiles,
  recentFieldValues,
  titleSeparator,
  defaultGameTag,
  onSynced,
  onSyncAndNext,
  hasNext = false,
}: TitleNormalizerPanelProps) {
  const { addRecentValue } = useRecentFieldValues();

  const initialTag = video.gameTag || defaultGameTag || "";
  const [gameTag, setGameTag] = useState<string>(initialTag);
  const [fields, setFields] = useState<ExtractedTitleFields>(EMPTY_FIELDS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setActionState({ kind: "idle" });

    const fallbackTag = video.gameTag || defaultGameTag || "";

    const loadDraftOrExtract = async () => {
      try {
        const draft = await GetTitleNormalizationDraft(video.id);
        if (cancelled) return;

        if (draft && draft.videoId) {
          const resolvedTag = draft.gameTag || fallbackTag;
          setGameTag(resolvedTag);
          setFields({
            event: draft.event || "",
            gameMode: draft.gameMode || "",
            date: draft.dateOverride || "",
            dateSource: draft.dateOverride ? "manual" : "published",
            episode:
              typeof draft.episode === "number" && draft.episode > 0
                ? draft.episode
                : "",
            customVars: draft.customVars ? { ...draft.customVars } : {},
          });
          setIsLoading(false);
          return;
        }
      } catch {
        // Fall through to auto-extraction when no draft exists or lookup fails
      }

      if (cancelled) return;

      const resolvedProfile = fallbackTag
        ? gameProfiles[fallbackTag]
        : undefined;
      const extracted = extractNormalizedFields({
        currentTitle: video.title,
        publishedAt: video.publishedAt,
        gameTag: fallbackTag,
        profile: resolvedProfile,
        titleSeparator,
        recentFieldValues,
      });

      setGameTag(fallbackTag);
      setFields(extracted);
      setIsLoading(false);
    };

    loadDraftOrExtract();

    return () => {
      cancelled = true;
    };
  }, [
    video.id,
    video.title,
    video.publishedAt,
    video.gameTag,
    defaultGameTag,
    gameProfiles,
    titleSeparator,
    recentFieldValues,
  ]);

  const activeProfile = gameTag ? gameProfiles[gameTag] : undefined;
  const isMultiplayer = activeProfile?.type === "multiplayer";
  const customVarNames = isMultiplayer
    ? extractCustomVars(activeProfile.titleTemplate || "")
    : [];

  const evaluation = evaluateNormalizedTitle(video.title, fields, {
    gameTag,
    profile: activeProfile,
    titleSeparator,
  });

  const missingSet = new Set(evaluation.missingFields);
  const isBusy =
    actionState.kind === "saving_draft" || actionState.kind === "syncing";

  const episodeNumber =
    typeof fields.episode === "number" && fields.episode > 0
      ? fields.episode
      : 0;

  const handleSaveDraft = useCallback(async () => {
    if (isBusy) return;
    setActionState({ kind: "saving_draft" });
    try {
      const draftPayload = backend.TitleNormalizationDraft.createFrom({
        videoId: video.id,
        playlistId: playlistId || "",
        gameTag,
        profileType: activeProfile?.type || "singleplayer",
        event: fields.event,
        gameMode: fields.gameMode,
        dateOverride: fields.date,
        episode: episodeNumber,
        customVars: fields.customVars,
        proposedTitle: evaluation.proposedTitle,
        status: evaluation.status,
        updatedAt: Date.now(),
      });
      await SaveTitleNormalizationDraft(draftPayload);
      setActionState({ kind: "draft_saved" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionState({
        kind: "error",
        message: message || "Failed to save draft",
      });
    }
  }, [
    isBusy,
    video.id,
    playlistId,
    gameTag,
    activeProfile?.type,
    fields,
    episodeNumber,
    evaluation.proposedTitle,
    evaluation.status,
  ]);

  const performSync = useCallback(
    async (advanceAfter: boolean) => {
      if (isBusy) return;
      setActionState({ kind: "syncing" });
      try {
        const nextTitle = evaluation.proposedTitle;
        await UpdateYouTubeVideoMetadata(
          video.id,
          nextTitle,
          video.description,
          video.privacy,
        );
        await Promise.all([
          UpdateYouTubeVideoGameMeta(video.id, gameTag, episodeNumber),
          MarkTitleNormalizationDraftSynced(video.id, nextTitle),
        ]);

        for (const varName of customVarNames) {
          const val = fields.customVars[varName]?.trim();
          if (val) {
            addRecentValue(varName, val);
          }
        }

        setActionState({ kind: "synced" });
        onSynced(video.id, nextTitle, gameTag, episodeNumber);

        if (advanceAfter && hasNext && onSyncAndNext) {
          onSyncAndNext();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setActionState({
          kind: "error",
          message: message || "Failed to sync to YouTube",
        });
      }
    },
    [
      isBusy,
      evaluation.proposedTitle,
      video.id,
      video.description,
      video.privacy,
      gameTag,
      episodeNumber,
      customVarNames,
      fields.customVars,
      addRecentValue,
      onSynced,
      hasNext,
      onSyncAndNext,
    ],
  );

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      performSync(true);
    }
  };

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-3 p-3 rounded-lg bg-[#141416] border border-white/10"
        aria-busy="true"
        aria-label="Loading title normalizer"
      >
        <div className="h-4 w-36 rounded bg-white/10 animate-pulse" />
        <div className="h-9 w-full rounded bg-white/10 animate-pulse" />
        <div className="h-9 w-full rounded bg-white/10 animate-pulse" />
        <div className="h-14 w-full rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  const dateField = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="normalizer-date-input"
          className="text-xs font-medium text-white/75"
        >
          Date
        </label>
        <span className="px-1.5 py-0.5 rounded-sm bg-white/10 text-[11px] font-medium text-white/75">
          {DATE_SOURCE_LABELS[fields.dateSource]}
        </span>
      </div>
      <input
        id="normalizer-date-input"
        type="text"
        value={fields.date}
        onChange={(e) =>
          setFields((prev) => ({
            ...prev,
            date: e.target.value,
            dateSource: "manual",
          }))
        }
        placeholder="D/MM/YY"
        disabled={isBusy}
        className={cn(
          "w-full bg-[#272727] border rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] transition-colors tabular-nums",
          missingSet.has("date") ? "border-amber-500/70" : "border-white/10",
        )}
      />
    </div>
  );

  return (
    <div
      className="flex flex-col gap-3.5 p-3.5 rounded-lg bg-[#141416] border border-white/10 text-white"
      onKeyDown={handlePanelKeyDown}
    >
      {/* Profile & Game Tag */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="normalizer-profile-select"
            className="text-xs font-medium text-white/75"
          >
            Profile
          </label>
          <select
            id="normalizer-profile-select"
            aria-label="Profile"
            className="w-full bg-[#272727] border border-white/10 rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] cursor-pointer"
            value={Object.keys(gameProfiles).includes(gameTag) ? gameTag : ""}
            onChange={(e) => setGameTag(e.target.value)}
            disabled={isBusy}
          >
            <option value="">Singleplayer</option>
            {Object.keys(gameProfiles).map((pTag) => (
              <option key={pTag} value={pTag}>
                {pTag}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="normalizer-game-tag"
            className="text-xs font-medium text-white/75"
          >
            Game tag
          </label>
          <div
            className={cn(
              Object.keys(gameProfiles).includes(gameTag) &&
                "opacity-50 pointer-events-none",
            )}
          >
            <TagInput
              value={gameTag}
              onChange={(val) => setGameTag(val)}
              disabled={isBusy || Object.keys(gameProfiles).includes(gameTag)}
            />
          </div>
        </div>
      </div>

      {/* Mode-specific fields */}
      {isMultiplayer ? (
        <div className="flex flex-col gap-3">
          {customVarNames.map((varName) => {
            const isMissing = missingSet.has(varName.toLowerCase());
            const dateField = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="normalizer-date-input"
          className="text-xs font-medium text-white/75"
        >
          Date
        </label>
        <span className="px-1.5 py-0.5 rounded-sm bg-white/10 text-[11px] font-medium text-white/75">
          {DATE_SOURCE_LABELS[fields.dateSource]}
        </span>
      </div>
      <input
        id="normalizer-date-input"
        type="text"
        value={fields.date}
        onChange={(e) =>
          setFields((prev) => ({
            ...prev,
            date: e.target.value,
            dateSource: "manual",
          }))
        }
        placeholder="D/MM/YY"
        disabled={isBusy}
        className={cn(
          "w-full bg-[#272727] border rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] transition-colors tabular-nums",
          missingSet.has("date") ? "border-amber-500/70" : "border-white/10",
        )}
      />
    </div>
  );

  return (
              <div key={varName} className="flex flex-col gap-1.5">
                <label
                  htmlFor={`normalizer-var-${varName}`}
                  className="text-xs font-medium text-white/75 capitalize"
                >
                  {varName}
                </label>
                <FieldInput
                  fieldKey={varName}
                  value={fields.customVars[varName] || ""}
                  onChange={(val) =>
                    setFields((prev) => ({
                      ...prev,
                      customVars: { ...prev.customVars, [varName]: val },
                    }))
                  }
                  placeholder={`Enter ${varName}...`}
                  disabled={isBusy}
                  className={cn(
                    "w-full bg-[#272727] border rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] transition-colors",
                    isMissing ? "border-amber-500/70" : "border-white/10",
                  )}
                />
              </div>
            );
          })}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="normalizer-event-input"
              className="text-xs font-medium text-white/75"
            >
              Event
            </label>
            <input
              id="normalizer-event-input"
              type="text"
              value={fields.event}
              onChange={(e) =>
                setFields((prev) => ({ ...prev, event: e.target.value }))
              }
              placeholder="Match highlight or event..."
              disabled={isBusy}
              className={cn(
                "w-full bg-[#272727] border rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] transition-colors",
                missingSet.has("event")
                  ? "border-amber-500/70"
                  : "border-white/10",
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="normalizer-gamemode-input"
                className="text-xs font-medium text-white/75"
              >
                Game mode
              </label>
              {activeProfile.modes && activeProfile.modes.length > 0 ? (
                <select
                  id="normalizer-gamemode-input"
                  aria-label="Game mode"
                  value={fields.gameMode}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, gameMode: e.target.value }))
                  }
                  disabled={isBusy}
                  className={cn(
                    "w-full bg-[#272727] border rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] cursor-pointer",
                    missingSet.has("gamemode")
                      ? "border-amber-500/70"
                      : "border-white/10",
                  )}
                >
                  <option value="">Select mode...</option>
                  {activeProfile.modes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="normalizer-gamemode-input"
                  type="text"
                  value={fields.gameMode}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, gameMode: e.target.value }))
                  }
                  placeholder="Game mode..."
                  disabled={isBusy}
                  className={cn(
                    "w-full bg-[#272727] border rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] transition-colors",
                    missingSet.has("gamemode")
                      ? "border-amber-500/70"
                      : "border-white/10",
                  )}
                />
              )}
            </div>

            {dateField}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="normalizer-episode-input"
                className="text-xs font-medium text-white/75"
              >
                Episode
              </label>
              <input
                id="normalizer-episode-input"
                type="number"
                min={1}
                value={fields.episode}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setFields((prev) => ({ ...prev, episode: "" }));
                    return;
                  }
                  const num = parseInt(raw, 10);
                  if (!isNaN(num)) {
                    setFields((prev) => ({ ...prev, episode: num }));
                  }
                }}
                placeholder="Episode #"
                disabled={isBusy}
                className={cn(
                  "w-full bg-[#272727] border rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] transition-colors tabular-nums",
                  missingSet.has("episode")
                    ? "border-amber-500/70"
                    : "border-white/10",
                )}
              />
            </div>

            {dateField}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="normalizer-event-input"
              className="text-xs font-medium text-white/75"
            >
              Subtitle (optional)
            </label>
            <input
              id="normalizer-event-input"
              type="text"
              value={fields.event}
              onChange={(e) =>
                setFields((prev) => ({ ...prev, event: e.target.value }))
              }
              placeholder="Optional episode subtitle..."
              disabled={isBusy}
              className="w-full bg-[#272727] border border-white/10 rounded-sm px-2.5 py-2 text-sm text-white outline-none focus:border-[#3ea6ff] transition-colors"
            />
          </div>
        </div>
      )}

      {/* Before -> After Live Preview */}
      <div className="flex flex-col gap-1.5 p-2.5 rounded-md bg-[#0f0f0f] border border-white/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/60">
            Title preview
          </span>
          {evaluation.missingFields.length > 0 && (
            <span className="text-xs font-medium text-amber-400">
              Missing: {evaluation.missingFields.join(", ")}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="text-white/50 truncate" title={video.title}>
            <span className="text-white/40 mr-1.5">Before:</span>
            {video.title}
          </div>
          <div
            className="text-sm font-medium text-white break-words"
            data-testid="normalizer-proposed-title"
          >
            <span className="text-xs font-normal text-[#3ea6ff] mr-1.5">
              After:
            </span>
            {evaluation.proposedTitle || "—"}
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {actionState.kind === "error" && (
        <p
          role="alert"
          className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-2.5 py-1.5"
        >
          {actionState.message}
        </p>
      )}
      {actionState.kind === "draft_saved" && (
        <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-sm px-2.5 py-1.5">
          Draft saved locally.
        </p>
      )}
      {actionState.kind === "synced" && (
        <p className="text-xs text-[#3ea6ff] bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 rounded-sm px-2.5 py-1.5">
          Synced to YouTube.
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isBusy}
          className="px-3 py-1.5 rounded-sm text-xs font-medium bg-[#272727] border border-white/15 text-white hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ea6ff]"
        >
          {actionState.kind === "saving_draft" ? "Saving..." : "Save Draft"}
        </button>

        <button
          type="button"
          onClick={() => performSync(false)}
          disabled={isBusy || !evaluation.proposedTitle}
          className="px-3 py-1.5 rounded-sm text-xs font-medium bg-white/10 border border-white/15 text-white hover:bg-white/20 disabled:opacity-50 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ea6ff]"
        >
          {actionState.kind === "syncing" ? "Syncing..." : "Sync to YouTube"}
        </button>

        {hasNext && onSyncAndNext && (
          <button
            type="button"
            onClick={() => performSync(true)}
            disabled={isBusy || !evaluation.proposedTitle}
            title="Sync to YouTube and advance to next video (Ctrl+Enter)"
            className="ml-auto px-3 py-1.5 rounded-sm text-xs font-semibold bg-[#3ea6ff] text-black hover:bg-[#65b8ff] disabled:opacity-50 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Sync & Next
          </button>
        )}
      </div>
    </div>
  );
}
