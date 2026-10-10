/**
 * Deterministic, session-persistent tag color generator.
 *
 * Same tag name → always same color (hash-based, no storage needed).
 * Colors are tuned for readability on dark backgrounds:
 * - Saturation: 55–72 % (vivid but not neon)
 * - Lightness: 62–70 % (bright enough to read, not washed out)
 * Hues close to the accent orange (15–40°) are rotated away so game
 * tags don't clash with the app's own accent color.
 */

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // <<5 + hash is equivalent to hash * 33
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function getTagColor(tag: string): string {
  if (!tag || tag.trim().length === 0) return "";

  const hash = djb2(tag.toLowerCase().trim());
  const mixed = fmix32(hash);

  // Map [0, 2^32) uniformly across 360° hue circle
  let hue = Math.floor((mixed / 4294967296) * 360);

  // Rotate hues in the accent-orange zone (15–42°) to avoid confusion with app accent
  if (hue >= 15 && hue <= 42) {
    hue = (hue + 120) % 360;
  }

  // Calibrated saturation & lightness: vivid and punchy, never neon/blinding.
  // Green/yellow hues (75°–165°) have higher perceived human luminance, so we gently dampen their saturation.
  const isGreenZone = hue >= 75 && hue <= 165;
  const saturation = isGreenZone ? 54 + ((mixed >>> 4) % 8) : 62 + ((mixed >>> 4) % 10);
  const lightness = isGreenZone ? 48 + ((mixed >>> 8) % 6) : 52 + ((mixed >>> 8) % 6);

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export const DEFAULT_GAME_COLOR = "#64748b"; // Slate-500 fallback

export function getGameColor(game: string): string {
  if (!game || game.trim().length === 0) return DEFAULT_GAME_COLOR;
  return getTagColor(game) || DEFAULT_GAME_COLOR;
}
