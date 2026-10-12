import { describe, it, expect } from "vitest";
import {
  formatEpisodeBadgeText,
  calculateBadgePosition,
  resolveThumbnailImageUrl,
  ThumbnailGeneratorOptions,
  clampFraming,
  resolveCoverCrop,
  panFraming,
  clampLayout,
  pointerToCanvasPoint,
  hitTestElements,
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

  describe("framing geometry helpers", () => {
    it("clampFraming restricts offsets to 0..1 and zoom to 1..3", () => {
      expect(clampFraming({ offset_x: -0.5, offset_y: 1.5, zoom: 0.5 })).toEqual({
        offset_x: 0,
        offset_y: 1,
        zoom: 1,
      });
      expect(clampFraming({ offset_x: 0.2, offset_y: 0.8, zoom: 4 })).toEqual({
        offset_x: 0.2,
        offset_y: 0.8,
        zoom: 3,
      });
    });

    it("resolveCoverCrop matches legacy centered crop at default framing", () => {
      // 1000x1000 image onto 1280x720 canvas
      // canvasAspect = 16/9 ≈ 1.7777777778
      // imgAspect = 1 < 1.77778 => srcW = 1000, srcH = 1000 / (16/9) = 562.5, srcY = (1000 - 562.5)/2 = 218.75
      const crop = resolveCoverCrop(1000, 1000, 1280, 720);
      expect(crop.sw).toBeCloseTo(1000);
      expect(crop.sh).toBeCloseTo(562.5);
      expect(crop.sx).toBeCloseTo(0);
      expect(crop.sy).toBeCloseTo(218.75);
    });

    it("resolveCoverCrop shifts crop according to offset_x and offset_y", () => {
      // Tall image: offset_y = 0 pins to top (sy = 0)
      const topCrop = resolveCoverCrop(1000, 1000, 1280, 720, { offset_x: 0.5, offset_y: 0, zoom: 1 });
      expect(topCrop.sy).toBeCloseTo(0);

      // offset_y = 1 pins to bottom (sy = 1000 - 562.5 = 437.5)
      const bottomCrop = resolveCoverCrop(1000, 1000, 1280, 720, { offset_x: 0.5, offset_y: 1, zoom: 1 });
      expect(bottomCrop.sy).toBeCloseTo(437.5);

      // Wide image: 2000x500 onto 1280x720
      // canvasAspect = 1.7778. imgAspect = 4. srcH = 500, srcW = 500 * (16/9) = 888.8888
      // offset_x = 0 pins left (sx = 0), offset_x = 1 pins right (sx = 2000 - 888.8888 = 1111.1111)
      const leftCrop = resolveCoverCrop(2000, 500, 1280, 720, { offset_x: 0, offset_y: 0.5, zoom: 1 });
      expect(leftCrop.sx).toBeCloseTo(0);
      const rightCrop = resolveCoverCrop(2000, 500, 1280, 720, { offset_x: 1, offset_y: 0.5, zoom: 1 });
      expect(rightCrop.sx).toBeCloseTo(2000 - 500 * (1280 / 720));
    });

    it("resolveCoverCrop scales window with zoom and stays within bounds", () => {
      // Zoom = 2 reduces crop window to half
      const zoomCrop = resolveCoverCrop(1000, 1000, 1280, 720, { offset_x: 0.5, offset_y: 0.5, zoom: 2 });
      expect(zoomCrop.sw).toBeCloseTo(500);
      expect(zoomCrop.sh).toBeCloseTo(281.25);
      expect(zoomCrop.sx).toBeGreaterThanOrEqual(0);
      expect(zoomCrop.sx + zoomCrop.sw).toBeLessThanOrEqual(1000.01);
      expect(zoomCrop.sy).toBeGreaterThanOrEqual(0);
      expect(zoomCrop.sy + zoomCrop.sh).toBeLessThanOrEqual(1000.01);
    });

    it("panFraming shifts offset opposite to drag direction so image follows cursor", () => {
      const initial = { offset_x: 0.5, offset_y: 0.5, zoom: 1 };
      // Dragging right (+dx) moves the image right, which means viewing earlier part of image (-sx) -> decreases offset_x
      const pannedRight = panFraming(initial, 100, 0, 2000, 500, 1280, 720);
      expect(pannedRight.offset_x).toBeLessThan(0.5);

      // Dragging down (+dy) moves image down, decreases offset_y
      const pannedDown = panFraming(initial, 0, 100, 1000, 1000, 1280, 720);
      expect(pannedDown.offset_y).toBeLessThan(0.5);
    });
  });

  describe("element layout helpers", () => {
    it("clampLayout keeps x,y between 0..1 and scale between 0.25..3", () => {
      expect(clampLayout({ x: -0.2, y: 1.5, scale: 0.1 })).toEqual({
        x: 0,
        y: 1,
        scale: 0.25,
      });
      expect(clampLayout({ x: 0.5, y: 0.5, scale: 5 })).toEqual({
        x: 0.5,
        y: 0.5,
        scale: 3,
      });
    });

    it("pointerToCanvasPoint scales DOM bounding rect to canvas space", () => {
      const rect = {
        left: 100,
        top: 50,
        width: 180,
        height: 101.25,
      } as DOMRect;
      const pt = pointerToCanvasPoint(190, 100.625, rect, 1280, 720);
      expect(pt.x).toBeCloseTo(640);
      expect(pt.y).toBeCloseTo(360);
    });

    it("hitTestElements hits topmost element and returns null on empty area", () => {
      const rects = {
        episode: { x: 100, y: 100, w: 200, h: 100 },
        logo: { x: 250, y: 150, w: 200, h: 100 },
        title: { x: 200, y: 120, w: 100, h: 50 },
      };
      // Point inside episode only
      expect(hitTestElements(rects, 110, 110)).toBe("episode");
      // Point inside overlap between title and episode -> title is topmost
      expect(hitTestElements(rects, 220, 130)).toBe("title");
      // Point inside logo
      expect(hitTestElements(rects, 400, 200)).toBe("logo");
      // Outside
      expect(hitTestElements(rects, 10, 10)).toBeNull();
    });
  });
});

