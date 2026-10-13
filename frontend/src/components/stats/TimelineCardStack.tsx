import { StintGame } from "../../utils/gameTimeline";
import { useSteamGameData } from "../../hooks/useSteamGameData";

export interface TimelineCardStackProps {
  readonly games: readonly StintGame[];
  readonly activeIndex: number;
  readonly isSelected: boolean;
  readonly onBringToFront: (index: number) => void;
}

interface StackLayerProps {
  readonly game: StintGame;
  readonly depth: number; // 0 = front, 1 = first behind, 2 = second behind
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

function StackLayer({ game, depth, isSelected, onClick }: StackLayerProps) {
  const { posterUrl } = useSteamGameData(game.game);
  const isFront = depth === 0;

  if (isFront) {
    return (
      <div
        className={`relative w-28 h-40 sm:w-36 sm:h-52 rounded-xl border overflow-hidden shadow-xs z-10 transition-transform bg-surface ${
          isSelected
            ? "border-accent ring-2 ring-accent/40"
            : "border-border-subtle group-hover:border-border-medium group-hover:scale-102"
        }`}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={game.game}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-surface/90 p-2 text-center gap-1">
            <span className="text-xs font-bold text-text-primary line-clamp-3">
              {game.game}
            </span>
          </div>
        )}
      </div>
    );
  }

  const offsetClasses =
    depth === 1
      ? "translate-x-3 -translate-y-2.5 z-5 opacity-75 hover:opacity-100 hover:translate-x-5 hover:-translate-y-4 hover:border-accent"
      : "translate-x-6 -translate-y-5 z-0 opacity-55 hover:opacity-100 hover:translate-x-8 hover:-translate-y-6 hover:border-accent";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`Bring ${game.game} to front`}
      aria-label={`Bring ${game.game} to front`}
      className={`absolute inset-0 w-28 h-40 sm:w-36 sm:h-52 rounded-xl border border-border-subtle overflow-hidden shadow-xs cursor-pointer bg-surface transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${offsetClasses}`}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-surface/80 p-2 text-center">
          <span className="text-xs font-bold text-text-muted line-clamp-2">
            {game.game}
          </span>
        </div>
      )}
    </button>
  );
}

export function TimelineCardStack({
  games,
  activeIndex,
  isSelected,
  onBringToFront,
}: TimelineCardStackProps) {
  if (games.length === 0) return null;

  const frontGame = games[activeIndex] || games[0];

  // Up to 2 secondary games behind (capped at 3 total visible layers)
  const rearGames: { game: StintGame; originalIndex: number }[] = [];
  for (let i = 1; i < Math.min(games.length, 3); i++) {
    const idx = (activeIndex + i) % games.length;
    const g = games[idx];
    if (g) {
      rearGames.push({ game: g, originalIndex: idx });
    }
  }

  return (
    <div className="relative w-28 h-40 sm:w-36 sm:h-52 mb-1.5 flex items-center justify-center">
      {/* Render rear layers first (from deepest to closest) */}
      {rearGames
        .slice()
        .reverse()
        .map((item, revIdx) => {
          const depth = rearGames.length - revIdx;
          return (
            <StackLayer
              key={`${item.game.game}_${item.originalIndex}`}
              game={item.game}
              depth={depth}
              isSelected={false}
              onClick={() => onBringToFront(item.originalIndex)}
            />
          );
        })}

      {/* Render front layer */}
      <StackLayer
        game={frontGame}
        depth={0}
        isSelected={isSelected}
        onClick={() => onBringToFront(activeIndex)}
      />
    </div>
  );
}
