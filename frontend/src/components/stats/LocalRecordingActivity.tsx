import { useState, useEffect, useMemo } from "react";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import {
  GetVideosFromFolders,
  LoadConfig,
  GetChannelVideosPaginated,
  GetThumbnail,
} from "../../../wailsjs/go/backend/App";
import ContributionHeatmap from "../youtube/ContributionHeatmap";
import type { DailyCount } from "../youtube/ContributionHeatmap";
import {
  toLocalDateKey,
  extractTitleDate,
  formatPlaytimeHoursMinutes,
  formatName,
  resolveVideoEpisode,
} from "../../utils/videoUtils";
import {
  parseDurationToHours,
  resolveSessionGameName,
  aggregateDailyActivity,
  DailyActivityItem,
} from "../../utils/gameStats";
import {
  enqueueThumb,
  getCachedThumb,
  setCachedThumb,
} from "../../hooks/useThumbnailQueue";
import AdvancedFilters, {
  ActiveFilterChips,
  AdvancedFiltersValue,
} from "../ui/AdvancedFilters";
import type { VideoFile, YTVideo } from "../../types";

type Source = "all" | "local" | "youtube";

export interface DaySessionItem {
  readonly id: string;
  readonly title: string;
  readonly game: string;
  readonly hours: number;
  readonly source: "local" | "youtube";
  readonly thumbnailUrl?: string;
  readonly localPath?: string;
  readonly episode?: number;
  readonly timestamp?: number;
  readonly date?: string;
}

