import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_THUMBNAIL_FONT,
  THUMBNAIL_FONT_CACHE_KEY,
  THUMBNAIL_FONTS,
  getCachedThumbnailFont,
  setCachedThumbnailFont,
  resolveCanvasFontFamily,
} from "../thumbnailFont";

describe("thumbnailFont utility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default font when cache is empty", () => {
    expect(getCachedThumbnailFont()).toBe(DEFAULT_THUMBNAIL_FONT);
  });

  it("stores and retrieves selected font from localStorage cache", () => {
    setCachedThumbnailFont("Nunito");
    expect(localStorage.getItem(THUMBNAIL_FONT_CACHE_KEY)).toBe("Nunito");
    expect(getCachedThumbnailFont()).toBe("Nunito");
  });

  it("normalizes invalid or unknown fonts to default font", () => {
    localStorage.setItem(THUMBNAIL_FONT_CACHE_KEY, "ComicSansNotReal");
    expect(getCachedThumbnailFont()).toBe(DEFAULT_THUMBNAIL_FONT);
  });

  it("resolves canvas font family for known fonts", () => {
    expect(resolveCanvasFontFamily("Nunito")).toBe("Nunito, sans-serif");
    expect(resolveCanvasFontFamily("Rubik")).toBe("Rubik, sans-serif");
    expect(resolveCanvasFontFamily("Impact")).toBe('Impact, "Arial Black", sans-serif');
    expect(resolveCanvasFontFamily("Montserrat")).toBe("Montserrat, sans-serif");
    expect(resolveCanvasFontFamily("Poppins")).toBe("Poppins, sans-serif");
  });

  it("resolves to cached font when fontId is undefined or empty", () => {
    setCachedThumbnailFont("Rubik");
    expect(resolveCanvasFontFamily(undefined)).toBe("Rubik, sans-serif");
    expect(resolveCanvasFontFamily("")).toBe("Rubik, sans-serif");
  });

  it("handles case-insensitive font IDs", () => {
    expect(resolveCanvasFontFamily("nunito")).toBe("Nunito, sans-serif");
    expect(resolveCanvasFontFamily("IMPACT")).toBe('Impact, "Arial Black", sans-serif');
  });

  it("lists all required font choices", () => {
    const ids = THUMBNAIL_FONTS.map((f) => f.id);
    expect(ids).toContain("Montserrat");
    expect(ids).toContain("Nunito");
    expect(ids).toContain("Rubik");
    expect(ids).toContain("Poppins");
    expect(ids).toContain("Impact");
  });
});
