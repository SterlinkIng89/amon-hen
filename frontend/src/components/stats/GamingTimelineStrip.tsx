import { useState, useEffect } from "react";
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
  readonly selectedGameName?: string | null;
  readonly onSelectStint?: (stint: GameStint, activeGameName?: string) => void;
  readonly title?: string;
}

interface StintCardProps {
  readonly stint: GameStint;
  readonly selectedGameName?: string | null;
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
  const totalHours = games.reduce((acc, g) => acc + g.hours, 0);

  return (
    <div
      className="flex items-center gap-0.5 w-28 sm:w-36 my-2 px-0.5"
      aria-label={`${games.length} games recorded`}
    >
      {games.map((g, idx) => {
        const isActive = idx === activeGameIndex;
        const color = getGameColor(g.game);
        const rawPct =
          totalHours > 0 ? (g.hours / totalHours) * 100 : 100 / games.length;
        const widthPct =
          games.length === 1 ? 100 : Math.max(Math.round(rawPct), 15);

        return (
          <span
            key={`${g.game}_${idx}`}
            data-testid={`stint-segment-${g.game}`}
            className={`h-1.5 rounded-full transition-all duration-200 ${
              isActive ? "opacity-100 ring-1 ring-white/20" : "opacity-40"
            }`}
            style={{ backgroundColor: color, width: `${widthPct}%` }}
            title={`${g.game}: ${formatPlaytimeHoursMinutes(g.hours)}`}
          />
        );
      })}
    </div>
  );
}

function StintCard({
  stint,
  selectedGameName,
  isFirst,
  isLast,
  hasBreakBefore,
  hasBreakAfter,
  onSelect,
}: StintCardProps) {
  const [activeGameIndex, setActiveGameIndex] = useState(0);

  useEffect(() => {
    if (!selectedGameName) {
      setActiveGameIndex(0);
      return;
    }
    const matchIdx = stint.games.findIndex((g) => g.game === selectedGameName);
    if (matchIdx >= 0) {
      setActiveGameIndex(matchIdx);
    }
  }, [selectedGameName, stint.games]);

  const activeGame: StintGame =
    stint.games[activeGameIndex] || stint.games[0] || { game: "", hours: 0 };

  const handleBringToFront = (index: number) => {
    setActiveGameIndex(index);
  };

  const dateLabel = formatDateLabel(stint.startDate, stint.endDate);
  const isSingleDay = stint.startDate === stint.endDate;
  const hasMultipleGames = stint.games.length > 1;

  const isGameFiltered = Boolean(
    selectedGameName && stint.games.some((g) => g.game === selectedGameName),
  );
  const isDimmed = Boolean(selectedGameName && !isGameFiltered);
  const gameColor = getGameColor(activeGame.game);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`stint-card-${stint.id}`}
      onClick={() => onSelect(stint, activeGame.game)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(stint, activeGame.game);
        }
      }}
      className={`group relative flex flex-col items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg py-1.5 px-0 w-28 sm:w-36 transition-all ${
        isDimmed ? "opacity-35 hover:opacity-80" : "opacity-100"
      }`}
    >
      <TimelineCardStack
        games={stint.games}
        activeIndex={activeGameIndex}
        isSelected={isGameFiltered}
        onBringToFront={handleBringToFront}
      />

      <GameSegments games={stint.games} activeGameIndex={activeGameIndex} />

      <div className="relative w-full h-7 flex items-center justify-center my-1.5">
        {!isFirst && (
          <div
            aria-hidden="true"
            className={`absolute -left-2 sm:-left-3 right-1/2 top-1/2 -translate-y-1/2 z-0 pointer-events-none ${
              hasBreakBefore
                ? "h-0 border-t-2 border-dashed border-border-medium bg-transparent"
                : "h-[2px] bg-border-subtle"
            }`}
          />
        )}

        {!isLast && (
          <div
            aria-hidden="true"
            className={`absolute left-1/2 -right-2 sm:-right-3 top-1/2 -translate-y-1/2 z-0 pointer-events-none flex items-center justify-end ${
              hasBreakAfter
                ? "h-0 border-t-2 border-dashed border-border-medium bg-transparent"
                : "h-[2px] bg-border-subtle"
            }`}
          >
            {!hasBreakAfter && (
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted translate-x-1/2 shrink-0 pointer-events-none" />
            )}
          </div>
        )}

        <div
          data-testid="stint-date-pill"
          className={`relative z-10 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shadow-xs transition-colors flex items-center gap-1.5 ${
            isGameFiltered
              ? "bg-card border text-text-primary"
              : "bg-card border border-border-subtle text-text-primary group-hover:border-border-medium"
          }`}
          style={isGameFiltered ? { borderColor: gameColor } : undefined}
        >
          {isGameFiltered && (
            <span
              data-testid="stint-date-pill-dot"
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: gameColor }}
            />
          )}
          <span>{dateLabel}</span>
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
      data-testid={`timeline-gap-spacer-${prevStint.endDate}_${nextStint.startDate}`}
      className="self-stretch flex flex-col items-center justify-end py-1.5 px-0 w-16 sm:w-[72px] shrink-0"
      aria-label={`${dayGap} days inactive (${gapLabel})`}
    >
      <div className="relative w-full h-7 flex items-center justify-center my-1.5">
        <div
          aria-hidden="true"
          className="absolute -left-2 sm:-left-3 -right-2 sm:-right-3 top-1/2 -translate-y-1/2 h-0 border-t-2 border-dashed border-border-medium z-0 pointer-events-none"
        />

        <div className="relative z-10 px-2 py-0.5 rounded-full bg-surface border border-dashed border-border-medium flex items-center gap-1 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
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
  selectedGameName,
  onSelectStint,
  title = "Monthly timeline",
}: GamingTimelineStripProps) {
  if (stints.length === 0) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <h3 className="text-xs font-bold text-text-secondary">
          {title}
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
        {title}
      </h3>

      <div className="relative flex flex-wrap items-start justify-start gap-x-4 sm:gap-x-6 gap-y-7 pr-1 pt-1.5">
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
                selectedGameName={selectedGameName}
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
