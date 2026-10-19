import React, { useState, useMemo } from "react";
import {
  SteamGameInsight,
  BacklogStatus,
  TierLevel,
} from "../../utils/steamInsightsUtils";
import { getGameColor } from "../../utils/tagColors";

export interface SteamGameInspectorGridProps {
  readonly games: readonly SteamGameInsight[];
  readonly activeFilterTitle: string;
  readonly hasActiveFilter: boolean;
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly onClearFilters: () => void;
  readonly onQuickQueue: (appid: number, status: BacklogStatus) => void;
  readonly onQuickRate: (appid: number, tier: TierLevel, score: number) => void;
}

const PAGE_SIZE = 24;

const TIER_OPTIONS: readonly { tier: TierLevel; score: number }[] = [
  { tier: "S", score: 10 },
  { tier: "A", score: 8 },
  { tier: "B", score: 6 },
  { tier: "C", score: 4 },
  { tier: "D", score: 2 },
];

function formatBacklogStatus(status: BacklogStatus): string {
  switch (status) {
    case "playing":
      return "Playing";
    case "up_next":
      return "Up next";
    case "candidate":
      return "Candidate";
    case "on_hold":
      return "On hold";
    case "dropped":
      return "Dropped";
  }
}

function formatHours(hours: number): string {
  if (hours % 1 === 0) {
    return `${hours}h`;
  }
  return `${hours.toFixed(1)}h`;
}

function YouTubeBridgeBadge({
  ytVideosCount,
  ytRecordedHours = 0,
  playtimeForever,
  appid,
  detailed = false,
}: {
  readonly ytVideosCount: number;
  readonly ytRecordedHours?: number;
  readonly playtimeForever: number;
  readonly appid?: number;
  readonly detailed?: boolean;
}): React.JSX.Element | null {
  if (ytVideosCount > 0) {
    return (
      <span
        data-testid={appid ? `yt-badge-${appid}` : undefined}
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 shrink-0"
      >
        <span>{ytVideosCount} YT vids</span>
        {detailed && ytRecordedHours > 0 && (
          <>
            <span className="text-red-400/60">·</span>
            <span>{Math.round(ytRecordedHours)}h</span>
          </>
        )}
      </span>
    );
  }

  if (playtimeForever >= 1200) {
    return (
      <span
        data-testid={appid ? `unrecorded-gem-${appid}` : undefined}
        className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0"
      >
        Unrecorded gem
      </span>
    );
  }

  return null;
}

