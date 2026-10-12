import { describe, it, expect } from "vitest";
import {
  formatEpisodeBadgeText,
  calculateBadgePosition,
  resolveThumbnailImageUrl,
  ThumbnailGeneratorOptions,
} from "../thumbnailGenerator";

describe("thumbnailGenerator utils", () => {
  describe("resolveThumbnailImageUrl", () => {
    it("returns custom image path when source is custom", () => {
      const url = resolveThumbnailImageUrl("custom", "/path/to/custom.png");
      expect(url).toBe("/path/to/custom.png");
    });

    it("resolves steam header, hero, or poster correctly", () => {
      const steamAssets = {
        headerUrl: "https://steam.com/header.jpg",
        heroUrl: "https://steam.com/hero.jpg",
        posterUrl: "https://steam.com/poster.jpg",
      };
      expect(resolveThumbnailImageUrl("steam", undefined, "header", steamAssets)).toBe(
        "https://steam.com/header.jpg"
      );
      expect(resolveThumbnailImageUrl("steam", undefined, "hero", steamAssets)).toBe(
        "https://steam.com/hero.jpg"
      );
      expect(resolveThumbnailImageUrl("steam", undefined, "poster", steamAssets)).toBe(
        "https://steam.com/poster.jpg"
      );
    });

    it("returns empty string when no assets or custom path provided", () => {
      expect(resolveThumbnailImageUrl("steam", undefined, "header", null)).toBe("");
      expect(resolveThumbnailImageUrl("custom", undefined)).toBe("");
    });
  });
  describe("formatEpisodeBadgeText", () => {
    it("formats hash format as #NN with double digits", () => {
      expect(formatEpisodeBadgeText(1, "hash")).toBe("#01");
      expect(formatEpisodeBadgeText(42, "hash")).toBe("#42");
    });

    it("formats ep format as EP NN with double digits", () => {
      expect(formatEpisodeBadgeText(1, "ep")).toBe("EP 01");
      expect(formatEpisodeBadgeText(10, "ep")).toBe("EP 10");
    });

    it("formats number format as double digits", () => {
      expect(formatEpisodeBadgeText(1, "number")).toBe("01");
      expect(formatEpisodeBadgeText(99, "number")).toBe("99");
    });

    it("formats pad2 format with leading zero for single digits", () => {
      expect(formatEpisodeBadgeText(1, "pad2")).toBe("01");
      expect(formatEpisodeBadgeText(9, "pad2")).toBe("09");
      expect(formatEpisodeBadgeText(10, "pad2")).toBe("10");
      expect(formatEpisodeBadgeText(100, "pad2")).toBe("100");
    });
  });

  describe("calculateBadgePosition", () => {
    const canvasWidth = 1280;
    const canvasHeight = 720;
    const badgeWidth = 140;
    const badgeHeight = 60;
    const margin = 40;

    it("calculates top-left coordinates correctly", () => {
      const pos = calculateBadgePosition(
        "top-left",
        canvasWidth,
        canvasHeight,
        badgeWidth,
        badgeHeight,
        margin
      );
      expect(pos).toEqual({ x: 40, y: 40 });
    });

    it("calculates top-right coordinates correctly", () => {
      const pos = calculateBadgePosition(
        "top-right",
        canvasWidth,
        canvasHeight,
        badgeWidth,
        badgeHeight,
        margin
      );
      expect(pos).toEqual({ x: 1280 - 140 - 40, y: 40 });
    });

    it("calculates bottom-left coordinates correctly", () => {
      const pos = calculateBadgePosition(
        "bottom-left",
        canvasWidth,
        canvasHeight,
        badgeWidth,
        badgeHeight,
        margin
      );
      expect(pos).toEqual({ x: 40, y: 720 - 60 - 40 });
    });

    it("calculates bottom-right coordinates correctly", () => {
      const pos = calculateBadgePosition(
        "bottom-right",
        canvasWidth,
        canvasHeight,
        badgeWidth,
        badgeHeight,
        margin
      );
      expect(pos).toEqual({ x: 1280 - 140 - 40, y: 720 - 60 - 40 });
    });
  });
});
