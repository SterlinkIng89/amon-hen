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

export function normalizeGameKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]+/g, "");
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
