import { useState, useEffect, useMemo } from "react";
import { GetChannelAnalytics, GetSteamAppID } from "../../../wailsjs/go/backend/App";
import { extractTitleDate } from "../../utils/videoUtils";

interface HistoricalVideo {
 title: string;
 published: string;
 duration: string;
 gameTag?: string;
}

function parseDurationToHours(isoOrSecs: string): number {
 if (!isoOrSecs) return 0;
 const str = isoOrSecs.trim();
 if (!str) return 0;

 // 1. ISO 8601 (PT1H2M3S)
 const match = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
 if (match && (match[1] || match[2] || match[3])) {
 const h = parseInt(match[1] || "0", 10);
 const m = parseInt(match[2] || "0", 10);
 const s = parseInt(match[3] || "0", 10);
 return h + (m / 60) + (s / 3600);
 }

 // 2. Standard timestamp HH:MM:SS or MM:SS
 if (str.includes(":")) {
 const parts = str.split(":").map(p => parseFloat(p));
 if (parts.length === 3 && parts.every(n => !isNaN(n))) {
 return parts[0] + (parts[1] / 60) + (parts[2] / 3600);
 }
 if (parts.length === 2 && parts.every(n => !isNaN(n))) {
 return (parts[0] / 60) + (parts[1] / 3600);
 }
 }

 // 3. Raw seconds (e.g. "3600" or "1820.5")
 const secs = parseFloat(str);
 if (!isNaN(secs) && secs > 0) {
 return secs / 3600;
 }

 return 0;
}

function extractGameName(title: string, gameTag?: string): string {
 if (gameTag && gameTag.trim()) {
 return gameTag.trim();
 }
 if (!title) return "";
 const parts = title.split(/[-—]/);
 if (parts.length > 0 && parts[0].trim()) {
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
 const titleDate = extractTitleDate(v.title);
 const pubDate = titleDate || (v.published && v.published.length >= 10 ? v.published.substring(0, 10) : "");

 if (!pubDate || pubDate.length < 10) return;
 if (!matchesDate(pubDate)) return;
 if (!notExcluded(v.title)) return;

 const g = extractGameName(v.title, v.gameTag);
 if (!g) return;

 const norm = g.toLowerCase().replace(/[\s\-_]+/g, '');
 if (!norm) return;

 if (!displayNames[norm]) displayNames[norm] = g;
 const year = pubDate.substring(0, 4);
 const month = pubDate.substring(5, 7);
 const monthKey = `${year}-${month}`;

 const hours = parseDurationToHours(v.duration);

 if (!yearlyStats[year]) yearlyStats[year] = {};
 yearlyStats[year][norm] = (yearlyStats[year][norm] || 0) + hours;

 if (!monthlyStats[monthKey]) monthlyStats[monthKey] = {};
 monthlyStats[monthKey][norm] = (monthlyStats[monthKey][norm] || 0) + hours;
 });

 const sortGames = (map: Record<string, number>): GameStat[] => {
 return Object.entries(map)
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
 className={`w-full max-w-[40px] rounded-t-sm transition-all duration-500 ease-out ${isSelected ? "bg-accent " : "bg-border-subtle group-hover:bg-text-muted"}`}
 style={{ height: `${heightPercent}%` }}
 />
 </div>
 <span className={`text-[10px] font-bold tracking-wider ${isSelected ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary"}`}>
 {d.label}
 </span>
 </div>
 );
 })}
 </div>

 <div className="h-px w-full bg-border-subtle my-2" />

 {/* Leaderboard & Highlight 2-Column Container */}
 <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">
 
 {/* Left Column: Top Game Highlight (fixed compact card) */}
 <div className="w-full lg:w-[260px] shrink-0 flex flex-col gap-3">
 <h3 className="text-xs font-bold text-text-secondary">
 #1 Game of the {viewMode === "year" ? "Year" : "Month"}
 </h3>
 {gamesToDisplay.length > 0 ? (
 <TopGameHighlight game={gamesToDisplay[0]} />
 ) : (
 <div className="bg-surface/30 rounded-xl aspect-[2/3] border border-border-subtle flex items-center justify-center text-text-muted text-xs">
 No game to highlight
 </div>
 )}
 </div>

 {/* Right Column: Leaderboard List (constrained width to prevent excessive stretching) */}
 <div className="flex-1 w-full max-w-3xl flex flex-col gap-3">
 <h3 className="text-xs font-bold text-text-secondary">{listTitle}</h3>
 
 <div className="flex flex-col gap-2.5">
 {gamesToDisplay.length === 0 ? (
 <div className="py-8 flex flex-col items-center justify-center gap-2 text-text-muted">
 <p className="text-sm">No playtime recorded.</p>
 </div>
 ) : (
 gamesToDisplay.map((g, idx) => (
 <GameRow key={g.game} game={g.game} hours={g.hours} index={idx} maxGameHours={maxGameHours} />
 ))
 )}
 </div>
 </div>

 </div>
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
 className={`w-full max-w-[40px] rounded-t-sm transition-all duration-500 ease-out ${isSelected ? "bg-accent " : "bg-border-subtle group-hover:bg-text-muted"}`}
 style={{ height: `${heightPercent}%` }}
 />
 </div>
 <span className={`text-[10px] font-bold tracking-wider ${isSelected ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary"}`}>
 {d.label}
 </span>
 </div>
 );
 })}
 </div>

 <div className="h-px w-full bg-border-subtle my-2" />

 {/* Leaderboard & Highlight 2-Column Container */}
 <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">
 
 {/* Left Column: Top Game Highlight (fixed compact card) */}
 <div className="w-full lg:w-[260px] shrink-0 flex flex-col gap-3">
 <h3 className="text-xs font-bold text-text-secondary">
 #1 Game of the {viewMode === "year" ? "Year" : "Month"}
 </h3>
 {gamesToDisplay.length > 0 ? (
 <TopGameHighlight game={gamesToDisplay[0]} />
 ) : (
 <div className="bg-surface/30 rounded-xl aspect-[2/3] border border-border-subtle flex items-center justify-center text-text-muted text-xs">
 No game to highlight
 </div>
 )}
 </div>

 {/* Right Column: Leaderboard List (constrained width to prevent excessive stretching) */}
 <div className="flex-1 w-full max-w-3xl flex flex-col gap-3">
 <h3 className="text-xs font-bold text-text-secondary">{listTitle}</h3>
 
 <div className="flex flex-col gap-2.5">
 {gamesToDisplay.length === 0 ? (
 <div className="py-8 flex flex-col items-center justify-center gap-2 text-text-muted">
 <p className="text-sm">No playtime recorded.</p>
 </div>
 ) : (
 gamesToDisplay.map((g, idx) => (
 <GameRow key={g.game} game={g.game} hours={g.hours} index={idx} maxGameHours={maxGameHours} />
 ))
 )}
 </div>
 </div>

 </div>

 </div>
 </div>
 );
}

