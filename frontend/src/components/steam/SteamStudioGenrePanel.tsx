import React, { useState, useMemo, useEffect } from "react";
import { getGameColor } from "../../utils/tagColors";
import type { GroupRatingStatsMap, GroupRatingStat } from "../../utils/steamInsightsUtils";

export type StudioGenreTab = "developers" | "publishers" | "genres" | "features";
export type StudioSortMode = "hours" | "games" | "avg" | "rating";

export interface SteamStudioStatItem {
  readonly name: string;
  readonly totalHours: number;
  readonly gamesCount: number;
  readonly playedCount?: number;
  readonly avgHours?: number;
}

export interface SteamTagStatItem {
  readonly tag: string;
  readonly category?: string;
  readonly totalHours: number;
  readonly gamesCount: number;
  readonly avgHours?: number;
}

export interface SelectedGroupFilter {
  readonly type: StudioGenreTab;
  readonly name: string;
}

export interface SteamStudioGenrePanelProps {
  readonly developers: readonly SteamStudioStatItem[];
  readonly publishers: readonly SteamStudioStatItem[];
  readonly tags: readonly SteamTagStatItem[];
  readonly sortBy: StudioSortMode;
  readonly onSortChange: (sort: StudioSortMode) => void;
  readonly selectedGroup: SelectedGroupFilter | null;
  readonly onSelectGroup: (group: SelectedGroupFilter | null) => void;
  readonly ratingStatsMap?: GroupRatingStatsMap;
}

interface NormalizedStatItem {
  readonly name: string;
  readonly totalHours: number;
  readonly gamesCount: number;
  readonly avgHours: number;
  readonly avgScore: number;
  readonly ratedCount: number;
}

interface TabOption {
  readonly key: StudioGenreTab;
  readonly label: string;
  readonly testId: string;
}

const TAB_OPTIONS: readonly TabOption[] = [
  { key: "developers", label: "Developers", testId: "tab-developers" },
  { key: "publishers", label: "Publishers", testId: "tab-publishers" },
  { key: "genres", label: "Genres", testId: "tab-genres" },
  { key: "features", label: "Features", testId: "tab-features" },
];

const SORT_OPTIONS: readonly { key: StudioSortMode; label: string; testId: string }[] = [
  { key: "hours", label: "Hours", testId: "sort-hours" },
  { key: "games", label: "Games", testId: "sort-games" },
  { key: "avg", label: "Avg h/g", testId: "sort-avg" },
  { key: "rating", label: "★ Score", testId: "sort-rating" },
];

const PAGE_SIZE = 25;

function toNormalizedItem(
  name: string,
  totalHours: number,
  gamesCount: number,
  avgHours?: number,
  ratingStat?: GroupRatingStat
): NormalizedStatItem {
  return {
    name,
    totalHours,
    gamesCount,
    avgHours: avgHours ?? (gamesCount > 0 ? totalHours / gamesCount : 0),
    avgScore: ratingStat?.avgScore ?? 0,
    ratedCount: ratingStat?.ratedCount ?? 0,
  };
}

function formatHours(hours: number): string {
  if (hours >= 1000) {
    return `${hours.toLocaleString()}h`;
  }
  return `${hours}h`;
}

function getMetricLabels(
  item: NormalizedStatItem,
  sortBy: StudioSortMode
): { primary: string; secondary: string } {
  if (sortBy === "games") {
    return {
      primary: `${item.gamesCount} ${item.gamesCount === 1 ? "game" : "games"}`,
      secondary: formatHours(item.totalHours),
    };
  }
  if (sortBy === "avg") {
    return {
      primary: `${item.avgHours.toFixed(1)}h/g`,
      secondary: formatHours(item.totalHours),
    };
  }
  if (sortBy === "rating") {
    return {
      primary: item.ratedCount > 0 ? `★ ${item.avgScore.toFixed(1)}` : "Unrated",
      secondary: formatHours(item.totalHours),
    };
  }
  return {
    primary: formatHours(item.totalHours),
    secondary: `${item.gamesCount}g`,
  };
}

