import { describe, it, expect } from "vitest";
import { getTagColor, getGameColor, getTagBadgeStyle, DEFAULT_GAME_COLOR } from "../tagColors";

describe("tagColors and getGameColor utils", () => {
  it("returns deterministic HSL color for any string", () => {
    const color1 = getTagColor("Core Keeper");
    const color2 = getTagColor("Core Keeper");
    expect(color1).toBe(color2);
    expect(color1).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
  });

  it("getGameColor matches getTagColor for non-empty games", () => {
    const game = "Metaphor: ReFantazio";
    expect(getGameColor(game)).toBe(getTagColor(game));
  });

  it("normalizes case and leading/trailing whitespace", () => {
    const standard = getGameColor("Elden Ring");
    const lowerWithSpaces = getGameColor("  elden ring  ");
    expect(lowerWithSpaces).toBe(standard);
  });

  it("falls back to DEFAULT_GAME_COLOR for empty or whitespace-only game names", () => {
    expect(getGameColor("")).toBe(DEFAULT_GAME_COLOR);
    expect(getGameColor("   ")).toBe(DEFAULT_GAME_COLOR);
  });

  it("produces distinct colors for different games", () => {
    const colorA = getGameColor("Silksong");
    const colorB = getGameColor("Hollow Knight");
    expect(colorA).not.toBe(colorB);
  });

  it("getTagBadgeStyle produces matching color, background, and border tokens", () => {
    const style = getTagBadgeStyle("Hades II");
    const color = getGameColor("Hades II");
    expect(style.color).toBe(color);
    expect(style.backgroundColor).toBe(`color-mix(in srgb, ${color} 12%, transparent)`);
    expect(style.borderColor).toBe(`color-mix(in srgb, ${color} 25%, transparent)`);
  });
});

