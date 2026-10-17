import { useSteamGameData } from "../../hooks/useSteamGameData";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";
import { getGameColor } from "../../utils/tagColors";

export interface TopGameHighlightProps {
  readonly game: {
    readonly game: string;
    readonly hours: number;
  };
  readonly rank: number;
  readonly totalPeriodHours?: number;
  readonly activeDays?: number;
  readonly periodLabel?: "month" | "year";
}

export function TopGameHighlight({
  game,
  rank,
  totalPeriodHours,
  activeDays,
  periodLabel = "month",
}: TopGameHighlightProps) {
  const { appId, posterUrl, achievementsPct } = useSteamGameData(game.game);
  const gameColor = getGameColor(game.game);

  const sharePct =
    totalPeriodHours && totalPeriodHours > 0
      ? Math.round((game.hours / totalPeriodHours) * 100)
      : null;
  const hasActiveDays = Boolean(activeDays && activeDays > 0);
  const hasSpotlightMetrics = sharePct !== null || hasActiveDays;

  const activePoster =
    posterUrl ||
    (appId
      ? `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`
      : "");

  return (
    <div className="relative w-full max-w-[220px] aspect-[2/3] rounded-xl overflow-hidden border border-border-subtle shadow-xs group bg-surface">
      {/* Background Poster */}
      {activePoster || appId ? (
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-102"
          style={{ backgroundImage: `url('${activePoster}')` }}
        />
      ) : (
        <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center p-4 text-center opacity-50">
          <span className="text-3xl font-black text-text-muted/30 mb-2">
            #{rank}
          </span>
          <span className="text-sm font-bold text-white">{game.game}</span>
        </div>
      )}

      {/* Gradient Overlay for bottom text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/75 via-35% to-transparent opacity-95 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3 flex flex-col gap-1 z-10">
        <span
          data-testid="highlight-rank-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface/85 border w-fit backdrop-blur-md"
          style={{ borderColor: gameColor }}
        >
          <span
            data-testid="highlight-rank-dot"
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: gameColor }}
          />
          <span
            className="text-[9px] font-bold tracking-wider"
            style={{ color: gameColor }}
          >
            {rank === 1 ? "Top played" : `#${rank} selected`}
          </span>
        </span>
        <h4
          style={{ color: "#ffffff" }}
          className="text-xs sm:text-sm font-bold leading-tight line-clamp-2"
        >
          {game.game}
        </h4>

        <div className="flex items-baseline justify-between gap-1">
          <span
            style={{ color: "#ffffff" }}
            className="text-base sm:text-lg font-bold tabular-nums"
          >
            {formatPlaytimeHoursMinutes(game.hours)}
          </span>
        </div>

        {hasSpotlightMetrics && (
          <div
            data-testid="highlight-spotlight-metrics"
            className="text-[10px] font-medium text-text-secondary tabular-nums flex items-center gap-1 leading-tight flex-wrap"
          >
            {sharePct !== null && (
              <span>
                {sharePct}% of {periodLabel}
              </span>
            )}
            {sharePct !== null && hasActiveDays && (
              <span aria-hidden="true">·</span>
            )}
            {hasActiveDays && (
              <span>
                {activeDays} {activeDays === 1 ? "day" : "days"} played
              </span>
            )}
          </div>
        )}

        {/* Achievements */}
        {achievementsPct > 0 && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-1000 ease-out"
                style={{ width: `${achievementsPct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-emerald-400 tabular-nums">
              {Math.round(achievementsPct)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
