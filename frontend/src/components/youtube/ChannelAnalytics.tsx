import { useState, useEffect, useCallback, useMemo } from "react";
import {
  GetChannelAnalytics,
  GetChannelVideosPaginated,
} from "../../../wailsjs/go/backend/App";
import ContributionHeatmap from "./ContributionHeatmap";
import { extractTitleDate } from "../../utils/videoUtils";

// ── Types matching the Go structs ───────────────────────────────────────────

interface TopVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  duration: string;
  privacy: string;
}

interface MonthlyCount {
  month: string;
  count: number;
}

interface DailyCount {
  date: string;
  count: number;
}

interface ChannelAnalytics {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalPlaylists: number;
  avgViewsPerVideo: number;
  avgLikesPerVideo: number;
  likeRatio: number;
  publicCount: number;
  unlistedCount: number;
  privateCount: number;
  topVideos: TopVideo[];
  uploadTrend: MonthlyCount[];
  dailyTrend: DailyCount[];
  titleDailyTrend: DailyCount[];
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function parseISODuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  const s = parseInt(m[3] || "0");
  if (h > 0)
    return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Animated number that counts up from 0 to value on mount */
function CountUp({
  value,
  format,
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 900;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(value * eased);
      setDisplay(start);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  return <>{format ? format(display) : formatNum(display)}</>;
}

/** Single KPI stat card */
function StatCard({
  label,
  value,
  sub,
  icon,
  accent = false,
  raw,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
  raw?: number;
}) {
  return (
    <div
      className={`relative flex flex-col gap-2 p-4 rounded-xl border transition-all overflow-hidden group ${
        accent
          ? "bg-accent/8 border-accent/25 hover:border-accent/40"
          : "bg-elevated/40 border-border-subtle hover:border-border-medium"
      }`}
    >
      {/* glow blob */}
      {accent && (
        <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-accent/10 blur-2xl pointer-events-none" />
      )}
      <div className="flex items-center justify-between">
        <span
          className={`text-[10px] font-bold tracking-widest ${accent ? "text-accent/70" : "text-text-muted"}`}
        >
          {label}
        </span>
        <span
          className={`${accent ? "text-accent" : "text-text-muted"} opacity-60 group-hover:opacity-90 transition-opacity`}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-2xl font-black tabular-nums tracking-tight ${accent ? "text-accent" : "text-text-primary"}`}
        >
          {raw !== undefined ? <CountUp value={raw} /> : value}
        </span>
      </div>
      {sub && (
        <span className="text-[10px] text-text-muted font-medium">{sub}</span>
      )}
    </div>
  );
}

/** Sparkline bar chart for upload trend */
function UploadSparkline({ data }: { data: MonthlyCount[] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold tracking-widest text-text-muted">
        Upload Trend — last 12 months
      </span>
      <div className="flex items-end gap-1 h-16">
        {data.map((d, i) => {
          const pct = (d.count / max) * 100;
          const shortMonth = d.month.slice(5); // "MM"
          return (
            <div
              key={d.month}
              className="group/bar flex-1 flex flex-col items-center gap-1 relative"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover/bar:opacity-100 transition-opacity z-10">
                <div className="bg-elevated border border-border-medium rounded-md px-2 py-1 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-text-primary">
                    {d.count}
                  </span>
                  <span className="text-[9px] text-text-muted ml-1">
                    {d.month}
                  </span>
                </div>
              </div>
              <div
                className="w-full rounded-t-sm transition-all duration-700 bg-accent/40 group-hover/bar:bg-accent"
                style={{
                  height: `${Math.max(pct, 4)}%`,
                  animationDelay: `${i * 40}ms`,
                }}
              />
              <span className="text-[8px] text-text-muted tabular-nums">
                {shortMonth}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Privacy distribution mini-donut using SVG */
function PrivacyDonut({
  pub,
  unl,
  priv,
  total,
}: {
  pub: number;
  unl: number;
  priv: number;
  total: number;
}) {
  if (total === 0) return null;

  const segments = [
    { label: "Public", count: pub, color: "#4ade80" },
    { label: "Unlisted", count: unl, color: "#f97316" },
    { label: "Private", count: priv, color: "#71717a" },
  ].filter((s) => s.count > 0);

  // Build SVG arc segments
  const R = 28;
  const cx = 36;
  const cy = 36;
  const circumference = 2 * Math.PI * R;

  let cumulativePct = 0;
  const arcSegments = segments.map((seg) => {
    const pct = seg.count / total;
    const dashArray = `${pct * circumference} ${circumference}`;
    const offset = circumference * (1 - cumulativePct);
    cumulativePct += pct;
    return { ...seg, dashArray, offset };
  });

  return (
    <div className="flex items-center gap-4">
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        className="shrink-0 -rotate-90"
      >
        {arcSegments.map((seg) => (
          <circle
            key={seg.label}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth="10"
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.offset}
            strokeLinecap="butt"
          />
        ))}
        {/* Inner hole */}
        <circle cx={cx} cy={cy} r={21} fill="#18181b" />
      </svg>
      <div className="flex flex-col gap-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: seg.color }}
            />
            <span className="text-[11px] text-text-secondary font-medium">
              {seg.label}
            </span>
            <span className="text-[11px] font-bold text-text-primary tabular-nums ml-auto">
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Top video row */
function TopVideoRow({
  video,
  rank,
  maxViews,
}: {
  video: TopVideo;
  rank: number;
  maxViews: number;
}) {
  const pct = maxViews > 0 ? (video.viewCount / maxViews) * 100 : 0;
  const privacyColors: Record<string, string> = {
    public: "text-green-400",
    unlisted: "text-accent",
    private: "text-text-muted",
  };
  const privColor =
    privacyColors[video.privacy?.toLowerCase()] ?? "text-text-muted";

  return (
    <div className="group flex items-center gap-3 py-2 border-b border-border-subtle/50 last:border-0 hover:bg-elevated/30 rounded-lg px-2 -mx-2 transition-colors">
      {/* Rank */}
      <span
        className={`text-[11px] font-black tabular-nums w-4 text-center shrink-0 ${
          rank === 1
            ? "text-yellow-400"
            : rank === 2
              ? "text-zinc-400"
              : rank === 3
                ? "text-amber-600"
                : "text-text-muted"
        }`}
      >
        {rank}
      </span>

      {/* Thumbnail */}
      <div className="w-14 h-8 rounded overflow-hidden shrink-0 bg-black">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-elevated flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-text-muted"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </div>

      {/* Title + bar */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-text-primary truncate leading-tight">
          {video.title}
        </span>
        <div className="w-full h-[3px] bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-accent/60 group-hover:bg-accent transition-colors"
            style={{ width: `${pct}%`, transition: "width 0.6s ease" }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-[11px] font-bold text-text-primary tabular-nums">
          {formatNum(video.viewCount)}
        </span>
        <span className={`text-[9px] font-bold ${privColor}`}>
          {video.privacy || "—"}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface ChannelAnalyticsProps {
  /** Trigger re-fetch when this changes (e.g. after a sync) */
  refreshKey?: number;
  onDateFilter?: (date: string) => void;
  heatmapOnly?: boolean;
  /** Words to exclude from the heatmap (filters by video title) */
  excludeWords?: string[];
}

export default function ChannelAnalytics({
  refreshKey = 0,
  onDateFilter,
  heatmapOnly = false,
  excludeWords = [],
}: ChannelAnalyticsProps) {
  const [data, setData] = useState<ChannelAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapSource, setHeatmapSource] = useState<"upload" | "title">(
    "title",
  );
  // Raw YouTube videos — only fetched when excludeWords is non-empty
  const [rawYtVideos, setRawYtVideos] = useState<any[]>([]);
  const [loadingYtVideos, setLoadingYtVideos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await GetChannelAnalytics();
      setData(res as unknown as ChannelAnalytics);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Fetch individual videos when excludeWords is set (so we can filter by title)
  useEffect(() => {
    if (excludeWords.length === 0) {
      setRawYtVideos([]);
      return;
    }
    let cancelled = false;
    setLoadingYtVideos(true);
    GetChannelVideosPaginated(1, 9999, "recent", "", "", "")
      .then((res: any) => {
        if (!cancelled) setRawYtVideos(res?.videos ?? []);
      })
      .catch(() => {
        if (!cancelled) setRawYtVideos([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingYtVideos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [excludeWords.length > 0]);

  // Build filtered heatmap data from individual videos when excludeWords is active
  const filteredTitleDailyTrend = useMemo<DailyCount[]>(() => {
    if (excludeWords.length === 0 || rawYtVideos.length === 0) {
      return data?.titleDailyTrend ?? [];
    }
    const lowerWords = excludeWords.map((w) => w.toLowerCase());
    const counts: Record<string, number> = {};
    for (const v of rawYtVideos) {
      const title = v.title ?? "";
      if (lowerWords.some((w) => title.toLowerCase().includes(w))) continue;
      const dateKey =
        extractTitleDate(title) || v.publishedAt?.substring(0, 10) || "";
      if (!dateKey) continue;
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    }
    return Object.entries(counts).map(([date, count]) => ({ date, count }));
  }, [excludeWords, rawYtVideos, data?.titleDailyTrend]);

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-5 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-elevated/50 border border-border-subtle"
            />
          ))}
        </div>
        <div className="h-48 rounded-xl bg-elevated/50 border border-border-subtle" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-400 text-sm gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        {error}
      </div>
    );
  }

  if (!data || data.totalVideos === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 9h.01M15 9h.01M9 15h6" />
        </svg>
        <p className="text-sm font-medium">
          No data yet — sync your channel first
        </p>
      </div>
    );
  }

  const maxViews = data.topVideos?.[0]?.viewCount ?? 1;

  return (
    <div className="flex flex-col gap-5 p-5 animate-fadeIn">
      {/* ── Row 1: KPI Cards ─────────────────────────────────────────────── */}
      {!heatmapOnly && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Views"
            value={formatNum(data.totalViews)}
            raw={data.totalViews}
            sub={`Avg ${formatNum(Math.round(data.avgViewsPerVideo))} / video`}
            accent
            icon={
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
              </svg>
            }
          />
          <StatCard
            label="Total Likes"
            value={formatNum(data.totalLikes)}
            raw={data.totalLikes}
            sub={`${data.likeRatio.toFixed(2)}% like ratio`}
            icon={
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
              </svg>
            }
          />
          <StatCard
            label="Videos"
            value={data.totalVideos}
            raw={data.totalVideos}
            sub={`${data.totalPlaylists} playlist${data.totalPlaylists !== 1 ? "s" : ""}`}
            icon={
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
              </svg>
            }
          />
          <StatCard
            label="Avg Likes / Video"
            value={formatNum(Math.round(data.avgLikesPerVideo))}
            raw={Math.round(data.avgLikesPerVideo)}
            sub={`${data.publicCount} public · ${data.unlistedCount} unlisted · ${data.privateCount} private`}
            icon={
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
              </svg>
            }
          />
        </div>
      )}

      {/* ── Row 2: Contribution Heatmap ─────────────────────────────────────────────── */}
      {(data.dailyTrend?.length > 0 || data.titleDailyTrend?.length > 0) && (
        <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-4">
          <ContributionHeatmap
            stats={
              heatmapSource === "upload"
                ? data.dailyTrend
                : filteredTitleDailyTrend
            }
            label={heatmapSource === "upload" ? "upload" : "recording"}
            metricSource={heatmapSource}
            onMetricChange={setHeatmapSource}
            onDateClick={onDateFilter}
          />
          {loadingYtVideos && excludeWords.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted animate-pulse">
              <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
              Filtering heatmap by excluded words…
            </div>
          )}
        </div>
      )}

      {/* ── Row 3: Top Videos + Side panels ─────────────────────────────── */}
      {!heatmapOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top Videos (takes 2/3) */}
          <div className="lg:col-span-2 bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-widest text-text-muted">
                Top Videos by Views
              </span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-text-muted"
              >
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z" />
              </svg>
            </div>
            <div className="flex flex-col">
              {(data.topVideos ?? []).map((v, i) => (
                <TopVideoRow
                  key={v.id}
                  video={v}
                  rank={i + 1}
                  maxViews={maxViews}
                />
              ))}
            </div>
          </div>

          {/* Right column: Privacy breakdown + Trend */}
          <div className="flex flex-col gap-4">
            {/* Privacy donut */}
            <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4 flex flex-col gap-3">
              <span className="text-[10px] font-bold tracking-widest text-text-muted">
                Privacy Distribution
              </span>
              <PrivacyDonut
                pub={data.publicCount}
                unl={data.unlistedCount}
                priv={data.privateCount}
                total={data.totalVideos}
              />
            </div>

            {/* Upload trend sparkline */}
            {data.uploadTrend && data.uploadTrend.length > 0 && (
              <div className="bg-elevated/30 border border-border-subtle rounded-xl p-4">
                <UploadSparkline data={data.uploadTrend} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
