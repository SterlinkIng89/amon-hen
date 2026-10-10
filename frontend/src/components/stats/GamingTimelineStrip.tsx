import { useState } from "react";
import { GameStint, StintGame, formatDateLabel } from "../../utils/gameTimeline";
import { useSteamGameData } from "../../hooks/useSteamGameData";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";

export interface GamingTimelineStripProps {
  readonly stints: readonly GameStint[];
  readonly selectedStintId?: string | null;
  readonly onSelectStint?: (stint: GameStint, activeGameName?: string) => void;
}

interface StintCardProps {
  readonly stint: GameStint;
  readonly isSelected: boolean;
  readonly onSelect: (stint: GameStint, activeGameName?: string) => void;
}

function StintCard({ stint, isSelected, onSelect }: StintCardProps) {
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
      const nextIndex = (activeGameIndex + 1) % stint.games.length;
      setActiveGameIndex(nextIndex);
      const nextGame = stint.games[nextIndex];
      if (nextGame) {
        onSelect(stint, nextGame.game);
      }
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
      {/* Horizontal connector line at date pill level */}
      <div
        aria-hidden="true"
        className="absolute top-[182px] sm:top-[238px] inset-x-0 h-0.5 bg-border-subtle/40 -z-0 pointer-events-none"
      />

      <div className="relative w-34 h-44 sm:w-42 sm:h-56 mb-2.5 flex items-center justify-center">
        {backGame && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleSwap}
            title={`Switch to ${backGame.game}`}
            aria-label={`Switch to ${backGame.game}`}
            className="absolute top-0 right-0 w-28 h-40 sm:w-36 sm:h-52 rounded-xl border border-accent/50 overflow-hidden shadow-xs cursor-pointer z-0 opacity-90 group-hover:opacity-100 group-hover:translate-x-2 group-hover:-translate-y-1 transition-all bg-surface hover:border-accent"
          >
            {backPoster ? (
              <img
                src={backPoster}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-surface/80 p-2 text-center">
                <span className="text-xs font-bold text-text-muted">
                  {backGame.game}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Front card */}
        <div
          className={`relative w-28 h-40 sm:w-36 sm:h-52 rounded-xl border overflow-hidden shadow-xs z-10 transition-transform bg-surface ${
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

          {/* Quick Swap button icon in bottom right */}
          {hasMultipleGames && (
            <button
              type="button"
              onClick={handleSwap}
              title={`Switch to ${backGame?.game || "next game"}`}
              aria-label="Switch to next game"
              className="absolute bottom-1 right-1 p-1 rounded-md bg-surface/95 hover:bg-accent hover:text-black text-text-secondary border border-border-subtle hover:border-accent shadow-xs z-20 transition-all cursor-pointer opacity-90 group-hover:opacity-100"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Date Pill with timeline node styling */}
      <div className="relative z-10 px-2.5 py-0.5 rounded-full bg-surface border border-border-subtle text-[10px] font-bold text-text-secondary whitespace-nowrap mb-1 shadow-xs">
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
    <div className="flex flex-col gap-2.5 w-full">
      <h3 className="text-xs font-bold text-text-secondary">
        Monthly timeline
      </h3>

      <div className="flex flex-wrap items-start justify-start gap-x-4 gap-y-5">
        {stints.map((stint) => (
          <StintCard
            key={stint.id}
            stint={stint}
            isSelected={stint.id === selectedStintId}
            onSelect={(s, gameName) => onSelectStint?.(s, gameName)}
          />
        ))}
      </div>
    </div>
  );
}
