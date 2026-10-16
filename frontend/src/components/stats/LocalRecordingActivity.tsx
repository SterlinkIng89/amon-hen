import { useState, useEffect, useMemo } from "react";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import {
  GetVideosFromFolders,
  LoadConfig,
  GetChannelVideosPaginated,
} from "../../../wailsjs/go/backend/App";
import ContributionHeatmap from "../youtube/ContributionHeatmap";
import type { DailyCount } from "../youtube/ContributionHeatmap";
import { toLocalDateKey, extractTitleDate } from "../../utils/videoUtils";
import {
  parseDurationToHours,
  resolveSessionGameName,
  aggregateDailyActivity,
  DailyActivityItem,
} from "../../utils/gameStats";
import AdvancedFilters, {
  ActiveFilterChips,
  AdvancedFiltersValue,
} from "../ui/AdvancedFilters";
import type { VideoFile, YTVideo } from "../../types";

type Source = "all" | "local" | "youtube";

interface LocalRecordingActivityProps {
  readonly filters: {
    readonly value: AdvancedFiltersValue;
    readonly onChange: (v: AdvancedFiltersValue) => void;
  };
  readonly selectedYear?: string;
  readonly onYearChange?: (year: string) => void;
}

export default function LocalRecordingActivity({
  filters,
  selectedYear,
  onYearChange,
}: LocalRecordingActivityProps) {
  // Raw unfiltered data (videos individually so we can filter)
  const [rawLocalVideos, setRawLocalVideos] = useState<VideoFile[]>([]);
  const [rawYtVideos, setRawYtVideos] = useState<YTVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>("all");
  const [metricSource, setMetricSource] = useState<"upload" | "title">("title");

  const load = async () => {
    setLoading(true);
    try {
      // ── Local files ──────────────────────────────────────────────────────────
      const cfg = await LoadConfig();
      const folders = cfg.folders ?? [];
      let localVideos: VideoFile[] = [];
      if (folders.length > 0) {
        localVideos = await GetVideosFromFolders(folders);
      }
      setRawLocalVideos(localVideos);

      // ── YouTube individual videos (so we can filter by title) ────────────────
      try {
        const res = (await GetChannelVideosPaginated(
          1,
          9999,
          "recent",
          "",
          "",
          "",
        )) as { videos?: YTVideo[] } | null;
        setRawYtVideos(res?.videos ?? []);
      } catch {
        setRawYtVideos([]);
      }
    } catch {
      setRawLocalVideos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsub1 = EventsOn("files:new", load);
    const unsub2 = EventsOn("youtube:sync-done", load);
    const unsub3 = EventsOn("youtube:done", load);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  // ── Filter helpers ─────────────────────────────────────────────────────────
  const { dateFrom, dateTo, excludeWords } = filters.value;

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

  // ── Build filtered activity items per source ───────────────────────────────
  const localItems = useMemo<DailyActivityItem[]>(() => {
    const items: DailyActivityItem[] = [];
    for (const v of rawLocalVideos) {
      const dateKey = toLocalDateKey(v.modTime);
      if (!matchesDate(dateKey)) continue;
      if (!notExcluded(v.name)) continue;
      items.push({
        date: dateKey,
        game: resolveSessionGameName(v.youtubeTitle, v.game),
        hours: v.durationSecs && v.durationSecs > 0 ? v.durationSecs / 3600 : 0,
        source: source === "all" ? "local" : undefined,
      });
    }
    return items;
  }, [rawLocalVideos, dateFrom, dateTo, excludeWords, source]);

  const ytItems = useMemo<DailyActivityItem[]>(() => {
    const items: DailyActivityItem[] = [];
    for (const v of rawYtVideos) {
      const titleDate = extractTitleDate(v.title);
      const uploadDate = v.publishedAt?.substring(0, 10) ?? "";
      const dateKey =
        metricSource === "title" ? titleDate || uploadDate : uploadDate;

      if (!dateKey) continue;
      if (!matchesDate(dateKey)) continue;
      if (!notExcluded(v.title)) continue;
      items.push({
        date: dateKey,
        game: resolveSessionGameName(v.title, v.gameTag),
        hours: parseDurationToHours(v.duration),
        source: source === "all" ? "youtube" : undefined,
      });
    }
    return items;
  }, [rawYtVideos, dateFrom, dateTo, excludeWords, metricSource, source]);

  const activeData = useMemo<DailyCount[]>(() => {
    if (source === "local") return aggregateDailyActivity(localItems);
    if (source === "youtube") return aggregateDailyActivity(ytItems);
    return aggregateDailyActivity([...localItems, ...ytItems]);
  }, [source, localItems, ytItems]);

  const SOURCES: { key: Source; label: string }[] = [
    { key: "all", label: "All" },
    { key: "local", label: "Local files" },
    { key: "youtube", label: "YouTube" },
  ];

  if (loading) {
    return (
      <div className="p-5 animate-pulse">
        <div className="h-48 rounded-xl bg-elevated/50 border border-border-subtle" />
      </div>
    );
  }

  const hasActiveFilters = dateFrom || dateTo || excludeWords.length > 0;

  return (
    <div className="p-5 flex flex-col gap-0 animate-fadeIn">
      <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-4">
        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap -mt-2">
            <ActiveFilterChips
              value={filters.value}
              onClearDateRange={() =>
                filters.onChange({ ...filters.value, dateFrom: "", dateTo: "" })
              }
              onClearExcludeWords={() =>
                filters.onChange({ ...filters.value, excludeWords: [] })
              }
            />
          </div>
        )}

        <ContributionHeatmap
          stats={activeData}
          label={metricSource === "upload" ? "upload" : "recording"}
          metricSource={metricSource}
          onMetricChange={setMetricSource}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          extraControls={
            <>
              {/* Source toggle */}
              <div className="flex items-center bg-[#141418] p-1 rounded-lg">
                {SOURCES.map((s) => (
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

              {/* Advanced filters — date + exclude words */}
              <AdvancedFilters
                value={filters.value}
                onChange={filters.onChange}
                showExcludeWords={true}
                showDateShortcuts={true}
                dateLabel="Date Range"
                excludeLabel="Exclude Words"
                excludePlaceholder="e.g. short, clip…"
                align="right"
              />
            </>
          }
        />
      </div>
    </div>
  );
}
