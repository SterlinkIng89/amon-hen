export interface APILogEntry {
  readonly id: number;
  readonly ts: number;
  readonly operation: string;
  readonly resourceId: string;
  readonly resourceTitle: string;
  readonly success: boolean;
  readonly errorMsg: string;
  readonly quotaCost: number;
  readonly durationMs: number;
}

export type LogTimeScope = "today" | "all";
export type LogFilterTier = "all" | "writes" | "reads" | "errors";

export interface OperationSummaryItem {
  readonly operation: string;
  readonly count: number;
  readonly cost: number;
  readonly errors: number;
}

export interface FilterAPILogsOptions {
  readonly tier: LogFilterTier;
  readonly selectedOp: string | null;
  readonly searchQuery: string;
}

export interface SingleLogDisplayItem {
  readonly kind: "single";
  readonly log: APILogEntry;
  readonly dayKey: string;
  readonly dayLabel: string;
}

export interface SyncBurstDisplayItem {
  readonly kind: "burst";
  readonly id: string;
  readonly logs: readonly APILogEntry[];
  readonly startTs: number;
  readonly endTs: number;
  readonly totalCost: number;
  readonly totalDurationMs: number;
  readonly opCounts: Readonly<Record<string, number>>;
  readonly dayKey: string;
  readonly dayLabel: string;
}

export type LogDisplayItem = SingleLogDisplayItem | SyncBurstDisplayItem;

/**
 * Filters logs based on whether they fall within the active Pacific quota day [resetsAt - 86400, resetsAt).
 * If scope is "all" or resetsAtUnix is non-positive, returns all logs.
 */
export function filterLogsByTimeScope(
  logs: readonly APILogEntry[],
  scope: LogTimeScope,
  resetsAtUnix: number,
): APILogEntry[] {
  if (scope === "all" || resetsAtUnix <= 0) {
    return [...logs];
  }
  const dayStart = resetsAtUnix - 86400;
  return logs.filter((l) => l.ts >= dayStart && l.ts < resetsAtUnix);
}

/**
 * Computes call counts, total quota cost (successful calls only), and error count per operation,
 * sorted descending by cost, then descending by call count.
 */
export function computeOperationSummary(
  logs: readonly APILogEntry[],
): OperationSummaryItem[] {
  const map = new Map<string, { count: number; cost: number; errors: number }>();

  for (const log of logs) {
    const existing = map.get(log.operation) ?? { count: 0, cost: 0, errors: 0 };
    map.set(log.operation, {
      count: existing.count + 1,
      cost: existing.cost + (log.success ? log.quotaCost : 0),
      errors: existing.errors + (log.success ? 0 : 1),
    });
  }

  const items: OperationSummaryItem[] = Array.from(map.entries()).map(
    ([op, data]) => ({
      operation: op,
      count: data.count,
      cost: data.cost,
      errors: data.errors,
    }),
  );

  return items.sort((a, b) => b.cost - a.cost || b.count - a.count);
}

/**
 * Filters logs by cost tier ("writes", "reads", "errors"), specific operation, and keyword search.
 */
