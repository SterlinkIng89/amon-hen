import { useState, useEffect, useMemo } from "react";
import { GetChannelAnalytics } from "../../../wailsjs/go/backend/App";
import { extractTitleDate } from "../../utils/videoUtils";

interface HistoricalVideo {
  title: string;
  published: string;
  duration: string;
}

function parseISODurationToHours(iso: string): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h + (m / 60) + (s / 3600);
}

function extractGameName(title: string): string {
  if (!title) return "";
  const parts = title.split(/[-—]/);
  if (parts.length > 0) {
    return parts[0].trim();
  }
  return title.trim();
}

type ViewMode = "year" | "month";

interface GameStat {
  game: string;
  hours: number;
}

interface MostPlayedGamesProps {
  filters?: any;
  globalYear?: string;
}

export default function MostPlayedGames({ filters, globalYear }: MostPlayedGamesProps) {
  const [videos, setVideos] = useState<HistoricalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    GetChannelAnalytics()
      .then((res: any) => {
        if (mounted && res && res.allHistoricalVideos) {
          setVideos(res.allHistoricalVideos);
        }
      })
      .catch((err: any) => {
        if (mounted) setError(err?.message || "Failed to load historical data");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!videos || videos.length === 0) return null;

    const yearlyStats: Record<string, Record<string, number>> = {};
    const monthlyStats: Record<string, Record<string, number>> = {};
    const displayNames: Record<string, string> = {};

    const dateFrom = filters?.value?.dateFrom || "";
    const dateTo = filters?.value?.dateTo || "";
    const excludeWords = filters?.value?.excludeWords || [];

    const matchesDate = (dateStr: string) => {
      if (dateFrom && dateStr < dateFrom) return false;
      if (dateTo && dateStr > dateTo) return false;
      return true;
    };

    const notExcluded = (text: string) => {
      if (excludeWords.length === 0) return true;
      const lower = text.toLowerCase();
      return !excludeWords.some((w: string) => lower.includes(w.toLowerCase()));
    };

    videos.forEach(v => {
      if (!v.published || v.published.length < 10) return;
      
      const titleDate = extractTitleDate(v.title);
      const pubDate = titleDate || v.published.substring(0, 10);
      
      if (!matchesDate(pubDate)) return;
      if (!notExcluded(v.title)) return;

      const g = extractGameName(v.title);
      if (!g) return;

      const norm = g.toLowerCase().replace(/[\s\-_]+/g, '');
      if (!norm) return;

      if (!displayNames[norm]) displayNames[norm] = g;
      const year = pubDate.substring(0, 4);
      const month = pubDate.substring(5, 7);
      const monthKey = `${year}-${month}`;

      const hours = parseISODurationToHours(v.duration);

      if (!yearlyStats[year]) yearlyStats[year] = {};
      yearlyStats[year][norm] = (yearlyStats[year][norm] || 0) + hours;

      if (!monthlyStats[monthKey]) monthlyStats[monthKey] = {};
      monthlyStats[monthKey][norm] = (monthlyStats[monthKey][norm] || 0) + hours;
    });

    const sortGames = (map: Record<string, number>): GameStat[] => {
      return Object.entries(map)
        .filter(([, h]) => h > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([g, h]) => ({ game: displayNames[g], hours: h }));
    };

    const years = Object.keys(yearlyStats).sort((a, b) => b.localeCompare(a));
    const yearlyTotals: Record<string, number> = {};
    const yearlyGames: Record<string, GameStat[]> = {};

    years.forEach(y => {
      const games = sortGames(yearlyStats[y]);
      yearlyGames[y] = games;
      yearlyTotals[y] = games.reduce((acc, curr) => acc + curr.hours, 0);
    });

    // Generate all 12 months for a year so chart looks consistent
    const monthlyDataByYear: Record<string, { label: string; key: string; total: number }[]> = {};
    const monthlyGames: Record<string, GameStat[]> = {};

    years.forEach(y => {
      monthlyDataByYear[y] = [];
      for (let i = 1; i <= 12; i++) {
        const mStr = i.toString().padStart(2, "0");
        const mKey = `${y}-${mStr}`;
        const games = monthlyStats[mKey] ? sortGames(monthlyStats[mKey]) : [];
        monthlyGames[mKey] = games;
        const total = games.reduce((acc, curr) => acc + curr.hours, 0);
        
        const date = new Date(parseInt(y), i - 1, 1);
        const label = date.toLocaleString("en-US", { month: "short" });
        
        monthlyDataByYear[y].push({ label, key: mKey, total });
      }
    });

    return {
      years,
      yearlyTotals,
      yearlyGames,
      monthlyDataByYear,
      monthlyGames
    };
  }, [videos, filters?.value]);

  // Set initial selections
  useEffect(() => {
    if (stats && stats.years.length > 0 && !selectedYear) {
      const latestYear = stats.years[0];
      setSelectedYear(latestYear);
      
      // Find the most recent active month for that year
      if (!selectedMonthKey) {
        const activeMonths = [...stats.monthlyDataByYear[latestYear]].reverse();
        const latestActiveMonth = activeMonths.find(m => m.total > 0);
        setSelectedMonthKey(latestActiveMonth ? latestActiveMonth.key : `${latestYear}-01`);
      }
    }
  }, [stats, selectedYear, selectedMonthKey]);

  // Sync with global year from Recording Activity
  useEffect(() => {
    if (globalYear && globalYear !== "All" && stats?.years.includes(globalYear)) {
      setSelectedYear(globalYear);
      // Auto switch to month view to show details for this year
      setViewMode("month");
      // Pick the latest active month for the newly synced year
      const activeMonths = [...(stats.monthlyDataByYear[globalYear] || [])].reverse();
      const latestActiveMonth = activeMonths.find(m => m.total > 0);
      setSelectedMonthKey(latestActiveMonth ? latestActiveMonth.key : `${globalYear}-01`);
    }
  }, [globalYear, stats]);

  if (loading) {
    return (
      <div className="px-5 pb-5">
        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 animate-pulse h-64" />
      </div>
    );
  }

  if (error || !stats || !selectedYear) return null;

  // Chart Data preparation
  let chartData: { label: string; key: string; value: number }[] = [];
  let maxChartValue = 0;

  if (viewMode === "year") {
    chartData = stats.years.slice().reverse().map(y => ({ label: y, key: y, value: stats.yearlyTotals[y] }));
  } else {
    chartData = (stats.monthlyDataByYear[selectedYear] || []).map(m => ({ label: m.label, key: m.key, value: m.total }));
  }
  
  maxChartValue = Math.max(...chartData.map(d => d.value), 1);

  // List Data preparation
  let listTitle = "";
  let gamesToDisplay: GameStat[] = [];

  if (viewMode === "year") {
    listTitle = `Top Games of ${selectedYear}`;
    gamesToDisplay = stats.yearlyGames[selectedYear] || [];
  } else {
    const [y, m] = selectedMonthKey.split("-");
    const date = new Date(parseInt(y), parseInt(m) - 1, 1);
    listTitle = `Top Games in ${date.toLocaleString("en-US", { month: "long" })} ${y}`;
    gamesToDisplay = stats.monthlyGames[selectedMonthKey] || [];
  }

  const maxGameHours = gamesToDisplay.length > 0 ? gamesToDisplay[0].hours : 1;

  return (
    <div className="px-5 pb-5 flex flex-col gap-4 animate-fadeIn">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-6 flex flex-col gap-6 relative overflow-hidden backdrop-blur-xl">
        
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-bold text-text-primary tracking-tight">Playtime by Game</h2>
            <span className="text-xs text-text-muted">Total hours based on video duration</span>
          </div>

          <div className="flex items-center gap-2 bg-surface/50 p-1 rounded-lg border border-border-subtle">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === "month" ? "bg-accent text-white shadow-md" : "text-text-secondary hover:text-text-primary"}`}
            >
              By Month
            </button>
            <button
              onClick={() => setViewMode("year")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === "year" ? "bg-accent text-white shadow-md" : "text-text-secondary hover:text-text-primary"}`}
            >
              By Year
            </button>
          </div>
        </div>

        {/* Year Selector (Only visible in Month view) */}
        {viewMode === "month" && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {stats.years.map(y => (
              <button
                key={y}
                onClick={() => {
                  setSelectedYear(y);
                  setSelectedMonthKey(`${y}-01`);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap ${selectedYear === y ? "bg-surface border-accent text-accent" : "bg-transparent border-border-subtle text-text-muted hover:text-text-secondary hover:border-text-muted"}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {/* Interactive Bar Chart */}
        <div className="h-32 flex items-end gap-1 sm:gap-2 mt-2">
          {chartData.map((d) => {
            const isSelected = viewMode === "year" ? d.key === selectedYear : d.key === selectedMonthKey;
            const heightPercent = d.value > 0 ? Math.max((d.value / maxChartValue) * 100, 4) : 0;
            
            return (
              <div 
                key={d.key} 
                className="flex-1 flex flex-col justify-end items-center gap-2 group cursor-pointer h-full"
                onClick={() => {
                  if (viewMode === "year") setSelectedYear(d.key);
                  else setSelectedMonthKey(d.key);
                }}
              >
                <div className="w-full flex justify-center h-full items-end relative">
                  {/* Tooltip */}
                  <div className="absolute -top-8 bg-surface border border-border-subtle text-text-primary text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                    {d.value.toFixed(1)} hrs
                  </div>
                  {/* Bar */}
                  <div 
                    className={`w-full max-w-[40px] rounded-t-sm transition-all duration-500 ease-out ${isSelected ? "bg-accent shadow-[0_0_15px_rgba(var(--accent-color),0.4)]" : "bg-border-subtle group-hover:bg-text-muted"}`}
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider ${isSelected ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary"}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="h-px w-full bg-border-subtle my-2" />

        {/* Leaderboard List */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold text-text-secondary">{listTitle}</h3>
          
          <div className="flex flex-col gap-3">
            {gamesToDisplay.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-text-muted">
                <p className="text-sm">No playtime recorded.</p>
              </div>
            ) : (
              gamesToDisplay.map((g, idx) => {
                const progressWidth = `${(g.hours / maxGameHours) * 100}%`;
                const isTop = idx === 0;
                
                return (
                  <div 
                    key={g.game} 
                    className="group relative flex items-center justify-between p-3 rounded-lg overflow-hidden transition-all hover:bg-surface/50 border border-transparent hover:border-border-subtle z-0"
                  >
                    {/* Progress Background */}
                    <div 
                      className={`absolute left-0 top-0 bottom-0 -z-10 opacity-10 transition-all duration-700 ease-out ${isTop ? "bg-accent" : "bg-text-muted"}`}
                      style={{ width: progressWidth }}
                    />
                    
                    <div className="flex items-center gap-3">
                      <span className={`w-5 text-center text-xs font-black ${isTop ? "text-accent" : "text-text-muted group-hover:text-text-secondary"}`}>
                        {idx + 1}
                      </span>
                      <span className={`text-sm font-semibold ${isTop ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"} transition-colors truncate max-w-[200px] sm:max-w-xs md:max-w-md`}>
                        {g.game}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs font-bold tabular-nums ${isTop ? "text-text-primary" : "text-text-secondary"}`}>
                        {g.hours < 0.1 ? "<0.1" : g.hours.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">hrs</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

