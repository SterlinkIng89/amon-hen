import { useState } from "react";
import { GameStint, StintGame, formatDateLabel } from "../../utils/gameTimeline";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";
import { getGameColor } from "../../utils/tagColors";
import { TimelineCardStack } from "./TimelineCardStack";

export interface GamingTimelineStripProps {
  readonly stints: readonly GameStint[];
  readonly selectedStintId?: string | null;
  readonly onSelectStint?: (stint: GameStint, activeGameName?: string) => void;
}

interface StintCardProps {
  readonly stint: GameStint;
  readonly isSelected: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onSelect: (stint: GameStint, activeGameName?: string) => void;
}

function GameSegments({
  games,
  activeGameIndex,
}: {
  readonly games: readonly StintGame[];
  readonly activeGameIndex: number;
}) {
  return (
    <div
      className="flex items-center gap-0.5 w-28 sm:w-36 my-1.5 px-0.5"
      aria-label={`${games.length} games recorded`}
    >
      {games.map((g, idx) => {
        const isActive = idx === activeGameIndex;
        const color = getGameColor(g.game);
        return (
          <span
            key={`${g.game}_${idx}`}
            className={`flex-1 h-1 rounded-full transition-all duration-200 ${
              isActive ? "opacity-100 ring-1 ring-white/20" : "opacity-40"
            }`}
            style={{ backgroundColor: color }}
            title={`${g.game}: ${formatPlaytimeHoursMinutes(g.hours)}`}
          />
        );
      })}
    </div>
  );
}

function StintCard({
  stint,
  isSelected,
  isFirst,
  isLast,
  onSelect,
}: StintCardProps) {
  const [activeGameIndex, setActiveGameIndex] = useState(0);

  const activeGame: StintGame =
    stint.games[activeGameIndex] || stint.games[0] || { game: "", hours: 0 };

  const handleBringToFront = (index: number) => {
    setActiveGameIndex(index);
    const targetGame = stint.games[index];
    if (targetGame) {
      onSelect(stint, targetGame.game);
    }
  };

  const dateLabel = formatDateLabel(stint.startDate, stint.endDate);
  const isSingleDay = stint.startDate === stint.endDate;
  const hasMultipleGames = stint.games.length > 1;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(stint, activeGame.game)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(stint, activeGame.game);
        }
      }}
      className="group relative flex flex-col items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg p-1 transition-all"
    >
      {/* Cards stack */}
      <TimelineCardStack
        games={stint.games}
        activeIndex={activeGameIndex}
        isSelected={isSelected}
        onBringToFront={handleBringToFront}
      />

      {/* Horizontal colored segments */}
      <GameSegments games={stint.games} activeGameIndex={activeGameIndex} />

      {/* Timeline track connector and Date Pill row */}
      <div className="relative w-full flex items-center justify-center my-1">
        {/* Left connector half */}
        {!isFirst && (
          <div
            aria-hidden="true"
            className="absolute left-[-10px] right-1/2 top-1/2 -translate-y-1/2 h-[1.5px] bg-[#272732] z-0 pointer-events-none"
          />
        )}

        {/* Right connector half with intermediate timeline node */}
        {!isLast && (
          <div
            aria-hidden="true"
            className="absolute left-1/2 right-[-10px] top-1/2 -translate-y-1/2 h-[1.5px] bg-[#272732] z-0 pointer-events-none flex items-center justify-end"
          >
            {/* Small circular connector dot between date nodes */}
            <div className="w-1.5 h-1.5 rounded-full bg-[#363644] -mr-1" />
          </div>
        )}

        {/* Date Pill (styled matching the reference mockup) */}
        <div className="relative z-10 px-3 py-1 rounded-full bg-[#1e1e26] border border-[#32323e] text-[11px] font-semibold text-text-primary whitespace-nowrap shadow-xs group-hover:border-[#48485a] transition-colors">
          {dateLabel}
        </div>
      </div>

      {/* Playtime subtitle */}
      <div className="text-[10px] text-text-secondary whitespace-nowrap tabular-nums mt-0.5">
        {formatPlaytimeHoursMinutes(activeGame.hours)} ·{" "}
        {hasMultipleGames
          ? `${stint.games.length} games`
          : isSingleDay
          ? "1 day"
          : `${stint.dayCount} days`}
      </div>
    </div>
  );
}

export function GamingTimelineStrip({
  stints,
  selectedStintId,
  onSelectStint,
}: GamingTimelineStripProps) {
  if (stints.length === 0) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <h3 className="text-xs font-bold text-text-secondary">
          Monthly timeline
        </h3>
        <div className="py-10 flex flex-col items-center justify-center gap-1 text-text-muted border border-dashed border-border-subtle rounded-lg">
          <p className="text-xs">No activity recorded for this period</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <h3 className="text-xs font-bold text-text-secondary">
        Monthly timeline
      </h3>

      <div className="relative flex flex-wrap items-start justify-start gap-x-4 gap-y-6 overflow-visible">
        {stints.map((stint, idx) => (
          <StintCard
            key={stint.id}
            stint={stint}
            isFirst={idx === 0}
            isLast={idx === stints.length - 1}
            isSelected={stint.id === selectedStintId}
            onSelect={(s, gameName) => onSelectStint?.(s, gameName)}
          />
        ))}
      </div>
    </div>
  );
}
