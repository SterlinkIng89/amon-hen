import React, { useState, useMemo } from "react";
import {
  SteamGameInsight,
  TierLevel,
} from "../../utils/steamInsightsUtils";

export interface SteamPersonalTierViewProps {
  readonly allGames: readonly SteamGameInsight[];
  readonly onSaveRating: (
    appid: number,
    tier: TierLevel,
    score: number,
    notes: string
  ) => Promise<void> | void;
  readonly onRemoveRating: (appid: number) => Promise<void> | void;
}

const TIERS: readonly TierLevel[] = ["S", "A", "B", "C", "D"];

const TIER_CONFIG: Record<
  TierLevel,
  {
    readonly badgeClass: string;
    readonly borderClass: string;
    readonly textClass: string;
  }
> = {
  S: {
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/40",
    borderClass: "border-amber-500/40",
    textClass: "text-amber-400",
  },
  A: {
    badgeClass: "bg-accent/15 text-accent border-accent/40",
    borderClass: "border-accent/40",
    textClass: "text-accent",
  },
  B: {
    badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/40",
    borderClass: "border-sky-500/40",
    textClass: "text-sky-400",
  },
  C: {
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    borderClass: "border-emerald-500/40",
    textClass: "text-emerald-400",
  },
  D: {
    badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
    borderClass: "border-zinc-500/40",
    textClass: "text-zinc-400",
  },
};

