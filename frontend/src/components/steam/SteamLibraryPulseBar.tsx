import React from "react";
import {
  SteamLibraryPulse,
  PlaytimeBucket,
  AchievementFilter,
} from "../../utils/steamInsightsUtils";

export interface SteamLibraryPulseBarProps {
  readonly pulse: SteamLibraryPulse;
  readonly activeBucket: PlaytimeBucket;
  readonly activeAchievementFilter: AchievementFilter;
  readonly unrecordedGemsCount: number;
  readonly onSelectBucket: (bucket: PlaytimeBucket) => void;
  readonly onSelectAchievementFilter: (filter: AchievementFilter) => void;
}

interface BucketConfig {
  readonly key: Exclude<PlaytimeBucket, "all">;
  readonly label: string;
  readonly count: number;
  readonly color: string;
}

export function SteamLibraryPulseBar({
  pulse,
  activeBucket,
  activeAchievementFilter,
  unrecordedGemsCount,
  onSelectBucket,
  onSelectAchievementFilter,
}: SteamLibraryPulseBarProps): React.JSX.Element {
  const totalGames = pulse.totalGames || 0;
  const completionPct =
    pulse.totalAchievements > 0
      ? Math.round((pulse.unlockedAchievements / pulse.totalAchievements) * 100)
      : 0;

  const buckets: readonly BucketConfig[] = [
    {
      key: "unplayed",
      label: "Unplayed 0h",
      count: pulse.unplayedGames || 0,
      color: "bg-zinc-600",
    },
    {
      key: "tried",
      label: "Tried <2h",
      count: pulse.triedGames || 0,
      color: "bg-amber-500/80",
    },
    {
      key: "played",
      label: "Played 2–50h",
      count: pulse.playedGames || 0,
      color: "bg-sky-500",
    },
    {
      key: "obsession",
      label: "Obsessions 50h+",
      count: pulse.obsessionGames || 0,
      color: "bg-accent",
    },
  ];

  const filterChips = [
    {
      key: "perfect" as const,
      label: `100% Perfect (${pulse.perfectGamesCount || 0})`,
      testId: "filter-chip-perfect",
      icon: (
        <svg
          className="w-3.5 h-3.5 text-amber-400 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      key: "almost_there" as const,
      label: `Almost there 75–99% (${pulse.almostThereCount || 0})`,
      testId: "filter-chip-almost_there",
      icon: (
        <svg
          className="w-3.5 h-3.5 text-sky-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
    },
    {
      key: "unrecorded_gems" as const,
      label: `Unrecorded gems 20h+ (${unrecordedGemsCount || 0})`,
      testId: "filter-chip-unrecorded_gems",
      icon: (
        <svg
          className="w-3.5 h-3.5 text-violet-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3h12l4 6-10 13L2 9z" />
          <path d="M11 3 8 9l4 13 4-13-3-6" />
          <path d="M2 9h20" />
        </svg>
      ),
    },
  ];

  const handleBucketClick = (bucket: Exclude<PlaytimeBucket, "all">) => {
    onSelectBucket(activeBucket === bucket ? "all" : bucket);
  };

  const handleFilterClick = (filter: Exclude<AchievementFilter, "all">) => {
    onSelectAchievementFilter(activeAchievementFilter === filter ? "all" : filter);
  };

  const getChipStyle = (isActive: boolean) =>
    `px-2.5 py-1 rounded-md text-xs tabular-nums flex items-center gap-1.5 transition-colors cursor-pointer border ${
      isActive
        ? "border-accent bg-accent/15 text-text-primary font-medium"
        : "border-border-subtle bg-[#141418] text-text-secondary hover:text-text-primary hover:border-border-default"
    }`;

  return (
    <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-bold text-text-primary">Library pulse</span>
          <div
            data-testid="pulse-pareto-badge"
            className="px-2.5 py-1 rounded-md bg-[#141418] border border-border-subtle text-xs text-text-secondary tabular-nums"
          >
            Top 10 games = {Math.round(pulse.top10SharePct || 0)}% of playtime
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-2.5 py-1 rounded-md bg-[#141418] border border-border-subtle text-xs text-text-secondary tabular-nums flex items-center gap-1.5">
            <strong className="text-text-primary font-semibold">{totalGames}</strong> games
          </div>

          <div className="px-2.5 py-1 rounded-md bg-[#141418] border border-border-subtle text-xs text-text-secondary tabular-nums flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-amber-400 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <strong className="text-text-primary font-semibold">{pulse.totalHours || 0}h</strong> played
          </div>

          <div className="px-2.5 py-1 rounded-md bg-[#141418] border border-border-subtle text-xs text-text-secondary tabular-nums flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-emerald-400 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <strong className="text-text-primary font-semibold">{completionPct}%</strong> achievements ({pulse.unlockedAchievements || 0}/{pulse.totalAchievements || 0})
          </div>

          <div className="px-2.5 py-1 rounded-md bg-[#141418] border border-border-subtle text-xs text-text-secondary tabular-nums flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-red-500 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            <strong className="text-text-primary font-semibold">{pulse.recordedGamesCount || 0}</strong> on YouTube
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div
          role="region"
          aria-label="Playtime distribution bar"
          className="h-2.5 w-full rounded-full overflow-hidden bg-surface flex gap-0.5 p-0.5 border border-border-subtle"
        >
          {buckets.map((b) => {
            const pct = totalGames > 0 ? (b.count / totalGames) * 100 : 0;
            if (pct <= 0) return null;

            return (
              <button
                key={b.key}
                type="button"
                data-testid={`bar-segment-${b.key}`}
                aria-label={`${b.label}: ${b.count} games (${Math.round(pct)}%)`}
                onClick={() => handleBucketClick(b.key)}
                className={`${b.color} h-full transition-opacity hover:opacity-80 rounded-xs`}
                style={{ width: `${pct}%` }}
                title={`${b.label}: ${b.count} games (${Math.round(pct)}%)`}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {buckets.map((b) => {
            const isActive = activeBucket === b.key;
            return (
              <button
                key={b.key}
                type="button"
                data-testid={`bucket-chip-${b.key}`}
                aria-pressed={isActive}
                onClick={() => handleBucketClick(b.key)}
                className={getChipStyle(isActive)}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${b.color}`} />
                <span>
                  {b.label} ({b.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border-subtle/50">
        {filterChips.map((chip) => {
          const isActive = activeAchievementFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              data-testid={chip.testId}
              aria-pressed={isActive}
              onClick={() => handleFilterClick(chip.key)}
              className={getChipStyle(isActive)}
            >
              {chip.icon}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
