import { extractTitleDate } from "./videoUtils";
import {
  HistoricalVideo,
  extractGameName,
  parseDurationToHours,
} from "./gameStats";

export interface StintGame {
  readonly game: string;
  readonly hours: number;
}

export interface GameStint {
  readonly id: string;
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string; // YYYY-MM-DD
  readonly dayCount: number; // Number of days in the span or played
  readonly games: readonly StintGame[]; // Sorted descending by hours (primary game first)
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
 * 5. Days with multiple games have their games grouped together in `games` list, sorted by playtime.
 */
export function buildMonthStints(
  videos: readonly HistoricalVideo[],
  monthKey: string, // "YYYY-MM"
): readonly GameStint[] {
  if (!videos || videos.length === 0 || !monthKey) {
    return [];
  }

  // 1. Group daily activity for this month
  const dailyGameHours: Record<string, Record<string, number>> = {};

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

    if (!dailyGameHours[pubDate]) {
      dailyGameHours[pubDate] = {};
    }
    dailyGameHours[pubDate][game] =
      (dailyGameHours[pubDate][game] || 0) + hours;
  });

  // 2. Sort active dates ascending
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
      .map(([game, hours]) => ({ game, hours }))
      .sort((a, b) => b.hours - a.hours);

    const totalHours = games.reduce((acc, g) => acc + g.hours, 0);
    const primaryGame = games[0]?.game || "";

    return {
      date,
      games,
      primaryGame,
      totalHours,
    };
  });

  // 3. Cluster days into stints:
  // A stint continues across consecutive active days if the primary game is the same
  // AND the set of games matches or can be reasonably combined into the current stint.
  // When a day with a different primary game appears, start a new stint.
  const stints: GameStint[] = [];
  let currentDays: DaySummary[] = [];

  const flushCurrent = () => {
    if (currentDays.length === 0) return;

    const startDate = currentDays[0].date;
    const endDate = currentDays[currentDays.length - 1].date;

    // Aggregate all games played during this stint
    const combinedGamesMap: Record<string, number> = {};
    currentDays.forEach((d) => {
      d.games.forEach((g) => {
        combinedGamesMap[g.game] =
          (combinedGamesMap[g.game] || 0) + g.hours;
      });
    });

    const combinedGames: StintGame[] = Object.entries(combinedGamesMap)
      .map(([game, hours]) => ({ game, hours }))
      .sort((a, b) => b.hours - a.hours);

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
