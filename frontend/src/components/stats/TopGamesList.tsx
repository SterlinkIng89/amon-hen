import { useSteamGameData } from "../../hooks/useSteamGameData";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";
import { getGameColor } from "../../utils/tagColors";

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
  readonly isSelected: boolean;
  readonly maxHours: number;
  readonly color: string;
  readonly onSelect: (game: string) => void;
}

function GameRowItem({
  game,
  hours,
  isSelected,
  maxHours,
  color,
  onSelect,
}: GameRowItemProps) {
  const { headerUrl, heroUrl, posterUrl } = useSteamGameData(game);
  const bannerUrl = headerUrl || heroUrl || posterUrl;
  const progressPct = maxHours > 0 ? Math.min((hours / maxHours) * 100, 100) : 0;

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
      className={`group flex items-center gap-3 w-full py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        isSelected
          ? "bg-card border border-border-medium"
          : "hover:bg-card/60 border border-transparent"
      }`}
    >
      {/* Framed Wide Capsule Banner (Steam 460x215 aspect ratio) */}
      <div className="relative w-24 sm:w-28 aspect-[460/215] rounded-md overflow-hidden bg-surface shrink-0 border border-border-subtle group-hover:border-border-medium transition-colors">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt=""
            className="w-full h-full object-cover object-center"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface/80">
            <span
              className="text-xs font-bold"
              style={{ color }}
            >
              {game.slice(0, 3)}
            </span>
          </div>
        )}
      </div>

      {/* Right Column: Name + Hours on top row, colored progress bar underneath */}
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        {/* Name on left, Hours on right */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span
            className={`text-xs font-semibold truncate ${
              isSelected
                ? "text-text-primary"
                : "text-text-secondary group-hover:text-text-primary"
            }`}
            title={game}
          >
            {game}
          </span>

          <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary tabular-nums shrink-0">
            {formatPlaytimeHoursMinutes(hours)}
          </span>
        </div>

        {/* Thin progress bar underneath spanning full width */}
        <div className="h-[2px] w-full bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progressPct}%`,
              backgroundColor: color,
            }}
          />
        </div>
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
  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-text-secondary">{listTitle}</h3>
        {games.length > 0 && (
          <span className="text-[11px] font-medium text-text-muted">
            {games.length} {games.length === 1 ? "game" : "games"}
          </span>
        )}
      </div>

      {games.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center gap-1 text-text-muted border border-dashed border-border-subtle rounded-lg">
          <p className="text-xs">No playtime recorded</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 pr-1">
          {games.map((g) => (
            <GameRowItem
              key={g.game}
              game={g.game}
              hours={g.hours}
              isSelected={g.game === selectedGameName}
              maxHours={maxHours}
              color={getGameColor(g.game)}
              onSelect={onSelectGame}
            />
          ))}
        </div>
      )}
    </div>
  );
}