const SCORE_OPTIONS: readonly number[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

function formatHours(hours: number): string {
  if (hours % 1 === 0) {
    return `${hours}h`;
  }
  return `${hours.toFixed(1)}h`;
}

function getGamePosterUrl(game: SteamGameInsight): string {
  return (
    game.posterUrl ||
    `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900_2x.jpg`
  );
}

interface TierPosterCardProps {
  readonly game: SteamGameInsight;
  readonly isSelected: boolean;
  readonly onSelect: (game: SteamGameInsight) => void;
}

function TierPosterCard({
  game,
  isSelected,
  onSelect,
}: TierPosterCardProps): React.JSX.Element {
  const posterUrl = getGamePosterUrl(game);

  return (
    <button
      type="button"
      data-testid={`tier-card-${game.appid}`}
      onClick={() => onSelect(game)}
      title={`${game.name} · Score: ${game.personalScore ?? "-"}/10 · Click to edit`}
      className={`w-24 aspect-[2/3] rounded-lg overflow-hidden border bg-surface relative group text-left cursor-pointer transition-all ${
        isSelected
          ? "border-accent ring-2 ring-accent/30"
          : "border-border-subtle hover:border-border"
      }`}
    >
      <img
        src={posterUrl}
        alt={game.name}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        onError={(e) => {
          if (game.headerUrl && e.currentTarget.src !== game.headerUrl) {
            e.currentTarget.src = game.headerUrl;
          }
        }}
      />

      {game.personalScore !== undefined && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums bg-black/80 text-foreground border border-white/10 backdrop-blur-sm">
            {game.personalScore}/10
          </span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 via-45% to-transparent pointer-events-none" />

      <div className="absolute bottom-0 left-0 right-0 p-1.5 z-10 flex flex-col">
        <span
          className="text-[11px] font-semibold text-white truncate leading-tight"
          title={game.name}
        >
          {game.name}
        </span>
        <span className="text-[9px] text-foreground-muted tabular-nums">
          {formatHours(game.playtimeHours)}
        </span>
      </div>
    </button>
  );
}

interface TierInlineEditorProps {
  readonly game: SteamGameInsight;
  readonly onSave: (
    appid: number,
    tier: TierLevel,
    score: number,
    notes: string
  ) => void;
  readonly onRemove: (appid: number) => void;
  readonly onCancel: () => void;
}

function TierInlineEditor({
  game,
  onSave,
  onRemove,
  onCancel,
}: TierInlineEditorProps): React.JSX.Element {
  const [selectedTier, setSelectedTier] = useState<TierLevel>(
    game.personalTier ?? "A"
  );
  const [selectedScore, setSelectedScore] = useState<number>(
    game.personalScore ?? 8
  );
  const [notes, setNotes] = useState<string>(game.personalNotes ?? "");

  const handleSave = (): void => {
    onSave(game.appid, selectedTier, selectedScore, notes);
  };

  const handleRemove = (): void => {
    onRemove(game.appid);
  };

  const posterUrl = getGamePosterUrl(game);

  return (
    <div
      data-testid="tier-editor-panel"
      className="p-4 rounded-xl bg-surface border border-accent/40 flex flex-col md:flex-row gap-4 items-start animate-in fade-in duration-200"
    >
      <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden border border-border-subtle bg-black shrink-0 relative hidden sm:block">
        <img
          src={posterUrl}
          alt={game.name}
          className="w-full h-full object-cover"
        />
      </div>

      <div className="flex-1 flex flex-col gap-3 min-w-0 w-full">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h4 className="text-sm font-bold text-foreground truncate max-w-md">
              Editing Rating: {game.name}
            </h4>
            <p className="text-xs text-foreground-muted">
              {formatHours(game.playtimeHours)} Steam playtime ·{" "}
              {game.developers || "Unknown Developer"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid={`tier-remove-${game.appid}`}
              onClick={handleRemove}
              className="px-2.5 py-1 text-xs font-medium rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
            >
              Remove Rating
            </button>
            <button
              type="button"
              data-testid="tier-editor-cancel"
              onClick={onCancel}
              className="p-1 rounded-lg text-foreground-muted hover:text-foreground hover:bg-elevated transition-colors"
              title="Close editor"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground-muted">
              Tier:
            </span>
            <div className="flex items-center gap-1">
              {TIERS.map((tier) => {
                const config = TIER_CONFIG[tier];
                const active = selectedTier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    data-testid={`tier-select-btn-${tier}`}
                    onClick={() => setSelectedTier(tier)}
                    className={`w-7 h-7 rounded-md text-xs font-bold border transition-all ${
                      active
                        ? `${config.badgeClass} ring-2 ring-offset-1 ring-offset-surface ring-accent`
                        : "bg-surface border-border-subtle text-foreground-muted hover:text-foreground hover:border-border"
                    }`}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <label
              htmlFor="tier-score-select"
              className="text-xs font-medium text-foreground-muted"
            >
              Score:
            </label>
            <select
              id="tier-score-select"
              data-testid="tier-editor-score"
              value={selectedScore}
              onChange={(e) => setSelectedScore(Number(e.target.value))}
              aria-label="Personal Score"
              className="px-2.5 py-1 rounded-md bg-elevated border border-border-subtle text-xs font-semibold text-foreground focus:outline-hidden focus:border-accent"
            >
              {SCORE_OPTIONS.map((score) => (
                <option key={score} value={score}>
                  {score}/10
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1 w-full">
          <label
            htmlFor="tier-notes-input"
            className="text-xs font-medium text-foreground-muted"
          >
            Personal Notes & Impressions:
          </label>
          <textarea
            id="tier-notes-input"
            data-testid="tier-editor-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add personal notes, review or impressions..."
            className="w-full px-3 py-2 rounded-lg bg-elevated border border-border-subtle text-xs text-foreground placeholder:text-foreground-muted focus:outline-hidden focus:border-accent resize-y"
          />
        </div>

        <div className="flex items-center justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-elevated rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="tier-editor-save"
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
          >
            Save Rating
          </button>
        </div>
      </div>
    </div>
  );
}

interface UnratedGameRowProps {
  readonly game: SteamGameInsight;
  readonly onSaveRating: (
    appid: number,
    tier: TierLevel,
    score: number,
    notes: string
  ) => void;
}

function UnratedGameRow({
  game,
  onSaveRating,
}: UnratedGameRowProps): React.JSX.Element {
  const [score, setScore] = useState<number>(8);

  const handleQuickRate = (tier: TierLevel): void => {
    onSaveRating(game.appid, tier, score, "");
  };

  return (
    <div
      data-testid={`unrated-row-${game.appid}`}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-16 h-8 rounded overflow-hidden bg-black/40 shrink-0 border border-border-subtle">
          {game.headerUrl ? (
            <img
              src={game.headerUrl}
              alt={game.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-elevated" />
          )}
        </div>

        <div className="min-w-0">
          <h5
            className="text-xs font-bold text-foreground truncate"
            title={game.name}
          >
            {game.name}
          </h5>
          <span className="text-[11px] text-foreground-muted tabular-nums">
            {formatHours(game.playtimeHours)} played
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <div className="flex items-center gap-1">
          <label
            htmlFor={`score-select-${game.appid}`}
            className="text-[11px] text-foreground-muted hidden md:inline"
          >
            Score:
          </label>
          <select
            id={`score-select-${game.appid}`}
            data-testid={`unrated-score-${game.appid}`}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            aria-label={`Score for ${game.name}`}
            className="px-2 py-1 rounded bg-elevated border border-border-subtle text-xs font-semibold text-foreground focus:outline-hidden focus:border-accent"
          >
            {SCORE_OPTIONS.map((val) => (
              <option key={val} value={val}>
                {val}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          {TIERS.map((tier) => {
            const config = TIER_CONFIG[tier];
            return (
              <button
                key={tier}
                type="button"
                data-testid={`rate-btn-${game.appid}-${tier}`}
                onClick={() => handleQuickRate(tier)}
                title={`Rate ${tier} (${score}/10)`}
                className={`w-7 h-7 rounded text-xs font-bold border transition-colors ${config.badgeClass} hover:opacity-85`}
              >
                {tier}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SteamPersonalTierView({
  allGames,
  onSaveRating,
  onRemoveRating,
}: SteamPersonalTierViewProps): React.JSX.Element {
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Group rated games by Tier
  const tierBuckets = useMemo(() => {
    const buckets: Record<TierLevel, SteamGameInsight[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
    };

    for (const game of allGames) {
      if (game.personalTier && buckets[game.personalTier]) {
        buckets[game.personalTier].push(game);
      }
    }

    // Sort games in each tier descending by personalScore then playtimeForever
    for (const tier of TIERS) {
      buckets[tier].sort((a, b) => {
        const scoreA = a.personalScore ?? 0;
        const scoreB = b.personalScore ?? 0;
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return b.playtimeForever - a.playtimeForever;
      });
    }

    return buckets;
  }, [allGames]);

  // Selected game for editing
  const selectedGame = useMemo(() => {
    if (selectedGameId === null) return null;
    return allGames.find((g) => g.appid === selectedGameId) ?? null;
  }, [allGames, selectedGameId]);

  // Unrated played games
  const unratedGames = useMemo(() => {
    const unrated = allGames.filter(
      (g) => !g.personalTier && !g.isUtility && g.playtimeForever > 0
    );

    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      // Default: top 10 most played unrated games
      return unrated
        .sort((a, b) => b.playtimeForever - a.playtimeForever)
        .slice(0, 10);
    }

    return unrated
      .filter((g) => g.name.toLowerCase().includes(q))
      .sort((a, b) => b.playtimeForever - a.playtimeForever);
  }, [allGames, searchQuery]);

  const handleSave = async (
    appid: number,
    tier: TierLevel,
    score: number,
    notes: string
  ): Promise<void> => {
    await onSaveRating(appid, tier, score, notes);
    setSelectedGameId(null);
  };

  const handleRemove = async (appid: number): Promise<void> => {
    await onRemoveRating(appid);
    setSelectedGameId(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Personal Tier Board
            </h3>
            <p className="text-xs text-foreground-muted">
              Curate and rank your played games across S, A, B, C, and D tiers with personal 1–10 scores.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {TIERS.map((tier) => {
            const config = TIER_CONFIG[tier];
            const gamesInTier = tierBuckets[tier];

            return (
              <div
                key={tier}
                data-testid={`tier-row-${tier}`}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-lg bg-surface/50 border border-border-subtle"
              >
                <div
                  className={`w-14 shrink-0 rounded-lg border flex flex-col items-center justify-center p-2 self-start sm:self-auto ${config.badgeClass}`}
                >
                  <span className="text-xl font-black leading-none">
                    {tier}
                  </span>
                  <span className="text-[10px] font-semibold opacity-80 mt-1 tabular-nums">
                    {gamesInTier.length} {gamesInTier.length === 1 ? "game" : "games"}
                  </span>
                </div>

                <div className="flex-1 flex flex-wrap items-center gap-2.5 min-h-[96px]">
                  {gamesInTier.length === 0 ? (
                    <span className="text-xs text-foreground-muted italic py-4 px-2">
                      No games rated in Tier {tier} yet
                    </span>
                  ) : (
                    gamesInTier.map((game) => (
                      <TierPosterCard
                        key={game.appid}
                        game={game}
                        isSelected={selectedGameId === game.appid}
                        onSelect={(g) =>
                          setSelectedGameId((prev) =>
                            prev === g.appid ? null : g.appid
                          )
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedGame && (
        <TierInlineEditor
          key={selectedGame.appid}
          game={selectedGame}
          onSave={handleSave}
          onRemove={handleRemove}
          onCancel={() => setSelectedGameId(null)}
        />
      )}

      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Rate Your Played Games
            </h4>
            <p className="text-xs text-foreground-muted">
              Quickly assign personal tiers and scores to games in your library.
            </p>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              data-testid="tier-rate-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search games to rate..."
              className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-foreground placeholder:text-foreground-muted focus:outline-hidden focus:border-accent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {unratedGames.length === 0 ? (
            <div className="p-6 text-center text-xs text-foreground-muted bg-surface/50 rounded-lg border border-border-subtle">
              {searchQuery.trim()
                ? `No unrated games matching "${searchQuery}"`
                : "All played games have been rated! Awesome collection."}
            </div>
          ) : (
            unratedGames.map((game) => (
              <UnratedGameRow
                key={game.appid}
                game={game}
                onSaveRating={onSaveRating}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
