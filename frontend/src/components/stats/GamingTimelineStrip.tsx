import { useState } from "react";
import { GameStint, StintGame, formatDateLabel } from "../../utils/gameTimeline";
import { useSteamGameData } from "../../hooks/useSteamGameData";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";

export interface GamingTimelineStripProps {
  readonly stints: readonly GameStint[];
  readonly selectedStintId?: string | null;
  readonly onSelectStint?: (stint: GameStint) => void;
}

interface StintCardProps {
  readonly stint: GameStint;
  readonly isSelected: boolean;
  readonly onSelect: (stint: GameStint) => void;
}

function StintCard({ stint, isSelected, onSelect }: StintCardProps) {
  // If multiple games, maintain active index that can be swapped by clicking the back card
  const [activeGameIndex, setActiveGameIndex] = useState(0);

  const activeGame: StintGame =
    stint.games[activeGameIndex] || stint.games[0] || { game: "", hours: 0 };
  const backGame: StintGame | undefined =
    stint.games.length > 1
      ? stint.games[(activeGameIndex + 1) % stint.games.length]
      : undefined;

  const { posterUrl: frontPoster } = useSteamGameData(activeGame.game);
  const { posterUrl: backPoster } = useSteamGameData(backGame?.game || "");

  const handleSwap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (stint.games.length > 1) {
      setActiveGameIndex((prev) => (prev + 1) % stint.games.length);
    }
  };

  const dateLabel = formatDateLabel(stint.startDate, stint.endDate);
  const isSingleDay = stint.startDate === stint.endDate;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(stint)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(stint);
        }
      }}
      className={`group relative flex flex-col items-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-xl p-2 transition-all ${
        isSelected ? "bg-surface/80 ring-1 ring-accent" : "hover:bg-surface/40"
      }`}
    >
      {/* Covers container sitting on top of the timeline track */}
      <div className="relative w-20 h-28 sm:w-24 sm:h-34 mb-2 flex items-center justify-center">
        {/* Back card (if stacked games exist) */}
        {backGame && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleSwap}
            title={`Click to swap to ${backGame.game}`}
            className="absolute top-2 left-3 w-18 h-26 sm:w-22 sm:h-32 rounded-lg border border-accent/60 overflow-hidden shadow-xs cursor-pointer z-0 opacity-70 group-hover:opacity-90 group-hover:translate-x-1 group-hover:translate-y-1 transition-all bg-surface"
          >
            {backPoster ? (
              <img
                src={backPoster}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-surface/80 p-1 text-center">
                <span className="text-[9px] font-bold text-text-muted">
                  {backGame.game}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Front card */}
        <div
          className={`relative w-18 h-26 sm:w-22 sm:h-32 rounded-lg border overflow-hidden shadow-xs z-10 transition-transform bg-surface ${
            isSelected
              ? "border-accent ring-2 ring-accent/40"
              : "border-border-subtle group-hover:border-border-medium group-hover:scale-102"
          }`}
        >
          {frontPoster ? (
            <img
              src={frontPoster}
              alt={activeGame.game}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-surface/90 p-2 text-center gap-1">
              <span className="text-xs font-bold text-text-primary line-clamp-3">
                {activeGame.game}
              </span>
            </div>
          )}

          {/* Stint game title overlay badge on hover / focus */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-bold text-white line-clamp-1">
              {activeGame.game}
            </span>
          </div>
        </div>
      </div>

      {/* Date Pill */}
      <div className="px-2.5 py-0.5 rounded-full bg-surface/70 border border-border-subtle text-[10px] font-bold text-text-secondary whitespace-nowrap mb-1">
        {dateLabel}
      </div>

      {/* Playtime and Days subtitle */}
      <div className="text-[10px] text-text-muted whitespace-nowrap tabular-nums">
        {formatPlaytimeHoursMinutes(activeGame.hours)} ·{" "}
        {isSingleDay ? "1 day" : `${stint.dayCount} days`}
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
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-text-secondary">
          Monthly timeline
        </h3>
        <span className="text-[10px] text-text-muted">
          Chronological gaming stints
        </span>
      </div>

      {/* Horizontal Scroll Track */}
      <div className="relative w-full overflow-x-auto custom-scrollbar pb-3 pt-2">
        {/* Continuous track line centered on covers */}
        <div className="absolute top-[4.75rem] left-6 right-6 h-0.5 bg-border-subtle -z-0" />

        <div className="flex items-center gap-4 min-w-max px-4 relative z-10">
          {stints.map((stint, idx) => (
            <div key={stint.id} className="flex items-center gap-4">
              <StintCard
                stint={stint}
                isSelected={stint.id === selectedStintId}
                onSelect={(s) => onSelectStint?.(s)}
              />

              {/* Connecting Dot between items */}
              {idx < stints.length - 1 && (
                <div className="w-2 h-2 rounded-full bg-border-subtle border border-surface shrink-0 self-center mt-[-30px]" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
