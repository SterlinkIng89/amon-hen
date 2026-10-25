import { describe, it, expect } from "vitest";
import {
  APILogEntry,
  filterLogsByTimeScope,
  computeOperationSummary,
  filterAPILogs,
  formatDayHeader,
  groupLogsWithBursts,
} from "../devLogsUtils";

function makeLog(partial: Partial<APILogEntry> = {}): APILogEntry {
  return {
    id: 1,
    ts: 1729800000,
    operation: "videos.list",
    resourceId: "vid123",
    resourceTitle: "My Epic Gameplay",
    success: true,
    errorMsg: "",
    quotaCost: 1,
    durationMs: 120,
    ...partial,
  };
}

describe("devLogsUtils (#159)", () => {
  describe("filterLogsByTimeScope", () => {
    const resetsAt = 1729843200; // Pacific midnight unix
    const dayStart = resetsAt - 86400;

    const todayLog = makeLog({ id: 1, ts: dayStart + 3600 });
    const boundaryLog = makeLog({ id: 2, ts: dayStart });
    const yesterdayLog = makeLog({ id: 3, ts: dayStart - 10 });
    const futureLog = makeLog({ id: 4, ts: resetsAt + 10 });

    const allLogs = [todayLog, boundaryLog, yesterdayLog, futureLog];

    it("returns all logs when scope is 'all'", () => {
      const result = filterLogsByTimeScope(allLogs, "all", resetsAt);
      expect(result).toHaveLength(4);
    });

    it("returns all logs if resetsAt <= 0", () => {
      const result = filterLogsByTimeScope(allLogs, "today", 0);
      expect(result).toHaveLength(4);
    });

    it("returns only logs within [resetsAt - 86400, resetsAt) when scope is 'today'", () => {
      const result = filterLogsByTimeScope(allLogs, "today", resetsAt);
      expect(result.map((l) => l.id)).toEqual([1, 2]);
    });
  });

  describe("computeOperationSummary", () => {
    it("accumulates cost only for successful logs and increments errors for failed calls", () => {
      const logs: APILogEntry[] = [
        makeLog({ id: 1, operation: "videos.insert", quotaCost: 1600, success: true }),
        makeLog({ id: 2, operation: "videos.insert", quotaCost: 1600, success: false, errorMsg: "Quota exceeded" }),
        makeLog({ id: 3, operation: "videos.list", quotaCost: 1, success: true }),
        makeLog({ id: 4, operation: "videos.list", quotaCost: 1, success: true }),
        makeLog({ id: 5, operation: "thumbnails.set", quotaCost: 50, success: true }),
      ];

      const summary = computeOperationSummary(logs);

      expect(summary).toEqual([
        { operation: "videos.insert", count: 2, cost: 1600, errors: 1 },
        { operation: "thumbnails.set", count: 1, cost: 50, errors: 0 },
        { operation: "videos.list", count: 2, cost: 2, errors: 0 },
      ]);
    });

    it("sorts by cost descending, then count descending", () => {
      const logs: APILogEntry[] = [
        makeLog({ id: 1, operation: "playlists.list", quotaCost: 1, success: true }),
        makeLog({ id: 2, operation: "channels.list", quotaCost: 1, success: true }),
        makeLog({ id: 3, operation: "channels.list", quotaCost: 1, success: true }),
      ];

      const summary = computeOperationSummary(logs);
      expect(summary[0].operation).toBe("channels.list");
      expect(summary[1].operation).toBe("playlists.list");
    });
  });

  describe("filterAPILogs", () => {
    const logs: APILogEntry[] = [
      makeLog({ id: 1, operation: "videos.insert", quotaCost: 1600, success: true, resourceTitle: "Episode 1" }),
      makeLog({ id: 2, operation: "videos.update", quotaCost: 50, success: true, resourceTitle: "Episode 2" }),
      makeLog({ id: 3, operation: "videos.list", quotaCost: 1, success: true, resourceTitle: "Listing" }),
      makeLog({ id: 4, operation: "playlistItems.insert", quotaCost: 50, success: false, errorMsg: "Forbidden 403" }),
    ];

    it("filters by tier 'writes' (quotaCost >= 50)", () => {
      const res = filterAPILogs(logs, { tier: "writes", selectedOp: null, searchQuery: "" });
      expect(res.map((l) => l.id)).toEqual([1, 2, 4]);
    });

    it("filters by tier 'reads' (0 < quotaCost < 50)", () => {
      const res = filterAPILogs(logs, { tier: "reads", selectedOp: null, searchQuery: "" });
      expect(res.map((l) => l.id)).toEqual([3]);
    });

    it("filters by tier 'errors' (!success)", () => {
      const res = filterAPILogs(logs, { tier: "errors", selectedOp: null, searchQuery: "" });
      expect(res.map((l) => l.id)).toEqual([4]);
    });

    it("filters by exact selectedOp", () => {
      const res = filterAPILogs(logs, { tier: "all", selectedOp: "videos.update", searchQuery: "" });
      expect(res.map((l) => l.id)).toEqual([2]);
    });

    it("filters by case-insensitive searchQuery across title and error message", () => {
      const resTitle = filterAPILogs(logs, { tier: "all", selectedOp: null, searchQuery: "episode 1" });
      expect(resTitle.map((l) => l.id)).toEqual([1]);

      const resError = filterAPILogs(logs, { tier: "all", selectedOp: null, searchQuery: "forbidden" });
      expect(resError.map((l) => l.id)).toEqual([4]);
    });
  });

  describe("formatDayHeader", () => {
    it("returns formatted dayKey and dayLabel for today, yesterday, and older dates", () => {
      const refDate = new Date("2026-10-24T12:00:00Z");
      const refNowMs = refDate.getTime();

      const todayUnix = Math.floor(refNowMs / 1000);
      const todayHeader = formatDayHeader(todayUnix, refNowMs);
      expect(todayHeader.dayLabel).toMatch(/^Today - /);

      const yesterdayUnix = todayUnix - 86400;
      const yesterdayHeader = formatDayHeader(yesterdayUnix, refNowMs);
      expect(yesterdayHeader.dayLabel).toMatch(/^Yesterday - /);

      const olderUnix = todayUnix - 86400 * 5;
      const olderHeader = formatDayHeader(olderUnix, refNowMs);
      expect(olderHeader.dayLabel).not.toMatch(/Today|Yesterday/);
      expect(olderHeader.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("groupLogsWithBursts", () => {
    it("returns single items if groupBursts is false", () => {
      const logs = [
        makeLog({ id: 1, ts: 100, quotaCost: 1, success: true }),
        makeLog({ id: 2, ts: 102, quotaCost: 1, success: true }),
        makeLog({ id: 3, ts: 104, quotaCost: 1, success: true }),
      ];

      const res = groupLogsWithBursts(logs, false);
      expect(res).toHaveLength(3);
      expect(res.every((r) => r.kind === "single")).toBe(true);
    });

    it("collapses runs of 3 or more consecutive 1-unit successful reads within maxGapSeconds into a burst", () => {
      const baseTs = 1729800000;
      const logs = [
        makeLog({ id: 1, ts: baseTs, operation: "videos.list", quotaCost: 1, durationMs: 50, success: true }),
        makeLog({ id: 2, ts: baseTs + 2, operation: "videos.list", quotaCost: 1, durationMs: 60, success: true }),
        makeLog({ id: 3, ts: baseTs + 5, operation: "playlistItems.list", quotaCost: 1, durationMs: 40, success: true }),
        makeLog({ id: 4, ts: baseTs + 60, operation: "videos.insert", quotaCost: 1600, durationMs: 500, success: true }),
      ];

      const res = groupLogsWithBursts(logs, true);
      expect(res).toHaveLength(2);
      expect(res[0].kind).toBe("burst");
      if (res[0].kind === "burst") {
        expect(res[0].logs).toHaveLength(3);
        expect(res[0].totalCost).toBe(3);
        expect(res[0].totalDurationMs).toBe(150);
        expect(res[0].opCounts).toEqual({
          "videos.list": 2,
          "playlistItems.list": 1,
        });
      }
      expect(res[1].kind).toBe("single");
    });

    it("does not group runs of fewer than 3 items", () => {
      const baseTs = 1729800000;
      const logs = [
        makeLog({ id: 1, ts: baseTs, quotaCost: 1, success: true }),
        makeLog({ id: 2, ts: baseTs + 2, quotaCost: 1, success: true }),
      ];

      const res = groupLogsWithBursts(logs, true);
      expect(res).toHaveLength(2);
      expect(res.every((r) => r.kind === "single")).toBe(true);
    });

    it("does not group failed calls or calls with cost > 1", () => {
      const baseTs = 1729800000;
      const logs = [
        makeLog({ id: 1, ts: baseTs, quotaCost: 1, success: true }),
        makeLog({ id: 2, ts: baseTs + 1, quotaCost: 1, success: false }),
        makeLog({ id: 3, ts: baseTs + 2, quotaCost: 1, success: true }),
        makeLog({ id: 4, ts: baseTs + 3, quotaCost: 50, success: true }),
      ];

      const res = groupLogsWithBursts(logs, true);
      expect(res).toHaveLength(4);
      expect(res.every((r) => r.kind === "single")).toBe(true);
    });
  });
});