function SessionThumbnail({
  thumbnailUrl,
  localPath,
}: {
  readonly thumbnailUrl?: string;
  readonly localPath?: string;
}) {
  const [thumb, setThumb] = useState<string>(() =>
    localPath ? getCachedThumb(localPath) || "" : "",
  );

  useEffect(() => {
    if (thumbnailUrl || !localPath || thumb) return;
    let mounted = true;
    enqueueThumb(() => GetThumbnail(localPath))
      .then((data) => {
        if (mounted && data) {
          setCachedThumb(localPath, data);
          setThumb(data);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [localPath, thumbnailUrl, thumb]);

  const src = thumbnailUrl || thumb;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="w-12 h-7 rounded bg-black object-cover shrink-0"
      />
    );
  }

  return (
    <div className="w-12 h-7 rounded bg-black/60 border border-[#26262b] flex items-center justify-center text-text-muted shrink-0">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m10 9 5 3-5 3V9z" fill="currentColor" />
      </svg>
    </div>
  );
}

interface LocalRecordingActivityProps {
  readonly filters: {
    readonly value: AdvancedFiltersValue;
    readonly onChange: (v: AdvancedFiltersValue) => void;
  };
  readonly selectedYear?: string;
  readonly onYearChange?: (year: string) => void;
  readonly selectedDate?: string | null;
  readonly onDateSelect?: (date: string | null) => void;
}

export default function LocalRecordingActivity({
  filters,
  selectedYear,
  onYearChange,
  selectedDate,
  onDateSelect,
}: LocalRecordingActivityProps) {
  // Raw unfiltered data (videos individually so we can filter)
  const [rawLocalVideos, setRawLocalVideos] = useState<VideoFile[]>([]);
  const [rawYtVideos, setRawYtVideos] = useState<YTVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>("all");
  const [metricSource, setMetricSource] = useState<"upload" | "title">("title");
  const [internalSelectedDate, setInternalSelectedDate] = useState<string | null>(null);

  const activeSelectedDate =
    selectedDate !== undefined ? selectedDate : internalSelectedDate;

  const handleDateSelect = (date: string | null) => {
    if (selectedDate === undefined) {
      setInternalSelectedDate(date);
    }
    onDateSelect?.(date);
  };

  const handleDateClick = (clickedDate: string) => {
    handleDateSelect(activeSelectedDate === clickedDate ? null : clickedDate);
  };

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
  const ytIdsSet = useMemo(
    () => new Set(rawYtVideos.map((y) => y.id)),
    [rawYtVideos],
  );
  const ytLocalFilesSet = useMemo(
    () => new Set(rawYtVideos.map((y) => y.localFile).filter(Boolean)),
    [rawYtVideos],
  );

  const isLocalAlreadyInYt = (v: VideoFile) =>
    Boolean(
      (v.youtubeId && (ytIdsSet.has(v.youtubeId) || v.youtubeId.trim() !== "")) ||
      (v.path && ytLocalFilesSet.has(v.path)) ||
      (v.name && ytLocalFilesSet.has(v.name)),
    );

  const localItems = useMemo<DailyActivityItem[]>(() => {
    const items: DailyActivityItem[] = [];
    for (const v of rawLocalVideos) {
      if (source === "all" && isLocalAlreadyInYt(v)) continue;
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
  }, [
    rawLocalVideos,
    dateFrom,
    dateTo,
    excludeWords,
    source,
    ytIdsSet,
    ytLocalFilesSet,
  ]);

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

  const selectedDaySessions = useMemo<DaySessionItem[]>(() => {
    if (!activeSelectedDate) return [];

    const sessions: DaySessionItem[] = [];

    if (source === "all" || source === "local") {
      for (const v of rawLocalVideos) {
        if (source === "all" && isLocalAlreadyInYt(v)) continue;
        const dateKey = toLocalDateKey(v.modTime);
        if (dateKey !== activeSelectedDate) continue;
        if (!matchesDate(dateKey)) continue;
        if (!notExcluded(v.name)) continue;

        const title = v.youtubeTitle?.trim() || formatName(v.name);
        sessions.push({
          id: `local-${v.path || v.name}`,
          title,
          game: resolveSessionGameName(v.youtubeTitle, v.game),
          hours: v.durationSecs && v.durationSecs > 0 ? v.durationSecs / 3600 : 0,
          source: "local",
          localPath: v.path,
          episode: resolveVideoEpisode(v.episode, undefined, title),
          timestamp: v.modTime,
          date: dateKey,
        });
      }
    }

    if (source === "all" || source === "youtube") {
      for (const v of rawYtVideos) {
        const titleDate = extractTitleDate(v.title);
        const uploadDate = v.publishedAt?.substring(0, 10) ?? "";
        const dateKey =
          metricSource === "title" ? titleDate || uploadDate : uploadDate;

        if (dateKey !== activeSelectedDate) continue;
        if (!matchesDate(dateKey)) continue;
        if (!notExcluded(v.title)) continue;

        sessions.push({
          id: `yt-${v.id}`,
          title: v.title,
          game: resolveSessionGameName(v.title, v.gameTag),
          hours: parseDurationToHours(v.duration),
          source: "youtube",
          thumbnailUrl: v.thumbnailUrl || undefined,
          episode: resolveVideoEpisode(v.episode, undefined, v.title),
          timestamp: v.publishedAt ? new Date(v.publishedAt).getTime() : 0,
          date: dateKey,
        });
      }
    }

    sessions.sort((a, b) => {
      // 1. Primary: Date string (ascending)
      if (a.date && b.date && a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      // 2. Secondary: Episode number (ascending)
      const epA = a.episode ?? 0;
      const epB = b.episode ?? 0;
      if (epA > 0 && epB > 0 && epA !== epB) {
        return epA - epB;
      }
      if (epA > 0 && epB === 0) return -1;
      if (epA === 0 && epB > 0) return 1;
      // 3. Tertiary: Timestamp (ascending)
      const timeA = a.timestamp ?? 0;
      const timeB = b.timestamp ?? 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // 4. Fallback: Title alphabetically
      return a.title.localeCompare(b.title);
    });

    return sessions;
  }, [
    activeSelectedDate,
    source,
    rawLocalVideos,
    rawYtVideos,
    dateFrom,
    dateTo,
    excludeWords,
    metricSource,
    ytIdsSet,
    ytLocalFilesSet,
  ]);

  const dayInspectorSummary = useMemo(() => {
    if (!activeSelectedDate || selectedDaySessions.length === 0) return null;
    const [y, m, d] = activeSelectedDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
    const month = dateObj.toLocaleDateString("en-US", { month: "short" });
    const formattedDate = `${weekday}, ${month} ${d}, ${y}`;
    const totalHours = selectedDaySessions.reduce((acc, s) => acc + s.hours, 0);

    return {
      formattedDate,
      count: selectedDaySessions.length,
      totalHours,
    };
  }, [activeSelectedDate, selectedDaySessions]);

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
          selectedDate={activeSelectedDate}
          onDateClick={handleDateClick}
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

        {dayInspectorSummary && (
          <div className="bg-surface border border-[#232328] rounded-lg p-3.5 shadow-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-[#232328]/60">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-text-primary">
                  {dayInspectorSummary.formattedDate}
                </span>
                <span className="text-xs text-text-muted">·</span>
                <span className="text-[11px] font-semibold text-accent tabular-nums">
                  {dayInspectorSummary.count}{" "}
                  {metricSource === "upload" ? "upload" : "recording"}
                  {dayInspectorSummary.count === 1 ? "" : "s"} ·{" "}
                  {formatPlaytimeHoursMinutes(dayInspectorSummary.totalHours)}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close day inspector"
                onClick={() => handleDateSelect(null)}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-elevated/50 transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
              {selectedDaySessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 py-1.5 px-2.5 rounded-md bg-elevated/40 border border-[#222226] hover:border-[#2e2e34] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <SessionThumbnail
                      thumbnailUrl={session.thumbnailUrl}
                      localPath={session.localPath}
                    />
                    <span className="text-xs font-semibold text-text-primary truncate">
                      {session.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="w-[54px] text-right shrink-0 tabular-nums text-[11px] text-text-secondary font-medium">
                      {session.hours > 0
                        ? formatPlaytimeHoursMinutes(session.hours)
                        : "—"}
                    </span>
                    <span
                      className={`w-[62px] h-[22px] flex items-center justify-center rounded text-[10px] font-semibold border ${
                        session.source === "local"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-accent/15 text-accent border-accent/30"
                      }`}
                    >
                      {session.source === "local" ? "Local" : "YouTube"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