export function SteamStudioGenrePanel({
  developers,
  publishers,
  tags,
  sortBy,
  onSortChange,
  selectedGroup,
  onSelectGroup,
  ratingStatsMap,
}: SteamStudioGenrePanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<StudioGenreTab>(
    selectedGroup ? selectedGroup.type : "developers"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (selectedGroup) {
      setActiveTab(selectedGroup.type);
    }
  }, [selectedGroup]);

  const handleTabChange = (tab: StudioGenreTab): void => {
    setActiveTab(tab);
    setVisibleCount(PAGE_SIZE);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
    setVisibleCount(PAGE_SIZE);
  };

  const rawTabItems: readonly NormalizedStatItem[] = useMemo(() => {
    if (activeTab === "developers") {
      const devMap = ratingStatsMap?.developers;
      return developers.map((d) =>
        toNormalizedItem(d.name, d.totalHours, d.gamesCount, d.avgHours, devMap?.[d.name.toLowerCase()])
      );
    }
    if (activeTab === "publishers") {
      const pubMap = ratingStatsMap?.publishers;
      return publishers.map((p) =>
        toNormalizedItem(p.name, p.totalHours, p.gamesCount, p.avgHours, pubMap?.[p.name.toLowerCase()])
      );
    }

    const isFeature = activeTab === "features";
    const tagMap = ratingStatsMap?.tags;
    return tags
      .filter((t) => (t.category === "feature") === isFeature)
      .map((t) =>
        toNormalizedItem(t.tag, t.totalHours, t.gamesCount, t.avgHours, tagMap?.[t.tag.toLowerCase()])
      );
  }, [activeTab, developers, publishers, tags, ratingStatsMap]);

  const filteredAndSortedItems: readonly NormalizedStatItem[] = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    const filtered = trimmed
      ? rawTabItems.filter((item) => item.name.toLowerCase().includes(trimmed))
      : rawTabItems;

    return [...filtered].sort((a, b) => {
      if (sortBy === "hours") {
        return b.totalHours - a.totalHours || b.gamesCount - a.gamesCount || a.name.localeCompare(b.name);
      }
      if (sortBy === "games") {
        return b.gamesCount - a.gamesCount || b.totalHours - a.totalHours || a.name.localeCompare(b.name);
      }
      if (sortBy === "avg") {
        return b.avgHours - a.avgHours || b.totalHours - a.totalHours || a.name.localeCompare(b.name);
      }
      const aScore = a.ratedCount > 0 ? a.avgScore : -1;
      const bScore = b.ratedCount > 0 ? b.avgScore : -1;
      return bScore - aScore || b.totalHours - a.totalHours || a.name.localeCompare(b.name);
    });
  }, [rawTabItems, searchQuery, sortBy]);

  const maxMetricValue = useMemo(() => {
    if (filteredAndSortedItems.length === 0) return 1;
    if (sortBy === "hours") {
      return Math.max(...filteredAndSortedItems.map((i) => i.totalHours), 1);
    }
    if (sortBy === "games") {
      return Math.max(...filteredAndSortedItems.map((i) => i.gamesCount), 1);
    }
    if (sortBy === "avg") {
      return Math.max(...filteredAndSortedItems.map((i) => i.avgHours), 1);
    }
    return 10;
  }, [filteredAndSortedItems, sortBy]);

  const visibleItems = filteredAndSortedItems.slice(0, visibleCount);
  const hasMore = filteredAndSortedItems.length > visibleCount;

  const handleRowClick = (name: string): void => {
    const isCurrentlySelected =
      selectedGroup !== null &&
      selectedGroup.type === activeTab &&
      selectedGroup.name.toLowerCase() === name.toLowerCase();

    if (isCurrentlySelected) {
      onSelectGroup(null);
    } else {
      onSelectGroup({ type: activeTab, name });
    }
  };

  return (
    <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-3.5 h-full">
      <nav aria-label="Category tabs" className="bg-[#141418] p-1 rounded-lg grid grid-cols-4 gap-1">
        {TAB_OPTIONS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              data-testid={tab.testId}
              onClick={() => handleTabChange(tab.key)}
              className={`py-1.5 px-2 rounded-md text-xs transition-colors font-medium text-center ${
                isActive
                  ? "bg-accent text-white font-semibold shadow-xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            data-testid="studio-genre-search"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Filter list..."
            className="w-full bg-surface border border-border-subtle rounded-lg px-2.5 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-medium focus:ring-1 focus:ring-accent/50"
          />
        </div>

        <div className="bg-[#141418] p-0.5 rounded-md flex items-center gap-0.5 shrink-0">
          {SORT_OPTIONS.map((sort) => {
            const isSortActive = sortBy === sort.key;
            return (
              <button
                key={sort.key}
                type="button"
                data-testid={sort.testId}
                onClick={() => onSortChange(sort.key)}
                className={`py-0.5 px-2 rounded text-[11px] transition-colors tabular-nums ${
                  isSortActive
                    ? "bg-card text-text-primary font-medium shadow-xs"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {sort.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {filteredAndSortedItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-text-muted">
            No matching items found
          </div>
        ) : (
          visibleItems.map((item, index) => {
            const isSelected =
              selectedGroup !== null &&
              selectedGroup.type === activeTab &&
              selectedGroup.name.toLowerCase() === item.name.toLowerCase();

            const currentMetric =
              sortBy === "hours"
                ? item.totalHours
                : sortBy === "games"
                ? item.gamesCount
                : sortBy === "avg"
                ? item.avgHours
                : item.avgScore;

            const progressPct =
              maxMetricValue > 0 && currentMetric > 0
                ? Math.min(100, Math.max(3, (currentMetric / maxMetricValue) * 100))
                : 0;

            const { primary, secondary } = getMetricLabels(item, sortBy);

            return (
              <div
                key={item.name}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => handleRowClick(item.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleRowClick(item.name);
                  }
                }}
                className={`group flex flex-col gap-1 w-full py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  isSelected
                    ? "bg-card border border-border-medium"
                    : "hover:bg-card/50 border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-text-muted tabular-nums w-5 text-xs shrink-0">
                      #{index + 1}
                    </span>
                    <span
                      className={`text-xs font-semibold truncate ${
                        isSelected ? "text-text-primary" : "text-text-primary group-hover:text-accent"
                      }`}
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    {item.ratedCount > 0 && (
                      <span
                        data-testid={`group-rating-badge-${item.name}`}
                        className="px-1.5 py-0.5 shrink-0 rounded bg-amber-500/15 text-amber-400 text-[10px] font-semibold tabular-nums border border-amber-500/30"
                      >
                        ★ {item.avgScore.toFixed(1)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs tabular-nums shrink-0">
                    <span className="font-semibold text-text-primary">{primary}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-secondary">{secondary}</span>
                  </div>
                </div>

                <div className="h-[3px] w-full bg-elevated rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      isSelected ? "bg-accent" : ""
                    }`}
                    style={{
                      width: `${progressPct}%`,
                      backgroundColor: isSelected ? undefined : getGameColor(item.name),
                    }}
                  />
                </div>
              </div>
            );
          })
        )}

        {hasMore && (
          <button
            type="button"
            data-testid="load-more-btn"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="w-full py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-card/60 hover:bg-card border border-border-subtle rounded-lg transition-colors mt-2"
          >
            Load more ({filteredAndSortedItems.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
