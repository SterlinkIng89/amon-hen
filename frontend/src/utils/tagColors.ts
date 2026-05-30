/**
 * Deterministic, session-persistent tag color generator.
 *
 * Same tag name → always same color (hash-based, no storage needed).
 * Colors are tuned for readability on dark backgrounds:
 *   - Saturation: 55–72 %  (vivid but not neon)
 *   - Lightness:  62–70 %  (bright enough to read, not washed out)
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

export function getTagColor(tag: string): string {
  if (!tag || tag.trim().length === 0) return "";

  const hash = djb2(tag.toLowerCase().trim());

  // Map to full hue wheel
  let hue = hash % 360;

  // Rotate hues in the accent-orange zone (15–45°) to avoid confusion
  if (hue >= 15 && hue <= 45) {
    hue = (hue + 120) % 360;
  }

  // Derive saturation and lightness within readable bands using hash bits
  const saturation = 55 + ((hash >> 4) % 18);  // 55–72 %
  const lightness  = 62 + ((hash >> 8) % 9);   // 62–70 %

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
