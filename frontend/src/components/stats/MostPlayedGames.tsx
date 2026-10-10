import { useState, useEffect, useMemo } from "react";
import { GetChannelAnalytics } from "../../../wailsjs/go/backend/App";
import {
  HistoricalVideo,
  filterHistoricalVideos,
  extractGameName,
  normalizeGameKey,
  parseDurationToHours,
  buildDailyGameBreakdown,
  buildMonthlyGameBreakdown,
  AdvancedFiltersInput,
} from "../../utils/gameStats";
import { buildMonthStints, GameStint } from "../../utils/gameTimeline";
import { PlaytimeToolbar } from "./PlaytimeToolbar";
import { PlaytimeStackedChart } from "./PlaytimeStackedChart";
import { TopGamesList } from "./TopGamesList";
import { TopGameHighlight } from "./TopGameHighlight";
import { GamingTimelineStrip } from "./GamingTimelineStrip";

type ViewMode = "month" | "year";

interface GameStat {
  game: string;
  hours: number;
}

export interface MostPlayedGamesProps {
  readonly filters?: AdvancedFiltersInput;
  readonly globalYear?: string;
}

export default function MostPlayedGames({
  filters,
  globalYear,
}: MostPlayedGamesProps) {
  const [videos, setVideos] = useState<HistoricalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("");
  const [selectedGameName, setSelectedGameName] = useState<string | null>(null);
  const [selectedStintId, setSelectedStintId] = useState<string | null>(null);

  // 1. Fetch historical videos from backend
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    GetChannelAnalytics()
      .then((res: unknown) => {
        const typedRes = res as { allHistoricalVideos?: HistoricalVideo[] };
        if (mounted && typedRes && typedRes.allHistoricalVideos) {
          setVideos(typedRes.allHistoricalVideos);
        }
      })
      .catch((err: Error) => {
        if (mounted) setError(err?.message || "Failed to load historical data");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 2. Filter historical videos based on AdvancedFilters
  const filteredVideos = useMemo(() => {
    return filterHistoricalVideos(videos, filters);
  }, [videos, filters]);

  // 3. Compute available years, totals, and monthly activity
  const stats = useMemo(() => {
    if (!filteredVideos || filteredVideos.length === 0) return null;

    const yearlyStats: Record<string, Record<string, number>> = {};
    const monthlyStats: Record<string, Record<string, number>> = {};
    const displayNames: Record<string, string> = {};
    const monthsWithDataSet = new Set<string>();

    filteredVideos.forEach((v) => {
      const pubDate = v.published && v.published.length >= 10
        ? v.published.substring(0, 10)
        : "";
      if (!pubDate) return;

      const g = extractGameName(v.title, v.gameTag);
      if (!g) return;

      const norm = normalizeGameKey(g);
      if (!norm) return;

      if (!displayNames[norm]) displayNames[norm] = g;
      const year = pubDate.substring(0, 4);
      const monthKey = pubDate.substring(0, 7);

      const hours = parseDurationToHours(v.duration);
      if (hours <= 0) return;

      monthsWithDataSet.add(monthKey);

      if (!yearlyStats[year]) yearlyStats[year] = {};
      yearlyStats[year][norm] = (yearlyStats[year][norm] || 0) + hours;

      if (!monthlyStats[monthKey]) monthlyStats[monthKey] = {};
      monthlyStats[monthKey][norm] =
        (monthlyStats[monthKey][norm] || 0) + hours;
    });

    const sortGames = (map: Record<string, number>): GameStat[] => {
      return Object.entries(map)
        .sort(([, a], [, b]) => b - a)
        .map(([g, h]) => ({ game: displayNames[g] || g, hours: h }));
    };

    const years = Object.keys(yearlyStats).sort((a, b) => b.localeCompare(a));
    const yearlyGames: Record<string, GameStat[]> = {};
    years.forEach((y) => {
      yearlyGames[y] = sortGames(yearlyStats[y]);
    });

    const monthlyGames: Record<string, GameStat[]> = {};
    Object.keys(monthlyStats).forEach((mKey) => {
      monthlyGames[mKey] = sortGames(monthlyStats[mKey]);
    });

    return {
      years,
      yearlyGames,
      monthlyGames,
      monthsWithDataSet,
    };
  }, [filteredVideos]);

  // 4. Default selections on initial load
  useEffect(() => {
    if (stats && stats.years.length > 0 && !selectedYear) {
      const latestYear = stats.years[0];
      setSelectedYear(latestYear);

      if (!selectedMonthKey) {
        // Find most recent month with data in this year
        const availableInYear = Array.from(stats.monthsWithDataSet)
          .filter((k) => k.startsWith(latestYear))
          .sort();
        const latestMonth =
          availableInYear[availableInYear.length - 1] || `${latestYear}-01`;
        setSelectedMonthKey(latestMonth);
      }
    }
  }, [stats, selectedYear, selectedMonthKey]);

  // 5. Synchronize with globalYear if passed from StatsPage
  useEffect(() => {
    if (
      globalYear &&
      globalYear !== "All" &&
      stats?.years.includes(globalYear)
    ) {
      setSelectedYear(globalYear);
      setViewMode("month");
      const availableInYear = Array.from(stats.monthsWithDataSet)
        .filter((k) => k.startsWith(globalYear))
        .sort();
      const latestMonth =
        availableInYear[availableInYear.length - 1] || `${globalYear}-01`;
      setSelectedMonthKey(latestMonth);
    }
  }, [globalYear, stats]);

  // 6. Handle Year change from toolbar
  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    if (stats) {
      const availableInYear = Array.from(stats.monthsWithDataSet)
        .filter((k) => k.startsWith(year))
        .sort();
      const latestMonth =
        availableInYear[availableInYear.length - 1] || `${year}-01`;
      setSelectedMonthKey(latestMonth);
    }
  };

  // 7. Compute chart breakdowns for currently selected year/month
  const dailyBreakdown = useMemo(() => {
    if (!selectedMonthKey) return [];
    return buildDailyGameBreakdown(filteredVideos, selectedYear, selectedMonthKey);
  }, [filteredVideos, selectedYear, selectedMonthKey]);

  const monthlyBreakdown = useMemo(() => {
    if (!selectedYear) return [];
    return buildMonthlyGameBreakdown(filteredVideos, selectedYear);
  }, [filteredVideos, selectedYear]);

  // 8. Stints for the monthly timeline
  const monthlyStints = useMemo(() => {
    if (viewMode !== "month" || !selectedMonthKey) return [];
    return buildMonthStints(filteredVideos, selectedMonthKey);
  }, [filteredVideos, selectedMonthKey, viewMode]);

  // 9. Games to display in the leaderboard/list
  const gamesToDisplay: GameStat[] = useMemo(() => {
    if (!stats) return [];
    if (viewMode === "year") {
      return stats.yearlyGames[selectedYear] || [];
    }
    return stats.monthlyGames[selectedMonthKey] || [];
  }, [stats, viewMode, selectedYear, selectedMonthKey]);

  const topGameNames = useMemo(() => {
    return gamesToDisplay.map((g) => g.game);
  }, [gamesToDisplay]);

  const maxGameHours =
    gamesToDisplay.length > 0 ? gamesToDisplay[0].hours : 1;

  const selectedIndex = gamesToDisplay.findIndex(
    (g) => g.game === selectedGameName,
  );
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const activeGame = gamesToDisplay[activeIndex];

  // List title
  const listTitle = useMemo(() => {
    if (viewMode === "year") {
      return `Top games of ${selectedYear}`;
    }
    const parts = selectedMonthKey.split("-");
    const y = parts[0] || selectedYear;
    const m = parseInt(parts[1] || "1", 10) - 1;
    const date = new Date(parseInt(y, 10), m, 1);
    const monthName = date.toLocaleString("en-US", { month: "long" });
    return `Top games in ${monthName} ${y}`;
  }, [viewMode, selectedYear, selectedMonthKey]);

  if (loading) {
    return (
      <div className="px-5 pb-5">
        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-6 flex flex-col gap-6 animate-pulse">
          <div className="h-6 w-48 bg-surface rounded" />
          <div className="h-32 bg-surface/50 rounded-xl" />
          <div className="h-64 bg-surface/30 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 pb-5">
        <div className="bg-elevated/30 border border-red-500/20 rounded-xl p-6 flex flex-col gap-3 text-red-400">
          <h3 className="text-sm font-bold">Error loading playtime data</h3>
          <p className="text-xs text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats || stats.years.length === 0) {
    return (
      <div className="px-5 pb-5">
        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-6 flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
          <p className="text-sm">No recorded gameplay activity found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 flex flex-col gap-4">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-6 flex flex-col gap-6 relative overflow-hidden backdrop-blur-xl">
        {/* Header & Playtime Toolbar */}
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-base font-bold text-text-primary tracking-tight shrink-0">
            Playtime by game
          </h2>

          <PlaytimeToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            years={stats.years}
            selectedYear={selectedYear}
            onYearSelect={handleYearChange}
            selectedMonthKey={selectedMonthKey}
            onMonthSelect={setSelectedMonthKey}
            monthsWithData={stats.monthsWithDataSet}
          />
        </div>

        {/* Stacked Chart (Daily in month view, Monthly in year view) */}
        <PlaytimeStackedChart
          viewMode={viewMode}
          dailyData={dailyBreakdown}
          monthlyData={monthlyBreakdown}
          topGames={topGameNames}
          selectedKey={viewMode === "month" ? selectedMonthKey : selectedYear}
          onSelectKey={(key) => {
            if (viewMode === "year") {
              // Click on a month bar in year view switches to that month
              setSelectedMonthKey(key);
              setViewMode("month");
            }
          }}
        />

        <div className="h-px w-full bg-border-subtle my-1" />

        {/* Grouped Top Games and Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Top Games Section: Highlight + List */}
          <div className="lg:col-span-5 2xl:col-span-4 flex flex-col sm:flex-row gap-4 items-start w-full">
            <div className="w-full sm:w-[170px] xl:w-[180px] shrink-0 flex flex-col gap-2.5">
              <h3 className="text-xs font-bold text-text-secondary truncate">
                {activeIndex === 0
                  ? `#1 Game of the ${viewMode === "year" ? "year" : "month"}`
                  : `Selected (#${activeIndex + 1})`}
              </h3>
              {gamesToDisplay.length > 0 && activeGame ? (
                <TopGameHighlight
                  key={activeGame.game}
                  game={activeGame}
                  rank={activeIndex + 1}
                />
              ) : (
                <div className="bg-surface/30 rounded-xl aspect-[2/3] border border-border-subtle flex items-center justify-center text-text-muted text-xs">
                  No game to highlight
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 w-full flex flex-col gap-2.5">
              <TopGamesList
                games={gamesToDisplay}
                selectedGameName={selectedGameName}
                onSelectGame={setSelectedGameName}
                maxHours={maxGameHours}
                listTitle={listTitle}
              />
            </div>
          </div>

          {/* Timeline Section */}
          <div className="lg:col-span-7 2xl:col-span-8 min-w-0 flex flex-col gap-2.5 w-full">
            {viewMode === "month" ? (
              <GamingTimelineStrip
                stints={monthlyStints}
                selectedStintId={selectedStintId}
                onSelectStint={(stint: GameStint, activeGameName?: string) => {
                  setSelectedStintId(stint.id);
                  const targetGame = activeGameName || stint.games[0]?.game;
                  if (targetGame) {
                    setSelectedGameName(targetGame);
                  }
                }}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-text-secondary">
                  Monthly timeline
                </h3>
                <div className="py-12 flex flex-col items-center justify-center gap-1 text-text-muted border border-dashed border-border-subtle rounded-lg text-center p-4">
                  <p className="text-xs">
                    Switch to month view to inspect chronological stints
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