// Custom hook to fetch steam app ID, assets, and achievement data
function useSteamGameData(gameName: string) {
  const [appId, setAppId] = useState<string>("");
  const [heroUrl, setHeroUrl] = useState<string>("");
  const [posterUrl, setPosterUrl] = useState<string>("");
  const [achievementsPct, setAchievementsPct] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    GetSteamAppID(gameName).then(async (id: any) => {
      if (!mounted || !id || id === "NOT_FOUND") return;
      setAppId(id);

      // @ts-ignore
      const goApp = window.go?.backend?.App;
      if (goApp?.GetSteamGameAssets) {
        const assets = await goApp.GetSteamGameAssets(id);
        if (mounted) {
          if (assets?.heroUrl) setHeroUrl(assets.heroUrl);
          if (assets?.posterUrl) setPosterUrl(assets.posterUrl);
        }
      } else if (mounted) {
        setHeroUrl(`https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_hero.jpg`);
        setPosterUrl(`https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`);
      }

      if (goApp?.GetSteamGameAchievementPct) {
        const pct = await goApp.GetSteamGameAchievementPct(id);
        if (mounted && pct > 0) setAchievementsPct(pct);
      }
    }).catch(console.error);

    return () => { mounted = false; };
  }, [gameName]);

  return { appId, heroUrl, posterUrl, achievementsPct };
}