export function SteamGameInspectorGrid({
  games,
  activeFilterTitle,
  hasActiveFilter,
  searchQuery,
  onSearchChange,
  onClearFilters,
  onQuickQueue,
  onQuickRate,
}: SteamGameInspectorGridProps): React.JSX.Element {
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const spotlightIndex = useMemo(() => {
    if (games.length === 0) return -1;
    const idx = games.findIndex((g) => g.appid === selectedAppId);
    return idx >= 0 ? idx : 0;
  }, [games, selectedAppId]);

  const spotlightGame = spotlightIndex >= 0 ? games[spotlightIndex] : null;
  const spotlightRank = spotlightIndex + 1;

  const visibleGames = games.slice(0, visibleCount);
  const hasMore = games.length > visibleCount;

  return (
    <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-text-primary">{activeFilterTitle}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-elevated text-text-secondary tabular-nums font-medium">
            {games.length} {games.length === 1 ? "game" : "games"}
          </span>
          {hasActiveFilter && (
            <button
              type="button"
              data-testid="inspector-clear-filter"
              onClick={onClearFilters}
              className="text-xs text-text-muted hover:text-accent transition-colors font-medium underline underline-offset-2"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="relative w-48 sm:w-64">
          <input
            type="text"
            data-testid="inspector-game-search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search games..."
            className="w-full bg-surface border border-border-subtle rounded-lg px-2.5 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-medium focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </div>

      {games.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface/40 border border-dashed border-border-subtle rounded-xl my-4">
          <p className="text-sm font-semibold text-text-primary mb-1">No matching games found</p>
          <p className="text-xs text-text-muted mb-4">
            Try adjusting your search query or clear the active filter.
          </p>
          <button
            type="button"
            data-testid="empty-reset-filters"
            onClick={onClearFilters}
            className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-xs"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
          {spotlightGame && (
            <div className="w-full md:w-[175px] shrink-0">
              <div
                data-testid="inspector-spotlight-card"
                className="relative w-full aspect-[2/3] rounded-xl overflow-hidden border border-border-subtle bg-surface shadow-xs group"
              >
                {spotlightGame.posterUrl ? (
                  <img
                    src={spotlightGame.posterUrl}
                    alt={spotlightGame.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center p-3 text-center">
                    <span
                      className="text-xl font-black mb-1"
                      style={{ color: getGameColor(spotlightGame.name) }}
                    >
                      #{spotlightRank}
                    </span>
                    <span className="text-xs font-bold text-text-primary line-clamp-2">
                      {spotlightGame.name}
                    </span>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/75 via-35% to-transparent opacity-95 pointer-events-none" />

                <div className="absolute bottom-0 left-0 right-0 p-2.5 flex flex-col gap-1 z-10">
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-surface/85 border w-fit backdrop-blur-md"
                    style={{ borderColor: getGameColor(spotlightGame.name) }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: getGameColor(spotlightGame.name) }}
                    />
                    <span
                      className="text-[9px] font-bold tracking-wider"
                      style={{ color: getGameColor(spotlightGame.name) }}
                    >
                      {spotlightRank === 1 ? "Top played" : `#${spotlightRank} selected`}
                    </span>
                  </span>

                  <h4
                    className="text-xs font-bold text-white leading-tight line-clamp-2"
                    title={spotlightGame.name}
                  >
                    {spotlightGame.name}
                  </h4>

                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm font-bold text-white tabular-nums">
                      {formatHours(spotlightGame.playtimeHours)}
                    </span>
                    <span
                      className="text-[10px] text-text-secondary truncate max-w-[90px]"
                      title={spotlightGame.developers}
                    >
                      {spotlightGame.developers}
                    </span>
                  </div>

                  {spotlightGame.achievementsPct > 0 && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1 bg-black/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${spotlightGame.achievementsPct}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-bold text-emerald-400 tabular-nums">
                        {Math.round(spotlightGame.achievementsPct)}%
                      </span>
                    </div>
                  )}

                  <div className="mt-0.5">
                    <YouTubeBridgeBadge
                      ytVideosCount={spotlightGame.ytVideosCount}
                      ytRecordedHours={spotlightGame.ytRecordedHours}
                      playtimeForever={spotlightGame.playtimeForever}
                      detailed
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5 content-start">
              {visibleGames.map((game) => {
                const isSelected = spotlightGame !== null && game.appid === spotlightGame.appid;
                return (
                  <div
                    key={game.appid}
                    data-testid={`game-card-${game.appid}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedAppId(game.appid)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedAppId(game.appid);
                      }
                    }}
                    className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors duration-150 border text-left ${
                      isSelected
                        ? "bg-card border-border-medium"
                        : "bg-surface/50 hover:bg-card/70 border-border-subtle"
                    }`}
                  >
                    <div className="w-28 aspect-[460/215] rounded-md overflow-hidden bg-surface shrink-0 border border-border-subtle relative">
                      {game.headerUrl ? (
                        <img
                          src={game.headerUrl}
                          alt=""
                          className="w-full h-full object-cover object-center"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-surface/80">
                          <span
                            className="text-xs font-bold"
                            style={{ color: getGameColor(game.name) }}
                          >
                            {game.name.slice(0, 3)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span
                          className={`text-xs font-bold truncate ${
                            isSelected
                              ? "text-text-primary"
                              : "text-text-primary group-hover:text-accent"
                          }`}
                          title={game.name}
                        >
                          {game.name}
                        </span>
                        <span className="text-xs font-bold text-text-primary tabular-nums shrink-0">
                          {formatHours(game.playtimeHours)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1 text-[11px] text-text-secondary min-w-0">
                        <span className="truncate" title={game.developers}>
                          {game.developers || "Unknown developer"}
                        </span>

                        <YouTubeBridgeBadge
                          ytVideosCount={game.ytVideosCount}
                          playtimeForever={game.playtimeForever}
                          appid={game.appid}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle/50 mt-0.5">
                        {game.backlogStatus ? (
                          <span
                            data-testid={`quick-queue-${game.appid}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 shrink-0"
                          >
                            <span className="w-1 h-1 rounded-full bg-accent" />
                            {formatBacklogStatus(game.backlogStatus)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-testid={`quick-queue-${game.appid}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickQueue(game.appid, "up_next");
                            }}
                            className="text-[10px] font-medium px-2 py-0.5 rounded bg-card hover:bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle transition-colors shrink-0"
                          >
                            + Up next
                          </button>
                        )}

                        {game.personalTier ? (
                          <span
                            data-testid={`quick-rate-${game.appid}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border-medium text-text-primary shrink-0"
                          >
                            Tier {game.personalTier}
                          </span>
                        ) : (
                          <div
                            data-testid={`quick-rate-${game.appid}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-0.5 bg-[#141418] p-0.5 rounded shrink-0"
                          >
                            {TIER_OPTIONS.map(({ tier, score }) => (
                              <button
                                key={tier}
                                type="button"
                                data-tier={tier}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickRate(game.appid, tier, score);
                                }}
                                className="text-[9px] font-bold w-4 h-4 rounded text-text-muted hover:text-text-primary hover:bg-card transition-colors flex items-center justify-center"
                              >
                                {tier}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <button
                type="button"
                data-testid="inspector-load-more"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="w-full py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-card/60 hover:bg-card border border-border-subtle rounded-lg transition-colors mt-3"
              >
                Load more ({games.length - visibleCount} remaining)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
