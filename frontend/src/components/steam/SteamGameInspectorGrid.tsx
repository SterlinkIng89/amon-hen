import React, { useState, useMemo } from "react";
import {
  SteamGameInsight,
  BacklogStatus,
  TierLevel,
  InspectorSortMode,
  sortSteamGames,
  tierToDefaultScore,
} from "../../utils/steamInsightsUtils";
import { getGameColor } from "../../utils/tagColors";
import { SteamGameRatingPopover } from "./SteamGameRatingPopover";

export interface SteamGameInspectorGridProps {
  readonly games: readonly SteamGameInsight[];
  readonly activeFilterTitle: string;
  readonly hasActiveFilter: boolean;
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly onClearFilters: () => void;
  readonly onQuickQueue: (appid: number, status: BacklogStatus) => void;
  readonly onQuickRate: (appid: number, tier: TierLevel, score: number) => void;
  readonly onRemoveRating?: (appid: number) => void;
  readonly onRemoveBacklog?: (appid: number) => void;
  readonly sortBy?: InspectorSortMode;
  readonly onSortChange?: (sort: InspectorSortMode) => void;
}

const PAGE_SIZE = 24;

const TIER_OPTIONS: readonly { tier: TierLevel; score: number }[] = [
  { tier: "S", score: 10 },
  { tier: "A", score: 8 },
  { tier: "B", score: 6 },
  { tier: "C", score: 4 },
  { tier: "D", score: 2 },
];


function formatHours(hours: number): string {
  if (hours % 1 === 0) {
    return `${hours}h`;
  }
  return `${hours.toFixed(1)}h`;
}

function YouTubeBridgeBadge({
  count,
  hours,
  appid,
}: {
  count: number;
  hours: number;
  appid?: number;
}): React.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <span
      data-testid={appid !== undefined ? `yt-badge-${appid}` : undefined}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-fire/15 text-[#f87171] border border-fire/30"
      title={`${count} recorded YouTube videos totaling ${hours.toFixed(1)}h`}
    >
      <svg
        className="w-2.5 h-2.5 fill-current shrink-0"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
      <span>{count} YT vids</span>
    </span>
  );
}

