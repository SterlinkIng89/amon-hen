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

interface GamingInsightsProps {
  filters?: any;
}

export default function GamingInsights({ filters }: GamingInsightsProps) {
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

  const insights = useMemo(() => {
    if (!videos || videos.length === 0) return null;

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

    const daysMap: Record<string, { count: number; hours: number }> = {};
    const dayOfWeekCount = [0, 0, 0, 0, 0, 0, 0]; // Sun(0) to Sat(6)
    const yearMap: Record<string, { count: number; hours: number }> = {};
    const monthMap: Record<string, { count: number; hours: number }> = {};
    
    let totalHours = 0;
    let totalVideos = 0;

    videos.forEach(v => {
      if (!v.published || v.published.length < 10) return;
      
      const titleDate = extractTitleDate(v.title);
      const pubDate = titleDate || v.published.substring(0, 10);
      
      if (!matchesDate(pubDate)) return;
      if (!notExcluded(v.title)) return;

      const hours = parseISODurationToHours(v.duration);
      totalHours += hours;
      totalVideos++;

      // Group by Day
      if (!daysMap[pubDate]) daysMap[pubDate] = { count: 0, hours: 0 };
      daysMap[pubDate].count++;
      daysMap[pubDate].hours += hours;

      // Group by Year
      const year = pubDate.substring(0, 4);
      if (!yearMap[year]) yearMap[year] = { count: 0, hours: 0 };
      yearMap[year].count++;
      yearMap[year].hours += hours;

      // Group by Month
      const month = pubDate.substring(0, 7);
      if (!monthMap[month]) monthMap[month] = { count: 0, hours: 0 };
      monthMap[month].count++;
      monthMap[month].hours += hours;
    });

    if (totalVideos === 0) return null;

    const uniqueDates = Object.keys(daysMap).sort();
    
    // Calculate Streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    if (uniqueDates.length > 0) {
      tempStreak = 1;
      longestStreak = 1;
      
      for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = new Date(uniqueDates[i-1]);
        const currDate = new Date(uniqueDates[i]);
        
        // Difference in days
        const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays === 1) {
          tempStreak++;
          if (tempStreak > longestStreak) longestStreak = tempStreak;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      
      // Calculate current streak
      const lastDateStr = uniqueDates[uniqueDates.length - 1];
      const lastDate = new Date(lastDateStr);
      const today = new Date();
      
      // Reset hours to 0 to compare dates properly
      lastDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      const daysFromToday = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysFromToday <= 1) {
        currentStreak = tempStreak;
      } else {
        currentStreak = 0;
      }
    }

    // Populate dayOfWeekCount using unique days
    uniqueDates.forEach(dateStr => {
      // Must parse properly to avoid timezone shifts! (e.g. YYYY-MM-DD to local date)
      const parts = dateStr.split("-");
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      dayOfWeekCount[d.getDay()]++;
    });

    // Records
    let peakDayVideos = { date: "", count: 0 };
    let marathonDay = { date: "", hours: 0 };
    Object.entries(daysMap).forEach(([date, data]) => {
      if (data.count > peakDayVideos.count) peakDayVideos = { date, count: data.count };
      if (data.hours > marathonDay.hours) marathonDay = { date, hours: data.hours };
    });

    let bestMonth = { month: "", hours: 0 };
    Object.entries(monthMap).forEach(([month, data]) => {
      if (data.hours > bestMonth.hours) bestMonth = { month, hours: data.hours };
    });

    let mostActiveYear = { year: "", count: 0 };
    let mostHoursYear = { year: "", hours: 0 };
    Object.entries(yearMap).forEach(([year, data]) => {
      if (data.count > mostActiveYear.count) mostActiveYear = { year, count: data.count };
      if (data.hours > mostHoursYear.hours) mostHoursYear = { year, hours: data.hours };
    });

    return {
      totalHours,
      totalVideos,
      uniqueDaysCount: uniqueDates.length,
      avgSessionLength: totalHours / (uniqueDates.length || 1),
      currentStreak,
      longestStreak,
      peakDayVideos,
      marathonDay,
      bestMonth,
      mostActiveYear,
      mostHoursYear,
      dayOfWeekCount
    };

  }, [videos, filters?.value]);

  if (loading) {
    return (
      <div className="px-5 pb-5">
        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-5 animate-pulse h-64" />
      </div>
    );
  }

  if (error || !insights) return null;

  const daysLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const maxDayCount = Math.max(...insights.dayOfWeekCount, 1);

  return (
    <div className="px-5 pb-5 flex flex-col gap-4 animate-fadeIn">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-6 flex flex-col gap-6 relative overflow-hidden backdrop-blur-xl">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold text-text-primary tracking-tight">Gaming Insights</h2>
          <span className="text-xs text-text-muted">Patterns and records based on your recordings</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Time" value={`${Math.round(insights.totalHours)}h`} subtitle={`${insights.totalVideos} videos`} />
          <StatCard title="Avg Session" value={`${insights.avgSessionLength.toFixed(1)}h`} subtitle="per active day" />
          <StatCard title="Current Streak" value={`${insights.currentStreak}d`} subtitle="consecutive days" highlight={insights.currentStreak > 0} />
          <StatCard title="Longest Streak" value={`${insights.longestStreak}d`} subtitle="all-time best" highlight={insights.longestStreak >= 7} />
        </div>

        <div className="h-px w-full bg-border-subtle my-2" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Day of Week Chart */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-text-secondary">Days Active (Day of Week)</h3>
            <div className="flex items-end gap-2 h-32 mt-2">
              {insights.dayOfWeekCount.map((count, idx) => {
                const heightPercent = count > 0 ? Math.max((count / maxDayCount) * 100, 5) : 0;
                // Shift index so Monday is first? Standard is Sunday=0. Let's keep Sunday=0 but label clearly.
                return (
                  <div key={idx} className="flex-1 flex flex-col justify-end items-center gap-2 group cursor-pointer h-full">
                    <div className="w-full flex justify-center h-full items-end relative">
                      <div className="absolute -top-8 bg-surface border border-border-subtle text-text-primary text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                        {count} days
                      </div>
                      <div 
                        className="w-full max-w-[24px] rounded-t-sm transition-all duration-500 ease-out bg-border-subtle group-hover:bg-accent group-hover:shadow-[0_0_15px_rgba(var(--accent-color),0.4)]"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted group-hover:text-text-secondary">
                      {daysLabels[idx]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Records & History */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-text-secondary">Records & History</h3>
            <div className="flex flex-col gap-3">
              <RecordRow label="Peak Day (Videos)" value={insights.peakDayVideos.count.toString()} date={insights.peakDayVideos.date} />
              <RecordRow label="Marathon Day (Hours)" value={`${insights.marathonDay.hours.toFixed(1)}h`} date={insights.marathonDay.date} />
              <RecordRow label="Best Month (Hours)" value={`${insights.bestMonth.hours.toFixed(1)}h`} date={insights.bestMonth.month} />
              <RecordRow label="Most Active Year" value={insights.mostActiveYear.year} date={`${insights.mostActiveYear.count} videos`} reverse />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, highlight = false }: { title: string, value: string, subtitle: string, highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 p-4 rounded-xl border transition-colors ${highlight ? 'bg-accent/10 border-accent/30' : 'bg-surface/50 border-border-subtle hover:border-border-medium'}`}>
      <span className="text-xs font-semibold text-text-muted">{title}</span>
      <span className={`text-2xl font-black tracking-tight ${highlight ? 'text-accent drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 'text-text-primary'}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider font-bold text-text-secondary">{subtitle}</span>
    </div>
  );
}

function RecordRow({ label, value, date, reverse = false }: { label: string, value: string, date: string, reverse?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surface/30 border border-border-subtle hover:bg-surface/60 transition-colors">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-text-primary">{label}</span>
        <span className="text-[10px] text-text-muted">{reverse ? date : formatDate(date)}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-black text-accent">{value}</span>
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 2) {
    // YYYY-MM
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    return date.toLocaleString("en-US", { month: "long", year: "numeric" });
  }
  if (parts.length === 3) {
    // YYYY-MM-DD
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return date.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return dateStr;
}
