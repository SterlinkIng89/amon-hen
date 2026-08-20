import { useState, useEffect, useMemo } from "react";
import { EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime";
import { GetVideosFromFolders, LoadConfig, GetChannelVideosPaginated } from "../../../wailsjs/go/backend/App";
import ContributionHeatmap from "../youtube/ContributionHeatmap";
import type { DailyCount } from "../youtube/ContributionHeatmap";
import { toLocalDateKey, extractTitleDate } from "../../utils/videoUtils";
import AdvancedFilters, { ActiveFilterChips } from "../ui/AdvancedFilters";
import type { VideoFile, YTVideo } from "../../types";

type Source = "all" | "local" | "youtube";

interface LocalRecordingActivityProps {
 filters: any; 
 selectedYear?: string;
 onYearChange?: (year: string) => void;
}

export default function LocalRecordingActivity({ filters, selectedYear, onYearChange }: LocalRecordingActivityProps) {
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
 const res: any = await GetChannelVideosPaginated(1, 9999, "recent", "", "", "");
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

 // ── Aggregate local videos → DailyCount[] ──────────────────────────────────
 const localData = useMemo<DailyCount[]>(() => {
 const counts: Record<string, number> = {};
 for (const v of rawLocalVideos) {
 const dateKey = toLocalDateKey(v.modTime);
 if (!matchesDate(dateKey)) continue;
 if (!notExcluded(v.name)) continue;
 counts[dateKey] = (counts[dateKey] || 0) + 1;
 }
 return Object.entries(counts).map(([date, count]) => ({ date, count }));
 }, [rawLocalVideos, dateFrom, dateTo, excludeWords]);

 // ── Aggregate YouTube videos → DailyCount[] ────────────────────────────────
 // Use extractTitleDate (recording date in title) matching ChannelAnalytics behavior
 const ytData = useMemo<DailyCount[]>(() => {
 const counts: Record<string, number> = {};
 for (const v of rawYtVideos) {
 const titleDate = extractTitleDate(v.title);
 const uploadDate = v.publishedAt?.substring(0, 10) ?? "";
 
 const dateKey = metricSource === "title" 
 ? (titleDate || uploadDate) 
 : uploadDate;

 if (!dateKey) continue;
 if (!matchesDate(dateKey)) continue;
 if (!notExcluded(v.title)) continue;
 counts[dateKey] = (counts[dateKey] || 0) + 1;
 }
 return Object.entries(counts).map(([date, count]) => ({ date, count }));
 }, [rawYtVideos, dateFrom, dateTo, excludeWords, metricSource]);

 // ── Merge ──────────────────────────────────────────────────────────────────
 const mergedData = useMemo<DailyCount[]>(() => {
 const combined: Record<string, number> = {};
 for (const d of localData) combined[d.date] = (combined[d.date] || 0) + d.count;
 for (const d of ytData) combined[d.date] = (combined[d.date] || 0) + d.count;
 return Object.entries(combined).map(([date, count]) => ({ date, count }));
 }, [localData, ytData]);

 const activeData =
 source === "local" ? localData :
 source === "youtube" ? ytData :
 mergedData;

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
 onClearDateRange={() => filters.onChange({ ...filters.value, dateFrom: "", dateTo: "" })}
 onClearExcludeWords={() => filters.onChange({ ...filters.value, excludeWords: [] })}
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
