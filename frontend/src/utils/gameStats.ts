import { extractTitleDate } from "./videoUtils";
import { getGameColor, DEFAULT_GAME_COLOR } from "./tagColors";

export interface HistoricalVideo {
  title: string;
  published: string;
  duration: string;
  gameTag?: string;
}

export function parseDurationToHours(isoOrSecs: string): number {
  if (!isoOrSecs) return 0;
  const str = isoOrSecs.trim();
  if (!str) return 0;

  // 1. ISO 8601 (PT1H2M3S)
  const match = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (match && (match[1] || match[2] || match[3])) {
    const h = parseInt(match[1] || "0", 10);
    const m = parseInt(match[2] || "0", 10);
    const s = parseInt(match[3] || "0", 10);
    return h + m / 60 + s / 3600;
  }

  // 2. Standard timestamp HH:MM:SS or MM:SS
  if (str.includes(":")) {
    const parts = str.split(":").map((p) => parseFloat(p));
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      return parts[0] + parts[1] / 60 + parts[2] / 3600;
    }
    if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
      return parts[0] / 60 + parts[1] / 3600;
    }
  }

  // 3. Raw seconds (e.g. "3600" or "1820.5")
  const secs = parseFloat(str);
  if (!isNaN(secs) && secs > 0) {
    return secs / 3600;
  }

  return 0;
}

export function extractGameName(title: string, gameTag?: string): string {
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

export function resolveSessionGameName(
  title?: string,
  explicitGame?: string,
): string {
  if (explicitGame && explicitGame.trim()) {
    return explicitGame.trim();
  }
  if (!title || !title.trim()) return "";
  const candidate = extractGameName(title);
  if (!candidate || /^[\d\s_./:-]+$/.test(candidate)) {
    return "";
  }
  return candidate;
}

export function normalizeGameKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]+/g, "");
}

export interface DailyGameSummary {
  readonly game: string;
  readonly count: number;
  readonly hours: number;
}

export interface DailyActivityItem {
  readonly date: string; // YYYY-MM-DD
  readonly game?: string;
  readonly hours?: number;
  readonly source?: "local" | "youtube";
}

export interface EnrichedDailyCount {
  readonly date: string; // YYYY-MM-DD
  readonly count: number;
  readonly totalHours?: number;
  readonly localCount?: number;
  readonly youtubeCount?: number;
  readonly games?: readonly DailyGameSummary[];
}

export function aggregateDailyActivity(
  items: readonly DailyActivityItem[],
): EnrichedDailyCount[] {
  const byDate: Record<
    string,
    {
      count: number;
      totalHours: number;
      localCount: number;
      youtubeCount: number;
      games: Record<string, { display: string; count: number; hours: number }>;
    }
  > = {};

  for (const item of items) {
    if (!item.date) continue;
    let bucket = byDate[item.date];
    if (!bucket) {
      bucket = {
        count: 0,
        totalHours: 0,
        localCount: 0,
        youtubeCount: 0,
        games: {},
      };
      byDate[item.date] = bucket;
    }

    const hrs = item.hours && item.hours > 0 ? item.hours : 0;
    bucket.count += 1;
    bucket.totalHours += hrs;
    if (item.source === "local") bucket.localCount += 1;
    if (item.source === "youtube") bucket.youtubeCount += 1;

    const rawGame = item.game?.trim() || "";
    if (rawGame) {
      const norm = normalizeGameKey(rawGame);
      if (norm) {
        if (!bucket.games[norm]) {
          bucket.games[norm] = { display: rawGame, count: 0, hours: 0 };
        }
        bucket.games[norm].count += 1;
        bucket.games[norm].hours += hrs;
      }
    }
  }

  return Object.entries(byDate).map(([date, b]) => {
    const games: DailyGameSummary[] = Object.values(b.games)
      .map((g) => ({ game: g.display, count: g.count, hours: g.hours }))
      .sort(
        (a, c) =>
          c.count - a.count || c.hours - a.hours || a.game.localeCompare(c.game),
      );

    return {
      date,
      count: b.count,
      totalHours: b.totalHours,
      localCount: b.localCount,
      youtubeCount: b.youtubeCount,
      games,
    };
  });
}

export interface HeatmapPeriodSummary {
  readonly totalSessions: number;
  readonly activeDays: number;
  readonly totalDaysInPeriod: number;
  readonly activePercentage: number;
  readonly monthLabel: string;
  readonly monthActiveDays: number;
  readonly monthTotalDays: number;
  readonly monthActivePercentage: number;
  readonly longestStreak: number;
  readonly currentStreak: number;
}

function parseDateToUtcMs(dateStr: string): number {
  const parts = dateStr.split("-");
  const y = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "1", 10);
  const d = parseInt(parts[2] || "1", 10);
  return Date.UTC(y, m - 1, d);
}

