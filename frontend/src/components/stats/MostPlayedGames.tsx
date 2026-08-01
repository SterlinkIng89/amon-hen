import { useState, useEffect, useMemo } from "react";
import { GetChannelAnalytics } from "../../../wailsjs/go/backend/App";

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

export default function MostPlayedGames() {
  const [videos, setVideos] = useState<HistoricalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

    videos.forEach(v => {
      const g = extractGameName(v.title);
      if (!g) return;

      // Normalize
      const norm = g.toLowerCase().replace(/[\s\-_]+/g, '');
      if (!norm) return;

      if (!displayNames[norm]) {
        displayNames[norm] = g;
      }

      // Date parsing from published_at "YYYY-MM-DD"
      if (!v.published || v.published.length < 10) return;
      const year = v.published.substring(0, 4);
      const month = v.published.substring(5, 7); // "MM"
      const monthKey = `${year}-${month}`;

      const hours = parseISODurationToHours(v.duration);

      // Yearly
      if (!yearlyStats[year]) yearlyStats[year] = {};
      yearlyStats[year][norm] = (yearlyStats[year][norm] || 0) + hours;

      // Monthly
      if (!monthlyStats[monthKey]) monthlyStats[monthKey] = {};
      monthlyStats[monthKey][norm] = (monthlyStats[monthKey][norm] || 0) + hours;
    });

    const getGamesList = (hoursMap: Record<string, number>) => {
      return Object.entries(hoursMap)
        .filter(([, hours]) => hours > 0) // Only include games with > 0 hours
        .sort(([, a], [, b]) => b - a)
        .map(([game, hours]) => ({
          game: displayNames[game],
          hours
        }));
    };

    const byYear = Object.entries(yearlyStats)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, map]) => ({ year, games: getGamesList(map) }))
      .filter(item => item.games.length > 0);

    const byMonth = Object.entries(monthlyStats)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, map]) => {
        const [y, m] = monthKey.split("-");
        const date = new Date(parseInt(y), parseInt(m) - 1, 1);
        const monthName = date.toLocaleString("en-US", { month: "long" });
        return { label: `${monthName} ${y}`, games: getGamesList(map) };
      })
      .filter(item => item.games.length > 0);

    return { byYear, byMonth };
  }, [videos]);

  if (loading) {
    return (
      <div className="px-5 pb-5">
        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 animate-pulse h-48" />
      </div>
    );
  }

  if (error || !stats) return null;

  return (
    <div className="px-5 pb-5 flex flex-col gap-4 animate-fadeIn">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-primary tracking-tight">Playtime by Game</h2>
          <span className="text-[10px] text-text-muted italic">Hours are calculated from exact video durations</span>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* Top per year */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">By Year</h3>
            <div className="flex flex-col gap-3">
              {stats.byYear.map(item => (
                <div key={item.year} className="bg-surface/50 border border-border-subtle rounded-lg p-4 flex flex-col gap-3">
                  <h4 className="text-xs font-black text-accent">{item.year}</h4>
                  <div className="flex flex-col gap-1.5">
                    {item.games.map((g, idx) => (
                      <div key={g.game} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-[10px] font-bold text-text-muted w-4">{idx + 1}.</span>
                          <span className={`text-xs truncate ${idx === 0 ? "font-bold text-text-primary" : "font-medium text-text-secondary"}`}>
                            {g.game}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums shrink-0 ${idx === 0 ? "text-accent/80" : "text-text-muted"}`}>
                          {g.hours < 0.1 ? "<0.1" : g.hours.toFixed(1)} hrs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {stats.byYear.length === 0 && <p className="text-xs text-text-muted italic">No data</p>}
            </div>
          </div>

          {/* Top per month */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">By Month</h3>
            <div className="flex flex-col gap-3">
              {stats.byMonth.map(item => (
                <div key={item.label} className="bg-surface/50 border border-border-subtle rounded-lg p-4 flex flex-col gap-3">
                  <h4 className="text-xs font-black text-text-secondary">{item.label}</h4>
                  <div className="flex flex-col gap-1.5">
                    {item.games.map((g, idx) => (
                      <div key={g.game} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-[10px] font-bold text-text-muted w-4">{idx + 1}.</span>
                          <span className={`text-xs truncate ${idx === 0 ? "font-bold text-text-primary" : "font-medium text-text-secondary"}`}>
                            {g.game}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums shrink-0 ${idx === 0 ? "text-accent/80" : "text-text-muted"}`}>
                          {g.hours < 0.1 ? "<0.1" : g.hours.toFixed(1)} hrs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {stats.byMonth.length === 0 && <p className="text-xs text-text-muted italic">No data</p>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
