import { useState } from "react";
import {
  GameStint,
  StintGame,
  formatDateLabel,
  calculateDayGap,
  formatGapDateLabel,
} from "../../utils/gameTimeline";
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
  readonly hasBreakBefore?: boolean;
  readonly hasBreakAfter?: boolean;
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
      className="flex items-center gap-0.5 w-28 sm:w-36 my-2 px-0.5"
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
  hasBreakBefore,
  hasBreakAfter,
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
      className="group relative flex flex-col items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg py-1.5 px-0 w-28 sm:w-36 transition-all"
    >
      <TimelineCardStack
        games={stint.games}
        activeIndex={activeGameIndex}
        isSelected={isSelected}
        onBringToFront={handleBringToFront}
      />

      <GameSegments games={stint.games} activeGameIndex={activeGameIndex} />

      <div className="relative w-full h-7 flex items-center justify-center my-1.5">
        {!isFirst && (
          <div
            aria-hidden="true"
            className={`absolute -left-2 sm:-left-3 right-1/2 top-1/2 -translate-y-1/2 z-0 pointer-events-none ${
              hasBreakBefore
                ? "h-0 border-t-2 border-dashed border-[#444458] bg-transparent"
                : "h-[2px] bg-[#2d2d3b]"
            }`}
          />
        )}

        {!isLast && (
          <div
            aria-hidden="true"
            className={`absolute left-1/2 -right-2 sm:-right-3 top-1/2 -translate-y-1/2 z-0 pointer-events-none flex items-center justify-end ${
              hasBreakAfter
                ? "h-0 border-t-2 border-dashed border-[#444458] bg-transparent"
                : "h-[2px] bg-[#2d2d3b]"
            }`}
          >
            {!hasBreakAfter && (
              <div className="w-1.5 h-1.5 rounded-full bg-[#525266] translate-x-1/2 shrink-0 pointer-events-none" />
            )}
          </div>
        )}

        <div className="relative z-10 px-3 py-1 rounded-full bg-[#1e1e26] border border-[#32323e] text-[11px] font-semibold text-text-primary whitespace-nowrap shadow-xs group-hover:border-[#48485a] transition-colors">
          {dateLabel}
        </div>
      </div>

      <div className="h-4 flex items-center justify-center text-[10px] text-text-secondary whitespace-nowrap tabular-nums mt-0.5">
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

function TimelineGapSpacer({
  prevStint,
  nextStint,
}: {
  readonly prevStint: GameStint;
  readonly nextStint: GameStint;
}) {
  const dayGap = calculateDayGap(prevStint.endDate, nextStint.startDate);
  const gapLabel = formatGapDateLabel(prevStint.endDate, nextStint.startDate);

  return (
    <div
      className="self-stretch flex flex-col items-center justify-end py-1.5 px-0 min-w-[90px] sm:min-w-[110px]"
      aria-label={`${dayGap} days inactive (${gapLabel})`}
    >
      <div className="relative w-full h-7 flex items-center justify-center my-1.5">
        <div
          aria-hidden="true"
          className="absolute -left-2 sm:-left-3 -right-2 sm:-right-3 top-1/2 -translate-y-1/2 h-0 border-t-2 border-dashed border-[#444458] z-0 pointer-events-none"
        />

        <div className="relative z-10 px-2.5 py-0.5 rounded-full bg-[#12141a] border border-dashed border-[#48485c] flex items-center gap-1.5 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          <span className="text-[10px] font-mono font-medium text-text-secondary whitespace-nowrap">
            {dayGap === 1 ? "1d break" : `${dayGap}d break`}
          </span>
        </div>
      </div>

      <div className="h-4 flex items-center justify-center text-[10px] text-text-muted whitespace-nowrap tabular-nums mt-0.5 font-sans">
        {gapLabel}
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
    <div className="flex flex-col gap-3 w-full">
      <h3 className="text-xs font-bold text-text-secondary">
        Monthly timeline
      </h3>

      <div className="relative flex flex-wrap items-start justify-start gap-x-4 sm:gap-x-6 gap-y-7 overflow-visible">
        {stints.map((stint, idx) => {
          const prevStint = idx > 0 ? stints[idx - 1] : undefined;
          const nextStint = stints[idx + 1];

          const hasBreakBefore =
            prevStint !== undefined &&
            calculateDayGap(prevStint.endDate, stint.startDate) > 0;

          const hasBreakAfter =
            nextStint !== undefined &&
            calculateDayGap(stint.endDate, nextStint.startDate) > 0;

          return (
            <div key={stint.id} className="contents">
              <StintCard
                stint={stint}
                isFirst={idx === 0}
                isLast={idx === stints.length - 1}
                hasBreakBefore={hasBreakBefore}
                hasBreakAfter={hasBreakAfter}
                isSelected={stint.id === selectedStintId}
                onSelect={(s, gameName) => onSelectStint?.(s, gameName)}
              />

              {hasBreakAfter && nextStint && (
                <TimelineGapSpacer
                  key={`gap_${stint.id}_${nextStint.id}`}
                  prevStint={stint}
                  nextStint={nextStint}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