export function computeHeatmapPeriodSummary(
  calendarData: Record<string, EnrichedDailyCount>,
  selectedYear: string,
  availableYears: readonly string[],
  today?: Date,
  selectedDate?: string | null,
): HeatmapPeriodSummary {
  const now = today ? new Date(today) : new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentDayOfMonth = now.getDate();
  const todayUtcMs = Date.UTC(currentYear, currentMonthIdx, currentDayOfMonth);
  const todayStr = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}-${String(currentDayOfMonth).padStart(2, "0")}`;

  const yr =
    selectedYear === "All"
      ? Math.min(
          currentYear,
          ...[
            ...availableYears.map((y) => parseInt(y, 10)),
            ...Object.keys(calendarData).map((k) =>
              parseInt(k.substring(0, 4), 10),
            ),
          ].filter((y) => !isNaN(y)),
        )
      : parseInt(selectedYear, 10) || currentYear;

  const startUtcMs = Date.UTC(yr, 0, 1);
  const endUtcMs =
    selectedYear === "All" || yr === currentYear
      ? todayUtcMs
      : Date.UTC(yr, 11, 31);

  const totalDaysInPeriod = Math.max(
    1,
    Math.round((endUtcMs - startUtcMs) / 86_400_000) + 1,
  );

  const activeEntries = Object.values(calendarData)
    .filter(
      (entry) =>
        Boolean(entry?.date) &&
        entry.count > 0 &&
        entry.date <= todayStr &&
        (selectedYear === "All" || entry.date.startsWith(`${selectedYear}-`)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const validSelectedDate =
    selectedDate &&
    selectedDate.length >= 7 &&
    (selectedYear === "All" || selectedDate.startsWith(`${selectedYear}-`))
      ? selectedDate
      : null;

  const isCurrentPeriod =
    selectedYear === "All" || selectedYear === currentYear.toString();
  const referenceDateStr =
    validSelectedDate ??
    (isCurrentPeriod
      ? todayStr
      : (activeEntries[activeEntries.length - 1]?.date ??
        `${selectedYear}-12-01`));

  const targetYear =
    parseInt(referenceDateStr.substring(0, 4), 10) || currentYear;
  const targetMonth = parseInt(referenceDateStr.substring(5, 7), 10) || 12;
  const targetMonthPrefix = `${targetYear}-${String(targetMonth).padStart(2, "0")}-`;

  const isCurrentCalendarMonth =
    targetYear === currentYear && targetMonth === currentMonthIdx + 1;
  const monthTotalDays = isCurrentCalendarMonth
    ? Math.max(1, currentDayOfMonth)
    : new Date(targetYear, targetMonth, 0).getDate();
  const monthName = MONTH_LABELS[targetMonth - 1] ?? "Jan";
  const monthLabel =
    selectedYear === "All" && targetYear !== currentYear
      ? `${monthName} ${targetYear}`
      : monthName;

  const monthActiveDays = activeEntries.filter((e) =>
    e.date.startsWith(targetMonthPrefix),
  ).length;
  const monthActivePercentage = Math.round(
    (monthActiveDays / monthTotalDays) * 100,
  );

  const totalSessions = activeEntries.reduce((sum, e) => sum + e.count, 0);
  const activeDays = activeEntries.length;
  const activePercentage =
    activeDays > 0 ? Math.round((activeDays / totalDaysInPeriod) * 100) : 0;

  let longestStreak = activeDays > 0 ? 1 : 0;
  let tempStreak = activeDays > 0 ? 1 : 0;

  for (let i = 1; i < activeEntries.length; i++) {
    const prevMs = parseDateToUtcMs(activeEntries[i - 1].date);
    const currMs = parseDateToUtcMs(activeEntries[i].date);
    const diffDays = Math.round((currMs - prevMs) / 86_400_000);

    if (diffDays === 1) {
      tempStreak += 1;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else if (diffDays > 1) {
      tempStreak = 1;
    }
  }

  let currentStreak = 0;
  if (isCurrentPeriod && activeDays > 0) {
    const lastMs = parseDateToUtcMs(
      activeEntries[activeEntries.length - 1].date,
    );
    if (Math.round((todayUtcMs - lastMs) / 86_400_000) <= 1) {
      currentStreak = tempStreak;
    }
  }

  return {
    totalSessions,
    activeDays,
    totalDaysInPeriod,
    activePercentage,
    monthLabel,
    monthActiveDays,
    monthTotalDays,
    monthActivePercentage,
    longestStreak,
    currentStreak,
  };
}

export interface DayGameBreakdown {
  date: string; // YYYY-MM-DD
  dayNum: number; // 1-31
  totalHours: number;
  byGame: Record<string, number>; // gameDisplayName -> hours
}

export interface MonthGameBreakdown {
  monthKey: string; // YYYY-MM
  monthIndex: number; // 0-11
  monthLabel: string; // "Jan", "Feb", ...
  totalHours: number;
  byGame: Record<string, number>; // gameDisplayName -> hours
}

export const OTHER_GAME_COLOR = DEFAULT_GAME_COLOR;

export { getGameColor };

export function assignGameColors(
  topGameNames: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  topGameNames.forEach((name) => {
    mapping[name] = getGameColor(name);
  });
  return mapping;
}

export interface AdvancedFilterValue {
  dateFrom?: string;
  dateTo?: string;
  excludeWords?: string[];
}

export interface AdvancedFiltersInput {
  value?: AdvancedFilterValue;
}

export function filterHistoricalVideos(
  videos: HistoricalVideo[],
  filters?: AdvancedFiltersInput,
): HistoricalVideo[] {
  if (!videos || videos.length === 0) return [];
  const dateFrom = filters?.value?.dateFrom || "";
  const dateTo = filters?.value?.dateTo || "";
  const excludeWords = filters?.value?.excludeWords || [];

  return videos.filter((v) => {
    const titleDate = extractTitleDate(v.title);
    const pubDate =
      titleDate ||
      (v.published && v.published.length >= 10
        ? v.published.substring(0, 10)
        : "");

    if (!pubDate || pubDate.length < 10) return false;
    if (dateFrom && pubDate < dateFrom) return false;
    if (dateTo && pubDate > dateTo) return false;

    if (excludeWords.length > 0) {
      const lower = v.title.toLowerCase();
      if (excludeWords.some((w) => lower.includes(w.toLowerCase()))) {
        return false;
      }
    }
    return true;
  });
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function buildDailyGameBreakdown(
  videos: HistoricalVideo[],
  year: string,
  monthKey: string, // "YYYY-MM"
): DayGameBreakdown[] {
  const parts = monthKey.split("-");
  const parsedYear = parseInt(parts[0] || year, 10);
  const parsedMonth = parseInt(parts[1] || "1", 10); // 1-indexed

  // Days in month
  const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();
  const dailyMap: Record<number, Record<string, number>> = {};

  for (let d = 1; d <= daysInMonth; d++) {
    dailyMap[d] = {};
  }

  videos.forEach((v) => {
    const titleDate = extractTitleDate(v.title);
    const pubDate =
      titleDate ||
      (v.published && v.published.length >= 10
        ? v.published.substring(0, 10)
        : "");

    if (!pubDate.startsWith(monthKey)) return;

    const dayNum = parseInt(pubDate.substring(8, 10), 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > daysInMonth) return;

    const game = extractGameName(v.title, v.gameTag);
    if (!game) return;

    const hours = parseDurationToHours(v.duration);
    dailyMap[dayNum][game] = (dailyMap[dayNum][game] || 0) + hours;
  });

  const result: DayGameBreakdown[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const byGame = dailyMap[d] || {};
    const totalHours = Object.values(byGame).reduce((acc, h) => acc + h, 0);
    const dayStr = `${monthKey}-${String(d).padStart(2, "0")}`;
    result.push({
      date: dayStr,
      dayNum: d,
      totalHours,
      byGame,
    });
  }

  return result;
}

export function buildMonthlyGameBreakdown(
  videos: HistoricalVideo[],
  year: string,
): MonthGameBreakdown[] {
  const monthlyMap: Record<number, Record<string, number>> = {};
  for (let m = 0; m < 12; m++) {
    monthlyMap[m] = {};
  }

  videos.forEach((v) => {
    const titleDate = extractTitleDate(v.title);
    const pubDate =
      titleDate ||
      (v.published && v.published.length >= 10
        ? v.published.substring(0, 10)
        : "");

    if (!pubDate.startsWith(year)) return;

    const mIdx = parseInt(pubDate.substring(5, 7), 10) - 1;
    if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return;

    const game = extractGameName(v.title, v.gameTag);
    if (!game) return;

    const hours = parseDurationToHours(v.duration);
    monthlyMap[mIdx][game] = (monthlyMap[mIdx][game] || 0) + hours;
  });

  return MONTH_LABELS.map((label, idx) => {
    const byGame = monthlyMap[idx] || {};
    const totalHours = Object.values(byGame).reduce((acc, h) => acc + h, 0);
    const monthKey = `${year}-${String(idx + 1).padStart(2, "0")}`;
    return {
      monthKey,
      monthIndex: idx,
      monthLabel: label,
      totalHours,
      byGame,
    };
  });
}
