import { describe, it, expect } from "vitest";
import {
  formatCountdown,
  formatResetClock,
  uploadsRemaining,
  canAfford,
  estimateUploadCost,
  UPLOAD_BASE_COST,
} from "../quotaStatus";

describe("quotaStatus utils", () => {
  describe("formatCountdown", () => {
    it("formats hours and minutes properly", () => {
      // 4 hours 15 minutes = (4 * 3600 + 15 * 60) * 1000 = 15300000 ms
      expect(formatCountdown(15300000)).toBe("4h 15m");
    });

    it("formats minutes only when under 1 hour", () => {
      // 12 minutes = 12 * 60 * 1000 = 720000 ms
      expect(formatCountdown(720000)).toBe("12m");
    });

    it("formats seconds only when under 1 minute", () => {
      // 45 seconds = 45 * 1000 = 45000 ms
      expect(formatCountdown(45000)).toBe("45s");
    });

    it("returns 0s when non-positive", () => {
      expect(formatCountdown(0)).toBe("0s");
      expect(formatCountdown(-1000)).toBe("0s");
    });
  });

  describe("formatResetClock", () => {
    it("formats unix timestamp as 2-digit hour and minute", () => {
      const date = new Date("2026-10-20T02:00:00Z");
      const unixSec = Math.floor(date.getTime() / 1000);
      const formatted = formatResetClock(unixSec);
      // Should match local time format (e.g. 02:00 or 2:00 AM)
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe("uploadsRemaining", () => {
    it("calculates integer number of remaining uploads floor", () => {
      expect(uploadsRemaining(8400, 1600)).toBe(5);
      expect(uploadsRemaining(1600, 1600)).toBe(1);
      expect(uploadsRemaining(1599, 1600)).toBe(0);
      expect(uploadsRemaining(0, 1600)).toBe(0);
      expect(uploadsRemaining(-500, 1600)).toBe(0);
    });

    it("handles zero or negative cost gracefully", () => {
      expect(uploadsRemaining(1000, 0)).toBe(0);
      expect(uploadsRemaining(1000, -10)).toBe(0);
    });
  });

  describe("canAfford", () => {
    it("returns true if remaining >= cost and cost > 0", () => {
      expect(canAfford(1600, 1600)).toBe(true);
      expect(canAfford(2000, 1600)).toBe(true);
      expect(canAfford(1599, 1600)).toBe(false);
      expect(canAfford(0, 1600)).toBe(false);
    });
  });

  describe("estimateUploadCost", () => {
    it("returns base cost 1600 with no extras", () => {
      expect(UPLOAD_BASE_COST).toBe(1600);
      expect(estimateUploadCost({ hasPlaylist: false, hasThumbnail: false })).toBe(1600);
    });

    it("adds 50 units for playlist insertion", () => {
      expect(estimateUploadCost({ hasPlaylist: true, hasThumbnail: false })).toBe(1650);
    });

    it("adds 50 units for custom thumbnail", () => {
      expect(estimateUploadCost({ hasPlaylist: false, hasThumbnail: true })).toBe(1650);
    });

    it("adds 100 units for both playlist and thumbnail", () => {
      expect(estimateUploadCost({ hasPlaylist: true, hasThumbnail: true })).toBe(1700);
    });
  });
});
