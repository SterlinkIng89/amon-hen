import { FC, useState } from "react";
import type { NormalizerRow, NormalizerRowStatus } from "../../../hooks/usePlaylistNormalizer";
import type { GameProfile, YTVideo } from "../../../types";
import { cleanThumbnailUrl } from "../../../utils/thumbnailGenerator";
import type { ExtractedTitleFields } from "../../../utils/titleNormalizer";
import { extractCustomVars } from "../../../utils/videoUtils";
import FieldInput from "../../ui/FieldInput";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const STATUS_DISPLAY: Record<
  NormalizerRowStatus,
  { readonly label: string; readonly className: string; readonly title?: string }
> = {
  ready: {
    label: "Ready",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  needs_review: {
    label: "Needs review",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  already_normalized: {
    label: "Normalized",
    className: "bg-elevated text-text-muted border-border-subtle",
    title: "Already normalized",
  },
  synced: {
    label: "Synced",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
};

export interface PlaylistNormalizerRowProps {
  readonly row: NormalizerRow;
  readonly activeProfile?: GameProfile;
  readonly isBatchRunning: boolean;
  readonly onUpdateField: (
    videoId: string,
    patch: Partial<ExtractedTitleFields> & { customVar?: { key: string; value: string } },
  ) => void;
  readonly onWatchVideo: (video: YTVideo) => void;
  readonly onSaveDraft: (videoId: string) => void;
  readonly onSyncRow: (videoId: string) => void;
}

export const PlaylistNormalizerRow: FC<PlaylistNormalizerRowProps> = ({
  row,
  activeProfile,
  isBatchRunning,
  onUpdateField,
  onWatchVideo,
  onSaveDraft,
  onSyncRow,
}) => {
  const [isBrokenThumb, setIsBrokenThumb] = useState(false);

  const { video, fields, proposedTitle, missingFields, status, isDirty, isSyncing, syncError } =
    row;
  const missingSet = new Set(missingFields.map((f) => f.toLowerCase()));
  const isMultiplayer = activeProfile?.type === "multiplayer";
  const template = activeProfile?.titleTemplate || "";
  const customVarNames = isMultiplayer ? extractCustomVars(template) : [];
  const showsEpisodeInMultiplayer = isMultiplayer && /\{episode\}/i.test(template);
  const disabled = isBatchRunning || isSyncing;

  const statusMeta = STATUS_DISPLAY[status];
  const canSync =
    !disabled &&
    status !== "already_normalized" &&
    status !== "synced" &&
    status !== "needs_review" &&
    Boolean(proposedTitle.trim());

  const inputBaseClass =
    "w-full bg-elevated border rounded-sm px-2 py-1 text-xs text-text-primary outline-none transition-colors focus:border-accent focus:bg-card disabled:opacity-50";

  const handleEpisodeChange = (raw: string) => {
    if (!raw) {
      onUpdateField(video.id, { episode: "" });
      return;
    }
    const parsed = parseInt(raw, 10);
    onUpdateField(video.id, {
      episode: !isNaN(parsed) && parsed > 0 ? parsed : "",
    });
  };

  const dateField = (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-text-muted">Date</span>
      <FieldInput
        fieldKey="date"
        value={fields.date}
        onChange={(val) => onUpdateField(video.id, { date: val, dateSource: "manual" })}
        placeholder="D/MM/YY"
        disabled={disabled}
        className={cn(
          inputBaseClass,
          "tabular-nums",
          missingSet.has("date") ? "border-amber-500/70" : "border-border-subtle",
        )}
      />
    </div>
  );

  const eventField = (placeholder: string, spanFull = false) => (
    <div className={cn("flex flex-col gap-0.5", spanFull && "sm:col-span-2")}>
      <span className="text-[10px] text-text-muted">Event</span>
      <FieldInput
        fieldKey="event"
        value={fields.event}
        onChange={(val) => onUpdateField(video.id, { event: val })}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          inputBaseClass,
          missingSet.has("event") ? "border-amber-500/70" : "border-border-subtle",
        )}
      />
    </div>
  );

  const episodeField = (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-text-muted">Episode</span>
      <input
        type="number"
        min={1}
        aria-label={`Episode for ${video.title}`}
        value={fields.episode}
        onChange={(e) => handleEpisodeChange(e.target.value)}
        placeholder="Ep"
        disabled={disabled}
        className={cn(
          inputBaseClass,
          "font-mono tabular-nums",
          missingSet.has("episode") ? "border-amber-500/70" : "border-border-subtle",
        )}
      />
    </div>
  );

  return (
    <tr
      data-testid={`normalizer-row-${video.id}`}
      className={cn(
        "hover:bg-elevated/30 transition-colors align-top",
        status === "needs_review" && "bg-amber-500/5",
        syncError && "bg-fire-dim/15",
      )}
    >
      {/* Thumbnail */}
      <td className="py-2.5 px-3 w-24 min-w-24">
        <div className="relative w-20 aspect-video rounded overflow-hidden border border-border-subtle bg-black/40 shrink-0">
          {video.thumbnailUrl && !isBrokenThumb ? (
            <img
              src={cleanThumbnailUrl(video.thumbnailUrl)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setIsBrokenThumb(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-text-muted font-mono">
              No thumb
            </div>
          )}
        </div>
      </td>

      {/* Original Title */}
      <td className="py-2.5 px-3 min-w-[180px] max-w-[260px]">
        <div className="text-xs font-medium text-text-primary break-words" title={video.title}>
          {video.title}
        </div>
        <div className="text-[10px] text-text-muted font-mono mt-0.5 truncate">{video.id}</div>
      </td>

      {/* Inline Editable Fields */}
      <td className="py-2.5 px-3 min-w-[320px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {isMultiplayer ? (
            <>
              {customVarNames.map((varName) => {
                const isMissing = missingSet.has(varName.toLowerCase());
                return (
                  <div key={varName} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-text-muted capitalize">{varName}</span>
                    <FieldInput
                      fieldKey={varName}
                      value={fields.customVars[varName] ?? ""}
                      onChange={(val) =>
                        onUpdateField(video.id, { customVar: { key: varName, value: val } })
                      }
                      placeholder={varName}
                      disabled={disabled}
                      className={cn(
                        inputBaseClass,
                        isMissing ? "border-amber-500/70" : "border-border-subtle",
                      )}
                    />
                  </div>
                );
              })}

              {eventField("Event")}

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted">Game mode</span>
                <FieldInput
                  fieldKey="gamemode"
                  value={fields.gameMode}
                  onChange={(val) => onUpdateField(video.id, { gameMode: val })}
                  placeholder="Mode"
                  disabled={disabled}
                  className={cn(
                    inputBaseClass,
                    missingSet.has("gamemode") ? "border-amber-500/70" : "border-border-subtle",
                  )}
                />
              </div>

              {dateField}
              {showsEpisodeInMultiplayer && episodeField}
            </>
          ) : (
            <>
              {dateField}
              {episodeField}
              {eventField("Event or clip title", true)}
            </>
          )}
        </div>
      </td>

      {/* Proposed Title Preview */}
      <td className="py-2.5 px-3 min-w-[200px] max-w-[280px]">
        <div
          className="text-xs text-text-primary font-medium break-words"
          title={proposedTitle || undefined}
        >
          {proposedTitle || <span className="text-text-muted">—</span>}
        </div>
        {missingFields.length > 0 && (
          <div className="text-[10px] text-amber-400 mt-1">
            Missing: {missingFields.join(", ")}
          </div>
        )}
        {syncError && (
          <div role="alert" className="text-[10px] text-red-400 mt-1 break-words">
            {syncError}
          </div>
        )}
      </td>

      {/* Status */}
      <td className="py-2.5 px-3 w-32 min-w-32 text-center">
        <span
          title={statusMeta.title}
          className={cn(
            "inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
            statusMeta.className,
          )}
        >
          {isSyncing ? "Syncing..." : statusMeta.label}
        </span>
      </td>

      {/* Actions */}
      <td className="py-2.5 px-3 w-44 min-w-44 text-right">
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onWatchVideo(video)}
            aria-label={`Watch ${video.title}`}
            className="px-2 py-1 rounded bg-elevated hover:bg-elevated/80 border border-border-subtle text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            Watch
          </button>
          <button
            type="button"
            onClick={() => onSaveDraft(video.id)}
            disabled={!isDirty || disabled}
            aria-label={`Save draft for ${video.title}`}
            className="px-2 py-1 rounded bg-elevated hover:bg-elevated/80 border border-border-subtle text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => onSyncRow(video.id)}
            disabled={!canSync}
            aria-label={`Sync ${video.title}`}
            className="px-2 py-1 rounded bg-accent/10 hover:bg-accent/20 border border-accent/30 text-[11px] font-medium text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Sync
          </button>
        </div>
      </td>
    </tr>
  );
};
