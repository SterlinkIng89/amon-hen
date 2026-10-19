import React, { useState, useMemo, useEffect } from "react";
import {
  SteamGameInsight,
  BacklogStatus,
  computeSmartBacklogSuggestions,
  pickBacklogRouletteGame,
} from "../../utils/steamInsightsUtils";

export interface SteamBacklogViewProps {
  readonly allGames: readonly SteamGameInsight[];
  readonly topGenres: readonly string[];
  readonly topDevs: readonly string[];
  readonly onUpsertBacklog: (
    appid: number,
    status: BacklogStatus,
    notes: string
  ) => Promise<void> | void;
  readonly onReorderBacklog: (orderedAppIds: number[]) => Promise<void> | void;
  readonly onRemoveBacklog: (appid: number) => Promise<void> | void;
}

type FilterTab = "all" | BacklogStatus;

const STATUS_TABS: readonly { id: FilterTab; label: string }[] = [
  { id: "all", label: "All queued" },
  { id: "playing", label: "Playing" },
  { id: "up_next", label: "Up next" },
  { id: "candidate", label: "Candidate" },
  { id: "on_hold", label: "On hold" },
  { id: "dropped", label: "Dropped" },
];

const STATUS_OPTIONS: readonly { value: BacklogStatus; label: string }[] = [
  { value: "playing", label: "Playing" },
  { value: "up_next", label: "Up next" },
  { value: "candidate", label: "Candidate" },
  { value: "on_hold", label: "On hold" },
  { value: "dropped", label: "Dropped" },
];

function formatHours(hours: number): string {
  return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
}

interface BacklogItemRowProps {
  readonly game: SteamGameInsight & { backlogStatus: BacklogStatus };
  readonly rank: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onStatusChange: (status: BacklogStatus) => void;
  readonly onNoteCommit: (notes: string) => void;
  readonly onRemove: () => void;
}