function GameRow({ game, hours, index, maxGameHours }: { game: string, hours: number, index: number, maxGameHours: number }) {
  const { appId, heroUrl } = useSteamGameData(game);

  const progressWidth = `${(hours / maxGameHours) * 100}%`;
  const isTop = index === 0;

  const bgImage = heroUrl ? `url('${heroUrl}')` : (appId ? `url('https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg')` : 'none');

  return (
    <div 
      className="group relative flex items-center justify-between p-3 rounded-xl overflow-hidden transition-all hover:scale-[1.01] border border-border-subtle hover:border-border-medium z-0 h-[64px] shadow-sm"
    >
      {/* Layer 1: Blurred Color Bleed (Dominant color effect) */}
      {(heroUrl || appId) ? (
        <div 
          className="absolute inset-0 -z-30 bg-cover bg-center opacity-40 group-hover:opacity-60 blur-xl transition-opacity duration-500 scale-110"
          style={{ backgroundImage: bgImage }}
        />
      ) : (
        <div className="absolute inset-0 -z-30 bg-surface" />
      )}

      {/* Layer 2: Darkening overlay for text readability on the left */}
      <div className="absolute inset-0 -z-20 bg-gradient-to-r from-surface via-surface/80 to-transparent" />

      {/* Layer 3: Sharp Image on the right half */}
      {(heroUrl || appId) && (
        <div 
          className="absolute inset-y-0 right-0 w-1/2 max-w-[450px] -z-10 bg-cover bg-left opacity-80 group-hover:opacity-100 transition-opacity duration-500"
          style={{ 
            backgroundImage: bgImage,
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 25%)",
            maskImage: "linear-gradient(to right, transparent 0%, black 25%)"
          }}
        />
      )}

      {/* Progress Background Fill */}
      <div 
        className={`absolute left-0 top-0 bottom-0 -z-10 transition-all duration-700 ease-out ${isTop ? "bg-accent/15" : "bg-accent/5 opacity-50 group-hover:opacity-100"}`}
        style={{ width: progressWidth }}
      />
      
      {/* Thicker Progress Bar at the bottom */}
      <div 
        className={`absolute bottom-0 left-0 h-[4px] -z-10 transition-all duration-700 ease-out ${isTop ? "bg-accent " : "bg-accent/60 group-hover:bg-accent "}`}
        style={{ width: progressWidth }}
      />
      
      <div className="flex items-center gap-3 z-10 w-2/3">
        <span className={`w-5 shrink-0 text-center text-base font-black ${isTop ? "text-accent " : "text-text-muted group-hover:text-text-primary transition-colors"}`}>
          {index + 1}
        </span>
        <span className={`text-sm font-bold ${isTop ? "text-white" : "text-text-primary"} transition-colors truncate `}>
          {game}
        </span>
      </div>
      
      <div className="flex items-center gap-1 shrink-0 z-10 bg-surface/80 backdrop-blur-md px-2 py-1 rounded-md border border-border-subtle shadow-sm group-hover:border-border-medium transition-colors">
        <span className={`text-xs font-black tabular-nums ${isTop ? "text-accent " : "text-text-primary"}`}>
          {hours < 0.1 ? "<0.1" : hours.toFixed(1)}
        </span>
        <span className="text-[9px] text-text-muted font-bold tracking-wider">hrs</span>
      </div>
    </div>
  );
}

function TopGameHighlight({ game }: { game: GameStat }) {
  const { appId, posterUrl, achievementsPct } = useSteamGameData(game.game);

  const activePoster = posterUrl || (appId ? `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg` : "");

  return (
    <div className="relative w-full max-w-[280px] aspect-[2/3] rounded-xl overflow-hidden border border-border-subtle shadow-lg group bg-surface">
      {/* Background Poster */}
      {(activePoster || appId) ? (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ backgroundImage: `url('${activePoster}')` }}
        />
      ) : (
        <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center p-4 text-center opacity-50">
          <span className="text-3xl font-black text-text-muted/30 mb-2">#1</span>
          <span className="text-sm font-bold text-text-primary">{game.game}</span>
        </div>
      )}

      {/* Gradient Overlay for bottom text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent opacity-95 group-hover:opacity-100 transition-opacity" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-1.5 z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 w-fit backdrop-blur-md mb-1 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse " />
          <span className="text-[9px] font-black tracking-wider text-accent ">Top Played</span>
        </span>
        <h4 className="text-lg font-black text-white leading-snug line-clamp-2">{game.game}</h4>
        
        <div className="flex items-end gap-1 mt-1">
          <span className="text-2xl sm:text-3xl font-black text-accent tabular-nums">
            {game.hours < 0.1 ? "<0.1" : game.hours.toFixed(1)}
          </span>
          <span className="text-[10px] font-bold text-text-muted tracking-widest mb-1">hrs</span>
        </div>

        {/* Achievements */}
        {achievementsPct > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000 ease-out" 
                style={{ width: `${achievementsPct}%` }} 
              />
            </div>
            <span className="text-[10px] font-black text-emerald-400 tabular-nums">
              {Math.round(achievementsPct)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
