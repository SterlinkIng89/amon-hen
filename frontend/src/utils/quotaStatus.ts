export interface QuotaStatus {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetsAt: number; // unix timestamp in seconds
}

export const UPLOAD_BASE_COST = 1600;
export const PLAYLIST_INSERT_COST = 50;
export const THUMBNAIL_SET_COST = 50;

/**
 * Formats milliseconds remaining into a concise human-readable duration,
 * e.g. "4h 15m", "12m", "45s", or "0s" when expired.
 */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) {
    return "0s";
  }

  const totalSec = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Formats a unix timestamp in seconds into the user's local 12/24-hour clock time,
 * e.g. "02:00 AM" or "02:00".
 */
export function formatResetClock(resetsAtUnix: number): string {
  const d = new Date(resetsAtUnix * 1000);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Calculates how many full uploads can be performed given the remaining units and per-upload cost.
 */
export function uploadsRemaining(remaining: number, costPerUpload: number): number {
  if (costPerUpload <= 0 || remaining <= 0) {
    return 0;
  }
  return Math.floor(remaining / costPerUpload);
}

/**
 * Checks if the remaining quota is enough to perform an operation of given cost.
 */
export function canAfford(remaining: number, cost: number): boolean {
  if (cost <= 0) {
    return true;
  }
  return remaining >= cost;
}

export interface UploadCostOptions {
  readonly hasPlaylist?: boolean;
  readonly hasThumbnail?: boolean;
}

/**
 * Estimates the quota units required for an upload based on optional playlist and thumbnail operations.
 */
export function estimateUploadCost(opts: UploadCostOptions): number {
  let cost = UPLOAD_BASE_COST;
  if (opts.hasPlaylist) {
    cost += PLAYLIST_INSERT_COST;
  }
  if (opts.hasThumbnail) {
    cost += THUMBNAIL_SET_COST;
  }
  return cost;
}
