import React from "react";
import { EnrichedDailyCount } from "../../utils/gameStats";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";
import { getGameColor } from "../../utils/tagColors";

export interface HeatmapTooltipCardProps {
  readonly dateLabel: string;
  readonly entry: EnrichedDailyCount | null;
  readonly label: string;
}

export function HeatmapTooltipCard({
  dateLabel,
  entry,
  label,
}: HeatmapTooltipCardProps) {
  const count = entry?.count ?? 0;
  const totalHours = entry?.totalHours ?? 0;
  const games = entry?.games ?? [];
  const localCount = entry?.localCount ?? 0;
  const youtubeCount = entry?.youtubeCount ?? 0;

  return (
    <div className="px-3 py-2.5 rounded-lg bg-[#18181c] text-text-primary text-xs shadow-sm border border-[#26262b] min-w-[185px] max-w-[260px] flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-text-muted tabular-nums">
          {dateLabel}
        </span>
        {count > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-text-primary tabular-nums">
              {count} {label}
              {count === 1 ? "" : "s"}
            </span>
            {totalHours > 0 && (
              <span className="text-[11px] font-semibold text-accent tabular-nums">
                {formatPlaytimeHoursMinutes(totalHours)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs font-medium text-text-secondary">
            No {label}s on {dateLabel}
          </span>
        )}
      </div>

      {count > 0 && games.length > 0 && (
        <div className="flex flex-col gap-1 pt-1.5 border-t border-[#232328]">
          {games.slice(0, 4).map((g) => (
            <div
              key={g.game}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getGameColor(g.game) }}
                />
                <span className="text-[11px] font-medium text-text-primary truncate">
                  {g.game}
                </span>
              </div>
              <span className="text-[11px] text-text-secondary tabular-nums shrink-0">
                {g.count}x
                {g.hours > 0 ? ` · ${formatPlaytimeHoursMinutes(g.hours)}` : ""}
              </span>
            </div>
          ))}
          {games.length > 4 && (
            <span className="text-[10px] text-text-muted tabular-nums">
              +{games.length - 4} more games
            </span>
          )}
        </div>
      )}

      {count > 0 && (localCount > 0 || youtubeCount > 0) && (
        <div className="flex items-center gap-3 pt-1.5 border-t border-[#232328] text-[10px] text-text-muted tabular-nums">
          {localCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {localCount} Local
            </span>
          )}
          {youtubeCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              {youtubeCount} YouTube
            </span>
          )}
        </div>
      )}
    </div>
  );
}
