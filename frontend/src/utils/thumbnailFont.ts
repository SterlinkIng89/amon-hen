export interface ThumbnailFontOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
}

export const THUMBNAIL_FONT_CACHE_KEY = "amon_hen_thumbnail_font_family";
export const DEFAULT_THUMBNAIL_FONT = "Montserrat";

export const THUMBNAIL_FONTS: readonly ThumbnailFontOption[] = [
  {
    id: "Montserrat",
    label: "Montserrat (Modern Geometric)",
    family: "Montserrat, sans-serif",
  },
  {
    id: "Nunito",
    label: "Nunito (Rounded)",
    family: "Nunito, sans-serif",
  },
  {
    id: "Rubik",
    label: "Rubik (Modern Gaming)",
    family: "Rubik, sans-serif",
  },
  {
    id: "Poppins",
    label: "Poppins (Clean)",
    family: "Poppins, sans-serif",
  },
  {
    id: "Impact",
    label: "Impact (Classic)",
    family: 'Impact, "Arial Black", sans-serif',
  },
];

export function getCachedThumbnailFont(): string {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return DEFAULT_THUMBNAIL_FONT;
    }
    const cached = window.localStorage.getItem(THUMBNAIL_FONT_CACHE_KEY);
    if (!cached) return DEFAULT_THUMBNAIL_FONT;
    const exists = THUMBNAIL_FONTS.some(
      (f) => f.id.toLowerCase() === cached.toLowerCase()
    );
    return exists ? cached : DEFAULT_THUMBNAIL_FONT;
  } catch {
    return DEFAULT_THUMBNAIL_FONT;
  }
}

export function setCachedThumbnailFont(fontId: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const match = THUMBNAIL_FONTS.find(
      (f) => f.id.toLowerCase() === fontId.toLowerCase()
    );
    const validId = match ? match.id : DEFAULT_THUMBNAIL_FONT;
    window.localStorage.setItem(THUMBNAIL_FONT_CACHE_KEY, validId);
  } catch {
    // Ignore storage quota or access errors in restricted environments
  }
}

export function resolveCanvasFontFamily(fontId?: string): string {
  const targetId = fontId?.trim() || getCachedThumbnailFont();
  const found = THUMBNAIL_FONTS.find(
    (f) => f.id.toLowerCase() === targetId.toLowerCase()
  );
  return found ? found.family : "Montserrat, sans-serif";
}

export async function ensureFontsLoaded(): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts?.ready) {
    return true;
  }
  try {
    await document.fonts.ready;
    return true;
  } catch {
    return false;
  }
}
