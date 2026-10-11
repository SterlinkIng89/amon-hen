import { extractTitleDate } from "./videoUtils";
import {
  HistoricalVideo,
  extractGameName,
  parseDurationToHours,
} from "./gameStats";

export interface StintGame {
  readonly game: string;
  readonly hours: number;
  readonly firstPlayedAt?: string; // Earliest published timestamp or title date
}

export interface GameStint {
  readonly id: string;
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string; // YYYY-MM-DD
  readonly dayCount: number; // Number of days in the span or played
  readonly games: readonly StintGame[]; // Sorted ascending by firstPlayedAt (earliest played game first)
  readonly totalHours: number;
}

/**
 * Builds chronological stints for a specific month (monthKey: "YYYY-MM").
 *
 * Rules:
 * 1. Groups days with gaming activity strictly in chronological order.
 * 2. If a day has no activity, it skips straight to the next active day.
 * 3. Consecutive active days with the exact same primary game (or set of games)
 *    are grouped into a single stint.
 * 4. When a different game is played, a new stint begins (even if the previous game returns later, e.g. A -> B -> A).
 * 5. Days with multiple games have their games grouped together in `games` list, sorted by firstPlayedAt ascending.
 */
function compareStintGames(a: StintGame, b: StintGame): number {
  if (a.firstPlayedAt && b.firstPlayedAt && a.firstPlayedAt !== b.firstPlayedAt) {
    return a.firstPlayedAt.localeCompare(b.firstPlayedAt);
  }
  return b.hours - a.hours;
}

export function buildMonthStints(
  videos: readonly HistoricalVideo[],
  monthKey: string,
): readonly GameStint[] {
  if (!videos || videos.length === 0 || !monthKey) {
    return [];
  }

  interface DailyGameEntry {
    hours: number;
    firstPlayedAt: string;
  }
  const dailyGameHours: Record<string, Record<string, DailyGameEntry>> = {};

  videos.forEach((v) => {
    const titleDate = extractTitleDate(v.title);
    const pubDate =
      titleDate ||
      (v.published && v.published.length >= 10
        ? v.published.substring(0, 10)
        : "");

    if (!pubDate.startsWith(monthKey)) return;

    const game = extractGameName(v.title, v.gameTag);
    if (!game) return;

    const hours = parseDurationToHours(v.duration);
    if (hours <= 0) return;

    const publishedTimestamp = v.published || pubDate;

    if (!dailyGameHours[pubDate]) {
      dailyGameHours[pubDate] = {};
    }
    if (!dailyGameHours[pubDate][game]) {
      dailyGameHours[pubDate][game] = {
        hours: 0,
        firstPlayedAt: publishedTimestamp,
      };
    }

    dailyGameHours[pubDate][game].hours += hours;
    if (
      publishedTimestamp &&
      (!dailyGameHours[pubDate][game].firstPlayedAt ||
        publishedTimestamp < dailyGameHours[pubDate][game].firstPlayedAt)
    ) {
      dailyGameHours[pubDate][game].firstPlayedAt = publishedTimestamp;
    }
  });

  const activeDates = Object.keys(dailyGameHours).sort();
  if (activeDates.length === 0) {
    return [];
  }

  interface DaySummary {
    date: string;
    games: StintGame[];
    primaryGame: string;
    totalHours: number;
  }

  const days: DaySummary[] = activeDates.map((date) => {
    const gameMap = dailyGameHours[date] || {};
    const games: StintGame[] = Object.entries(gameMap)
      .map(([game, data]) => ({
        game,
        hours: data.hours,
        firstPlayedAt: data.firstPlayedAt,
      }))
      .sort(compareStintGames);

    const totalHours = games.reduce((acc, g) => acc + g.hours, 0);
    const primaryGame =
      [...games].sort((a, b) => b.hours - a.hours)[0]?.game || "";

    return {
      date,
      games,
      primaryGame,
      totalHours,
    };
  });

  const stints: GameStint[] = [];
  let currentDays: DaySummary[] = [];

  const flushCurrent = () => {
    if (currentDays.length === 0) return;

    const startDate = currentDays[0].date;
    const endDate = currentDays[currentDays.length - 1].date;

    const combinedGamesMap: Record<
      string,
      { hours: number; firstPlayedAt: string }
    > = {};
    currentDays.forEach((d) => {
      d.games.forEach((g) => {
        if (!combinedGamesMap[g.game]) {
          combinedGamesMap[g.game] = {
            hours: 0,
            firstPlayedAt: g.firstPlayedAt || "",
          };
        }
        combinedGamesMap[g.game].hours += g.hours;
        if (
          g.firstPlayedAt &&
          (!combinedGamesMap[g.game].firstPlayedAt ||
            g.firstPlayedAt < combinedGamesMap[g.game].firstPlayedAt)
        ) {
          combinedGamesMap[g.game].firstPlayedAt = g.firstPlayedAt;
        }
      });
    });

    const combinedGames: StintGame[] = Object.entries(combinedGamesMap)
      .map(([game, data]) => ({
        game,
        hours: data.hours,
        firstPlayedAt: data.firstPlayedAt,
      }))
      .sort(compareStintGames);

    const totalHours = combinedGames.reduce((acc, g) => acc + g.hours, 0);

    stints.push({
      id: `${startDate}_${endDate}_${combinedGames[0]?.game || ""}`,
      startDate,
      endDate,
      dayCount: currentDays.length,
      games: combinedGames,
      totalHours,
    });

    currentDays = [];
  };

  days.forEach((day) => {
    if (currentDays.length === 0) {
      currentDays.push(day);
      return;
    }

    const prevDay = currentDays[currentDays.length - 1];

    // If the primary game is identical and both days have single game or matching games:
    // Keep in same stint
    const samePrimary = day.primaryGame === prevDay.primaryGame;
    const hasMultiple = day.games.length > 1 || prevDay.games.length > 1;

    // If either day has multiple games and they aren't identical game sets, split to avoid muddling stacked cards
    if (hasMultiple) {
      const prevKeys = prevDay.games.map((g) => g.game).sort().join("|");
      const currentKeys = day.games.map((g) => g.game).sort().join("|");
      if (prevKeys === currentKeys) {
        currentDays.push(day);
      } else {
        flushCurrent();
        currentDays.push(day);
      }
    } else if (samePrimary) {
      currentDays.push(day);
    } else {
      flushCurrent();
      currentDays.push(day);
    }
  });

  flushCurrent();

  return stints;
}

