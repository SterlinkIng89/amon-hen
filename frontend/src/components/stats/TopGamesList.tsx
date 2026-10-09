import { useMemo } from "react";
import { useSteamGameData } from "../../hooks/useSteamGameData";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";
import { assignGameColors } from "../../utils/gameStats";

export interface GameListItem {
  readonly game: string;
  readonly hours: number;
}

export interface TopGamesListProps {
  readonly games: readonly GameListItem[];
  readonly selectedGameName: string | null;
  readonly onSelectGame: (game: string) => void;
  readonly maxHours: number;
  readonly listTitle: string;
}

interface GameRowItemProps {
  readonly game: string;
  readonly hours: number;
  readonly rank: number;
  readonly isSelected: boolean;
  readonly maxHours: number;
  readonly color: string;
  readonly onSelect: (game: string) => void;
}

function GameRowItem({
  game,
  hours,
  rank,
  isSelected,
  maxHours,
  color,
  onSelect,
}: GameRowItemProps) {
  const { posterUrl } = useSteamGameData(game);
  const progressPct = maxHours > 0 ? (hours / maxHours) * 100 : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(game)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(game);
        }
      }}
      className={`group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        isSelected
          ? "border-accent bg-surface/80"
          : "border-border-subtle bg-surface/30 hover:border-border-medium hover:bg-surface/50"
      }`}
    >
      {/* Left: Thumbnail + Name */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
        {/* Cover thumbnail */}
        <div className="w-8 h-12 rounded-sm overflow-hidden bg-surface shrink-0 border border-border-subtle flex items-center justify-center relative">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-[10px] font-bold text-text-muted">
              {game.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {/* Name and Progress bar */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span
            className={`text-xs font-semibold truncate ${
              isSelected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
            }`}
            title={game}
          >
            {game}
          </span>

          {/* Thin progress bar colored matching game chart color */}
          <div className="h-1 w-full max-w-[160px] bg-border-subtle rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      </div>

      {/* Right: Hours + Rank */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-bold text-text-primary tabular-nums">
          {formatPlaytimeHoursMinutes(hours)}
        </span>
        <span className="text-[10px] font-bold text-text-muted/70 w-4 text-right tabular-nums">
          {rank}
        </span>
      </div>
    </div>
  );
}

export function TopGamesList({
  games,
  selectedGameName,
  onSelectGame,
  maxHours,
  listTitle,
}: TopGamesListProps) {
  const topNames = useMemo(() => games.map((g) => g.game), [games]);
  const colorMap = useMemo(() => assignGameColors(topNames), [topNames]);

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <h3 className="text-xs font-bold text-text-secondary">{listTitle}</h3>

      {games.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center gap-1 text-text-muted border border-dashed border-border-subtle rounded-lg">
          <p className="text-xs">No playtime recorded</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
          {games.map((g, idx) => (
            <GameRowItem
              key={g.game}
              game={g.game}
              hours={g.hours}
              rank={idx + 1}
              isSelected={g.game === selectedGameName}
              maxHours={maxHours}
              color={colorMap[g.game] || "#64748b"}
              onSelect={onSelectGame}
            />
          ))}
        </div>
      )}
    </div>
  );
}