function AchievementBadge({
  pct,
  unrecordedGem,
  appid,
}: {
  pct: number;
  unrecordedGem?: boolean;
  appid?: number;
}): React.JSX.Element | null {
  if (unrecordedGem) {
    return (
      <span
        data-testid={appid !== undefined ? `unrecorded-gem-${appid}` : "unrecorded-gem-badge"}
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
        title="Unrecorded Gem: played 10+ hours with zero recorded YouTube coverage"
      >
        Unrecorded gem
      </span>
    );
  }

  if (pct === 100) {
    return (
      <span
        data-testid="perfect-game-badge"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
      >
        <span>★</span>
        <span>100%</span>
      </span>
    );
  }

  if (pct >= 80) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface text-text-secondary border border-border-subtle">
        {pct}%
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
  onRemoveRating,
  onRemoveBacklog,
  sortBy,
  onSortChange,
}: SteamGameInspectorGridProps): React.JSX.Element {
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [internalSortBy, setInternalSortBy] = useState<InspectorSortMode>("hours");
  const [editingRateAppId, setEditingRateAppId] = useState<number | null>(null);

  const toggleRatingPopover = (e: React.MouseEvent, appid: number) => {
    e.stopPropagation();
    setEditingRateAppId((prev) => (prev === appid ? null : appid));
  };

  const effectiveSortBy = sortBy ?? internalSortBy;
  const handleSortChange = (newSort: InspectorSortMode) => {
    if (onSortChange) {
      onSortChange(newSort);
    } else {
      setInternalSortBy(newSort);
    }
  };

  const sortedGames = useMemo(() => {
    return sortSteamGames(games, effectiveSortBy);
  }, [games, effectiveSortBy]);

  const spotlightIndex = useMemo(() => {
    if (sortedGames.length === 0) return -1;
    const idx = sortedGames.findIndex((g) => g.appid === selectedAppId);
    return idx >= 0 ? idx : 0;
  }, [sortedGames, selectedAppId]);

  const spotlightGame = spotlightIndex >= 0 ? sortedGames[spotlightIndex] : null;
  const spotlightRank = spotlightIndex + 1;

  const visibleGames = sortedGames.slice(0, visibleCount);
  const hasMore = sortedGames.length > visibleCount;

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

        <div className="flex items-center gap-2">
          <select
            data-testid="inspector-sort-select"
            value={effectiveSortBy}
            onChange={(e) => handleSortChange(e.target.value as InspectorSortMode)}
            style={{ colorScheme: "dark" }}
            className="bg-surface border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-border-medium"
          >
            <option value="hours" className="bg-[#18181b] text-text-primary">Most played</option>
            <option value="score" className="bg-[#18181b] text-text-primary">Highest rated</option>
            <option value="achievements" className="bg-[#18181b] text-text-primary">Achievements %</option>
            <option value="recent" className="bg-[#18181b] text-text-primary">Recent 2w</option>
            <option value="name" className="bg-[#18181b] text-text-primary">Name A–Z</option>
          </select>

          <div className="relative w-40 sm:w-56">
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
                    <span className="text-[10px] font-bold text-text-primary">
                      #{spotlightRank}{" "}
                    </span>
                    <span className="text-[10px] text-text-secondary">
                      {selectedAppId !== null
                        ? "selected"
                        : effectiveSortBy === "hours"
                        ? "Top played"
                        : "Spotlight"}
                    </span>
                  </span>

                  <h4 className="text-xs font-bold text-text-primary line-clamp-1 leading-snug">
                    {spotlightGame.name}
                  </h4>

                  {spotlightGame.personalTier && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface/90 border border-border-subtle text-[10px] font-bold text-text-primary w-fit">
                      Tier {spotlightGame.personalTier} · {spotlightGame.personalScore ?? tierToDefaultScore(spotlightGame.personalTier)}/10
                    </span>
                  )}

                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-extrabold text-text-primary tabular-nums">
                      {formatHours(spotlightGame.playtimeHours)}
                    </span>
                    {spotlightGame.playtime2Weeks > 0 && (
                      <span className="text-[10px] text-accent font-medium tabular-nums">
                        {formatHours(spotlightGame.playtime2Weeks / 60)} last 2w
                      </span>
                    )}
                  </div>

                  {spotlightGame.personalNotes && (
                    <p className="text-[10px] text-text-muted italic line-clamp-2 border-t border-border-subtle pt-1 mt-0.5">
                      {spotlightGame.personalNotes}
                    </p>
                  )}

                  <div className="pt-0.5">
                    <AchievementBadge
                      pct={spotlightGame.achievementsPct}
                      unrecordedGem={
                        spotlightGame.ytVideosCount === 0 && spotlightGame.playtimeHours >= 10
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2">
              {visibleGames.map((game, index) => {
                const isSelected = (spotlightGame?.appid ?? -1) === game.appid;
                const isUnrecordedGem =
                  game.ytVideosCount === 0 && game.playtimeHours >= 10;
                const rank = index + 1;

                return (
                  <div
                    key={game.appid}
                    data-testid={`game-card-${game.appid}`}
                    onClick={() => setSelectedAppId(game.appid)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-card border-accent/40 shadow-xs"
                        : "bg-surface/60 hover:bg-card/70 border-border-subtle hover:border-border-medium"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative w-20 h-10 rounded-md overflow-hidden bg-elevated shrink-0 border border-border-subtle">
                        {game.headerUrl ? (
                          <img
                            src={game.headerUrl}
                            alt={game.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white/80"
                            style={{ backgroundColor: getGameColor(game.name) }}
                          >
                            #{rank}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-text-primary truncate">
                            {game.name}
                          </h4>
                          {game.achievementsPct === 100 && (
                            <span
                              className="text-[9px] text-amber-300 font-bold"
                              title="100% Achievements"
                            >
                              ★
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-secondary truncate">
                          {game.developers || game.publishers || "Unknown studio"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-1.5 shrink-0 w-full sm:w-auto">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-primary tabular-nums">
                          {formatHours(game.playtimeHours)}
                        </span>
                        <YouTubeBridgeBadge
                          appid={game.appid}
                          count={game.ytVideosCount}
                          hours={game.ytRecordedHours}
                        />
                        <AchievementBadge
                          appid={game.appid}
                          pct={game.achievementsPct}
                          unrecordedGem={isUnrecordedGem}
                        />
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {game.backlogStatus ? (
                          <div
                            data-testid={`quick-queue-${game.appid}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface border border-border-subtle hover:border-border-medium transition-colors text-[10px] text-text-primary shrink-0"
                          >
                            <select
                              data-testid={`quick-queue-select-${game.appid}`}
                              value={game.backlogStatus}
                              onChange={(e) =>
                                onQuickQueue(game.appid, e.target.value as BacklogStatus)
                              }
                              style={{ colorScheme: "dark" }}
                              className="bg-transparent text-[10px] font-semibold text-text-primary cursor-pointer focus:outline-none pr-0.5"
                            >
                              <option value="playing" className="bg-[#18181b] text-text-primary">Playing</option>
                              <option value="up_next" className="bg-[#18181b] text-text-primary">Up next</option>
                              <option value="candidate" className="bg-[#18181b] text-text-primary">Candidate</option>
                              <option value="on_hold" className="bg-[#18181b] text-text-primary">On hold</option>
                              <option value="dropped" className="bg-[#18181b] text-text-primary">Dropped</option>
                            </select>
                            <button
                              type="button"
                              data-testid={`quick-queue-clear-${game.appid}`}
                              title="Remove from queue"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveBacklog?.(game.appid);
                              }}
                              className="text-[10px] text-text-muted hover:text-red-400 font-bold px-0.5 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
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

                        <div className="relative">
                          {game.personalTier ? (
                            <div
                              data-testid={`quick-rate-${game.appid}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 shrink-0"
                            >
                              <button
                                type="button"
                                data-testid={`quick-rate-edit-${game.appid}`}
                                onClick={(e) => toggleRatingPopover(e, game.appid)}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border-medium text-text-primary hover:border-accent transition-colors shrink-0"
                              >
                                Tier {game.personalTier} ·{" "}
                                {game.personalScore ??
                                  tierToDefaultScore(game.personalTier)}
                                /10
                              </button>
                              <button
                                type="button"
                                data-testid={`quick-rate-clear-${game.appid}`}
                                title="Remove rating"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingRateAppId(null);
                                  onRemoveRating?.(game.appid);
                                }}
                                className="text-[10px] text-text-muted hover:text-red-400 font-bold px-1 py-0.5 rounded hover:bg-card transition-colors"
                              >
                                ✕
                              </button>
                            </div>
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
                              <button
                                type="button"
                                data-testid={`quick-score-open-${game.appid}`}
                                onClick={(e) => toggleRatingPopover(e, game.appid)}
                                className="text-[9px] font-bold px-1 h-4 rounded text-text-muted hover:text-accent hover:bg-card transition-colors flex items-center justify-center border-l border-border-subtle ml-0.5"
                              >
                                1-10
                              </button>
                            </div>
                          )}

                          {editingRateAppId === game.appid && (
                            <SteamGameRatingPopover
                              appid={game.appid}
                              initialTier={game.personalTier}
                              initialScore={game.personalScore}
                              onRate={(tier, score) =>
                                onQuickRate(game.appid, tier, score)
                              }
                              onRemoveRating={
                                onRemoveRating
                                  ? () => onRemoveRating(game.appid)
                                  : undefined
                              }
                              onClose={() => setEditingRateAppId(null)}
                            />
                          )}
                        </div>
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
