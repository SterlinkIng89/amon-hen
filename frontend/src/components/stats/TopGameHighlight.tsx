import { useSteamGameData } from "../../hooks/useSteamGameData";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";

export interface TopGameHighlightProps {
  readonly game: {
    readonly game: string;
    readonly hours: number;
  };
  readonly rank: number;
}

export function TopGameHighlight({ game, rank }: TopGameHighlightProps) {
  const { appId, posterUrl, achievementsPct } = useSteamGameData(game.game);

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
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/85 via-45% to-transparent opacity-95 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 flex flex-col gap-1.5 z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/20 border border-accent/40 w-fit backdrop-blur-md mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[9px] font-bold tracking-wider text-accent">
            {rank === 1 ? "Top played" : `#${rank} selected`}
          </span>
        </span>
        <h4
          style={{ color: "#ffffff" }}
          className="text-sm sm:text-base font-bold leading-snug line-clamp-2"
        >
          {game.game}
        </h4>

        <div className="flex items-end mt-1">
          <span
            style={{ color: "#ffffff" }}
            className="text-lg sm:text-xl font-bold tabular-nums"
          >
            {formatPlaytimeHoursMinutes(game.hours)}
          </span>
        </div>

        {/* Achievements */}
        {achievementsPct > 0 && (
          <div className="flex items-center gap-2 mt-2">
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
