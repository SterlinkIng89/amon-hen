import React from "react";
import type { TopGame, TopGamesScope } from "../../utils/heatmapTopGames";
import { getGameColor } from "../../utils/tagColors";

interface HeatmapGameLegendProps {
  readonly games: readonly TopGame[];
  readonly scope: TopGamesScope;
  readonly onScopeChange: (scope: TopGamesScope) => void;
  readonly showScopeToggle: boolean;
}

export const HeatmapGameLegend: React.FC<HeatmapGameLegendProps> = ({
  games,
  scope,
  onScopeChange,
  showScopeToggle,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
      {games.length === 0 ? (
        <span className="text-text-muted text-xs">No game activity</span>
      ) : (
        games.map((g) => (
          <div
            key={g.game}
            className="flex items-center gap-1.5 min-w-0"
            title={`${g.game} (${g.hours.toFixed(1)}h · ${g.sessions} sessions)`}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: getGameColor(g.game) }}
            />
            <span className="truncate max-w-[120px] text-text-muted hover:text-text-primary transition-colors">
              {g.game}
            </span>
          </div>
        ))
      )}

      {showScopeToggle && (
        <div className="flex items-center bg-[#141418] p-0.5 rounded-md border-0 ml-1">
          <button
            type="button"
            onClick={() => onScopeChange("year")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              scope === "year"
                ? "bg-accent text-white font-semibold shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Year
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("all")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              scope === "all"
                ? "bg-accent text-white font-semibold shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            All time
          </button>
        </div>
      )}
    </div>
  );
};