function BacklogItemRow({
  game,
  rank,
  isFirst,
  isLast,
  onMove,
  onStatusChange,
  onNoteCommit,
  onRemove,
}: BacklogItemRowProps): React.JSX.Element {
  const [note, setNote] = useState(game.backlogNotes ?? "");

  useEffect(() => {
    setNote(game.backlogNotes ?? "");
  }, [game.backlogNotes]);

  const handleBlur = (): void => {
    if (note !== (game.backlogNotes ?? "")) {
      onNoteCommit(note);
    }
  };

  return (
    <div
      data-testid={`backlog-row-${game.appid}`}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex flex-col items-center shrink-0">
          <span className="text-xs font-bold text-accent tabular-nums w-7 text-center">
            #{rank}
          </span>
          <div className="flex items-center gap-0.5 mt-0.5">
            <button
              type="button"
              data-testid={`backlog-move-up-${game.appid}`}
              disabled={isFirst}
              onClick={() => onMove(-1)}
              title="Move up"
              className="p-1 rounded text-foreground-muted hover:text-foreground hover:bg-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              type="button"
              data-testid={`backlog-move-down-${game.appid}`}
              disabled={isLast}
              onClick={() => onMove(1)}
              title="Move down"
              className="p-1 rounded text-foreground-muted hover:text-foreground hover:bg-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        <img
          src={game.headerUrl}
          alt={game.name}
          className="w-24 aspect-[460/215] rounded-md object-cover border border-border-subtle shrink-0"
        />

        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {game.name}
            </span>
            <span className="text-[11px] text-foreground-muted tabular-nums shrink-0">
              {formatHours(game.playtimeHours)}
            </span>
          </div>

          <div className="text-[11px] text-foreground-muted truncate">
            {game.developers || "Unknown studio"}
          </div>

          <input
            type="text"
            data-testid={`backlog-note-${game.appid}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            placeholder="Add note..."
            className="text-xs px-2 py-0.5 rounded bg-elevated/40 border border-border-subtle text-foreground placeholder:text-foreground-muted/60 focus:outline-none focus:border-accent w-full max-w-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        <select
          data-testid={`backlog-status-${game.appid}`}
          value={game.backlogStatus}
          onChange={(e) => onStatusChange(e.target.value as BacklogStatus)}
          className="text-xs px-2.5 py-1 rounded bg-elevated border border-border-subtle text-foreground focus:outline-none focus:border-accent cursor-pointer"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          data-testid={`backlog-remove-${game.appid}`}
          onClick={onRemove}
          title="Remove from queue"
          className="p-1.5 rounded text-foreground-muted hover:text-red-400 hover:bg-elevated transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SteamBacklogView({
  allGames,
  topGenres,
  topDevs,
  onUpsertBacklog,
  onReorderBacklog,
  onRemoveBacklog,
}: SteamBacklogViewProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchAddQuery, setSearchAddQuery] = useState("");
  const [selectedRouletteGenre, setSelectedRouletteGenre] = useState<string>("All genres");
  const [roulettePick, setRoulettePick] = useState<SteamGameInsight | null>(null);
  const [hasSpun, setHasSpun] = useState(false);

  const sortedQueuedGames = useMemo(() => {
    return allGames
      .filter((game): game is SteamGameInsight & { backlogStatus: BacklogStatus } =>
        Boolean(game.backlogStatus)
      )
      .slice()
      .sort((a, b) => {
        const rankA = a.backlogRank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.backlogRank ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return a.name.localeCompare(b.name);
      });
  }, [allGames]);

  const displayedQueuedGames = useMemo(() => {
    if (activeTab === "all") {
      return sortedQueuedGames;
    }
    return sortedQueuedGames.filter((game) => game.backlogStatus === activeTab);
  }, [sortedQueuedGames, activeTab]);

  const smartSuggestions = useMemo(() => {
    return computeSmartBacklogSuggestions(allGames, topGenres, topDevs, 8);
  }, [allGames, topGenres, topDevs]);

  const searchAddCandidates = useMemo(() => {
    const q = searchAddQuery.trim().toLowerCase();
    if (!q) return [];
    return allGames
      .filter(
        (game) =>
          !game.backlogStatus &&
          !game.isUtility &&
          game.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allGames, searchAddQuery]);

  const handleMove = (indexInFullQueue: number, direction: -1 | 1): void => {
    const targetIndex = indexInFullQueue + direction;
    if (targetIndex < 0 || targetIndex >= sortedQueuedGames.length) {
      return;
    }

    const reordered = sortedQueuedGames.slice();
    const [movedItem] = reordered.splice(indexInFullQueue, 1);
    reordered.splice(targetIndex, 0, movedItem);

    onReorderBacklog(reordered.map((g) => g.appid));
  };

  const handleSpinRoulette = (): void => {
    setHasSpun(true);
    const filterGenre =
      selectedRouletteGenre === "All genres" ? undefined : selectedRouletteGenre;
    setRoulettePick(pickBacklogRouletteGame(allGames, filterGenre));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 items-start">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Up next & candidate queue
            </h2>
            <p className="text-xs text-foreground-muted">
              {sortedQueuedGames.length} {sortedQueuedGames.length === 1 ? "game" : "games"} in priority order
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              data-testid="backlog-add-search"
              value={searchAddQuery}
              onChange={(e) => setSearchAddQuery(e.target.value)}
              placeholder="Add game to queue..."
              className="w-full text-xs px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent"
            />

            {searchAddCandidates.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border-subtle rounded-lg shadow-sm z-20 max-h-56 overflow-y-auto p-1 flex flex-col gap-1">
                {searchAddCandidates.map((candidate) => (
                  <div
                    key={candidate.appid}
                    className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-elevated/60 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={candidate.headerUrl}
                        alt=""
                        className="w-10 aspect-[460/215] rounded object-cover border border-border-subtle shrink-0"
                      />
                      <span className="truncate text-foreground font-medium">
                        {candidate.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid={`backlog-add-game-${candidate.appid}`}
                      onClick={() => {
                        onUpsertBacklog(candidate.appid, "candidate", "");
                        setSearchAddQuery("");
                      }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle pb-3">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.id === "all"
                ? sortedQueuedGames.length
                : sortedQueuedGames.filter((g) => g.backlogStatus === tab.id).length;

            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface hover:bg-elevated text-foreground-muted hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1 py-0.2 rounded-full ${
                    isActive ? "bg-accent-foreground/20 text-accent-foreground" : "bg-elevated text-foreground-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {displayedQueuedGames.length === 0 ? (
          <div className="py-10 text-center text-xs text-foreground-muted">
            No games queued under this category. Search above or use recommendations to add one.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayedQueuedGames.map((game) => {
              const fullQueueIndex = sortedQueuedGames.findIndex(
                (g) => g.appid === game.appid
              );
              return (
                <BacklogItemRow
                  key={game.appid}
                  game={game}
                  rank={fullQueueIndex + 1}
                  isFirst={fullQueueIndex === 0}
                  isLast={fullQueueIndex === sortedQueuedGames.length - 1}
                  onMove={(dir) => handleMove(fullQueueIndex, dir)}
                  onStatusChange={(status) =>
                    onUpsertBacklog(game.appid, status, game.backlogNotes ?? "")
                  }
                  onNoteCommit={(notes) =>
                    onUpsertBacklog(game.appid, game.backlogStatus, notes)
                  }
                  onRemove={() => onRemoveBacklog(game.appid)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Backlog Roulette
            </h3>
            <p className="text-xs text-foreground-muted">
              Can't decide? Draw a random unplayed or tried game from your backlog.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRouletteGenre}
              onChange={(e) => setSelectedRouletteGenre(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle text-foreground focus:outline-none focus:border-accent flex-1 cursor-pointer"
            >
              <option value="All genres">All genres</option>
              {topGenres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="roulette-spin-btn"
              onClick={handleSpinRoulette}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors shrink-0"
            >
              Spin roulette
            </button>
          </div>

          {hasSpun && (
            <div className="mt-1">
              {roulettePick ? (
                <div
                  data-testid="roulette-result-card"
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-border-subtle"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={roulettePick.headerUrl}
                      alt={roulettePick.name}
                      className="w-16 aspect-[460/215] rounded object-cover border border-border-subtle shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {roulettePick.name}
                      </div>
                      <div className="text-[11px] text-foreground-muted truncate">
                        {roulettePick.developers} · {formatHours(roulettePick.playtimeHours)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="roulette-queue-btn"
                    onClick={() =>
                      onUpsertBacklog(
                        roulettePick.appid,
                        "up_next",
                        "Picked via Backlog Roulette"
                      )
                    }
                    className="px-2.5 py-1 rounded text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0"
                  >
                    + Queue as Up Next
                  </button>
                </div>
              ) : (
                <div className="text-xs text-foreground-muted text-center py-3 bg-surface rounded-lg border border-border-subtle">
                  No eligible games found for this genre.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Smart backlog suggestions
            </h3>
            <p className="text-xs text-foreground-muted">
              Unplayed or under 2h games matching your top genres and studios.
            </p>
          </div>

          {smartSuggestions.length === 0 ? (
            <div className="text-xs text-foreground-muted text-center py-6">
              No matching backlog games found to suggest.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {smartSuggestions.map((item) => (
                <div
                  key={item.game.appid}
                  data-testid={`suggestion-row-${item.game.appid}`}
                  className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <img
                      src={item.game.headerUrl}
                      alt={item.game.name}
                      className="w-16 aspect-[460/215] rounded object-cover border border-border-subtle shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate">
                        {item.game.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {item.matchReasons.map((reason) => (
                          <span
                            key={reason}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`suggestion-add-${item.game.appid}`}
                    onClick={() =>
                      onUpsertBacklog(
                        item.game.appid,
                        "candidate",
                        item.matchReasons.join(" · ")
                      )
                    }
                    className="px-2.5 py-1 rounded text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0"
                  >
                    + Candidate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