export function formatDateLabel(startDate: string, endDate: string): string {
  const parse = (str: string) => {
    const parts = str.split("-");
    const mIdx = parseInt(parts[1] || "1", 10) - 1;
    const day = parseInt(parts[2] || "1", 10);
    const months = [
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
    return { month: months[mIdx] || "", day };
  };

  const start = parse(startDate);
  if (startDate === endDate) {
    return `${start.month} ${start.day}`;
  }

  const end = parse(endDate);
  if (start.month === end.month) {
    return `${start.month} ${start.day} – ${end.day}`;
  }
  return `${start.month} ${start.day} – ${end.month} ${end.day}`;
}

/**
 * Calculates calendar days between the end of prevStint and start of nextStint.
 * Returns the gap count (number of unplayed days strictly between the two stints).
 * For example:
 *   prevEndDate: '2026-10-06', nextStartDate: '2026-10-08' -> 1 day gap (Oct 7)
 *   prevEndDate: '2026-10-04', nextStartDate: '2026-10-05' -> 0 day gap (consecutive)
 */
export function calculateDayGap(prevEndDate: string, nextStartDate: string): number {
  if (!prevEndDate || !nextStartDate) return 0;
  const prevDate = new Date(`${prevEndDate}T00:00:00Z`);
  const nextDate = new Date(`${nextStartDate}T00:00:00Z`);
  const diffTime = nextDate.getTime() - prevDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays - 1);
}

/**
 * Formats the inactive gap span label between two dates.
 * e.g. for prevEndDate '2026-10-06' and nextStartDate '2026-10-08' -> 'Oct 7'
 * for prevEndDate '2026-10-05' and nextStartDate '2026-10-09' -> 'Oct 6 – 8'
 */
export function formatGapDateLabel(prevEndDate: string, nextStartDate: string): string {
  const gap = calculateDayGap(prevEndDate, nextStartDate);
  if (gap <= 0) return "";

  const prev = new Date(`${prevEndDate}T00:00:00Z`);
  const gapStart = new Date(prev.getTime() + 24 * 60 * 60 * 1000);
  const gapEnd = new Date(prev.getTime() + gap * 24 * 60 * 60 * 1000);

  const startIso = gapStart.toISOString().substring(0, 10);
  const endIso = gapEnd.toISOString().substring(0, 10);
  return formatDateLabel(startIso, endIso);
}
