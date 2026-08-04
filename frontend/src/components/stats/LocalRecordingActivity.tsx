import { useState, useEffect, useMemo } from "react";
import { EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime";
import { GetVideosFromFolders, LoadConfig, GetChannelAnalytics } from "../../../wailsjs/go/backend/App";
import ContributionHeatmap from "../youtube/ContributionHeatmap";
import type { DailyCount } from "../youtube/ContributionHeatmap";
import { toLocalDateKey } from "../../utils/videoUtils";

type Source = "all" | "local" | "youtube";

export default function LocalRecordingActivity() {
  const [localData, setLocalData] = useState<DailyCount[]>([]);
  const [ytData, setYtData] = useState<DailyCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>("all");

  const load = async () => {
    setLoading(true);
    try {
      // ── Local files ────────────────────────────────────────────────────────
      const cfg = await LoadConfig();
      const folders = cfg.folders ?? [];
      let local: DailyCount[] = [];
      if (folders.length > 0) {
        const videos = await GetVideosFromFolders(folders);
        const counts: Record<string, number> = {};
        for (const v of videos) {
          const key = toLocalDateKey(v.modTime);
          counts[key] = (counts[key] || 0) + 1;
        }
        local = Object.entries(counts).map(([date, count]) => ({ date, count }));
      }
      setLocalData(local);

      // ── YouTube channel data (title dates = recording dates) ───────────────
      try {
        const analytics: any = await GetChannelAnalytics();
        const ytCounts: Record<string, number> = {};
        for (const d of analytics?.titleDailyTrend ?? []) {
          ytCounts[d.date] = (ytCounts[d.date] || 0) + d.count;
        }
        setYtData(Object.entries(ytCounts).map(([date, count]) => ({ date, count })));
      } catch {
        setYtData([]);
      }
    } catch {
      setLocalData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    EventsOn("files:new", load);
    EventsOn("youtube:sync-done", load);
    EventsOn("youtube:done", load);
    return () => {
      EventsOff("files:new");
      EventsOff("youtube:sync-done");
      EventsOff("youtube:done");
    };
  }, []);

  // Merge both sources by summing counts per date
  const mergedData = useMemo<DailyCount[]>(() => {
    const combined: Record<string, number> = {};
    for (const d of localData) combined[d.date] = (combined[d.date] || 0) + d.count;
    for (const d of ytData)    combined[d.date] = (combined[d.date] || 0) + d.count;
    return Object.entries(combined).map(([date, count]) => ({ date, count }));
  }, [localData, ytData]);

  const activeData =
    source === "local"   ? localData   :
    source === "youtube" ? ytData       :
    mergedData;

  const SOURCES: { key: Source; label: string }[] = [
    { key: "all",     label: "All" },
    { key: "local",   label: "Local files" },
    { key: "youtube", label: "YouTube" },
  ];

  if (loading) {
    return (
      <div className="p-5 animate-pulse">
        <div className="h-48 rounded-xl bg-elevated/50 border border-border-subtle" />
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-0 animate-fadeIn">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-4">

        {/* Source filter */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-text-primary">Recording activity</span>
          <div className="flex items-center bg-[#141418] p-1 rounded-lg">
            {SOURCES.map(s => (
              <button
                key={s.key}
                onClick={() => setSource(s.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  source === s.key
                    ? "bg-accent text-white font-semibold shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <ContributionHeatmap
          stats={activeData}
          label="recording"
        />
      </div>
    </div>
  );
}