export function filterAPILogs(
  logs: readonly APILogEntry[],
  options: FilterAPILogsOptions,
): APILogEntry[] {
  const { tier, selectedOp, searchQuery } = options;
  const q = searchQuery.trim().toLowerCase();

  return logs.filter((log) => {
    if (tier === "writes" && log.quotaCost < 50) {
      return false;
    }
    if (tier === "reads" && (log.quotaCost <= 0 || log.quotaCost >= 50)) {
      return false;
    }
    if (tier === "errors" && log.success) {
      return false;
    }

    if (selectedOp && log.operation !== selectedOp) {
      return false;
    }

    if (q) {
      const matchOp = log.operation.toLowerCase().includes(q);
      const matchTitle = (log.resourceTitle || "").toLowerCase().includes(q);
      const matchId = (log.resourceId || "").toLowerCase().includes(q);
      const matchError = (log.errorMsg || "").toLowerCase().includes(q);
      if (!matchOp && !matchTitle && !matchId && !matchError) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Formats a unix timestamp into a dayKey ("YYYY-MM-DD") and human-readable dayLabel.
 */
export function formatDayHeader(
  tsUnix: number,
  nowMs: number = Date.now(),
): { readonly dayKey: string; readonly dayLabel: string } {
  const d = new Date(tsUnix * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dayKey = `${year}-${month}-${day}`;

  const nowDate = new Date(nowMs);
  const nowYear = nowDate.getFullYear();
  const nowMonth = String(nowDate.getMonth() + 1).padStart(2, "0");
  const nowDay = String(nowDate.getDate()).padStart(2, "0");
  const todayKey = `${nowYear}-${nowMonth}-${nowDay}`;

  const yesterdayDate = new Date(nowMs - 86400000);
  const yYear = yesterdayDate.getFullYear();
  const yMonth = String(yesterdayDate.getMonth() + 1).padStart(2, "0");
  const yDay = String(yesterdayDate.getDate()).padStart(2, "0");
  const yesterdayKey = `${yYear}-${yMonth}-${yDay}`;

  const shortMonth = d.toLocaleDateString("en-US", { month: "short" });
  const dayNum = d.getDate();

  if (dayKey === todayKey) {
    return { dayKey, dayLabel: `Today - ${shortMonth} ${dayNum}` };
  }
  if (dayKey === yesterdayKey) {
    return { dayKey, dayLabel: `Yesterday - ${shortMonth} ${dayNum}` };
  }
  return { dayKey, dayLabel: `${shortMonth} ${dayNum}, ${year}` };
}

/**
 * Collapses runs of 3 or more consecutive successful 1-unit read calls within maxGapSeconds
 * on the same day into a SyncBurstDisplayItem.
 */
export function groupLogsWithBursts(
  logs: readonly APILogEntry[],
  groupBursts: boolean,
  nowMs: number = Date.now(),
  maxGapSeconds: number = 10,
): LogDisplayItem[] {
  if (!groupBursts) {
    return logs.map((log) => {
      const { dayKey, dayLabel } = formatDayHeader(log.ts, nowMs);
      return { kind: "single", log, dayKey, dayLabel };
    });
  }

  const result: LogDisplayItem[] = [];
  let i = 0;

  while (i < logs.length) {
    const current = logs[i];
    const canBurst = current.success && current.quotaCost === 1;

    if (!canBurst) {
      const { dayKey, dayLabel } = formatDayHeader(current.ts, nowMs);
      result.push({ kind: "single", log: current, dayKey, dayLabel });
      i++;
      continue;
    }

    const run: APILogEntry[] = [current];
    let j = i + 1;
    const currentDayKey = formatDayHeader(current.ts, nowMs).dayKey;

    while (j < logs.length) {
      const next = logs[j];
      const nextDayKey = formatDayHeader(next.ts, nowMs).dayKey;
      const isCandidate =
        next.success &&
        next.quotaCost === 1 &&
        nextDayKey === currentDayKey &&
        Math.abs(logs[j - 1].ts - next.ts) <= maxGapSeconds;

      if (!isCandidate) {
        break;
      }
      run.push(next);
      j++;
    }

    if (run.length >= 3) {
      const timestamps = run.map((l) => l.ts);
      const startTs = Math.min(...timestamps);
      const endTs = Math.max(...timestamps);
      const totalCost = run.reduce((acc, l) => acc + l.quotaCost, 0);
      const totalDurationMs = run.reduce((acc, l) => acc + l.durationMs, 0);
      const opCounts: Record<string, number> = {};
      for (const l of run) {
        opCounts[l.operation] = (opCounts[l.operation] || 0) + 1;
      }
      const { dayKey, dayLabel } = formatDayHeader(run[0].ts, nowMs);

      result.push({
        kind: "burst",
        id: `burst-${run[0].id}-${run[run.length - 1].id}`,
        logs: run,
        startTs,
        endTs,
        totalCost,
        totalDurationMs,
        opCounts,
        dayKey,
        dayLabel,
      });
      i = j;
    } else {
      const { dayKey, dayLabel } = formatDayHeader(current.ts, nowMs);
      result.push({ kind: "single", log: current, dayKey, dayLabel });
      i++;
    }
  }

  return result;
}

export const DEV_LOG_OP_COLORS: Readonly<Record<string, string>> = {
  "videos.insert": "#f97316",
  "videos.update": "#eab308",
  "playlists.insert": "#eab308",
  "playlistItems.insert": "#eab308",
  "thumbnails.set": "#eab308",
  "playlistImages.insert": "#eab308",
  "channels.list": "#22d3ee",
  "videos.list": "#22d3ee",
  "playlists.list": "#22d3ee",
  "playlistItems.list": "#22d3ee",
};

export function opColor(op: string): string {
  return DEV_LOG_OP_COLORS[op] ?? "#94a3b8";
}

export function durationColor(durationMs: number): string {
  if (durationMs >= 2000) return "#f97316";
  if (durationMs >= 800) return "#eab308";
  return "#64748b";
}

