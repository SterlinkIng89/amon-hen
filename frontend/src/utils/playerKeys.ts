export const PLAYBACK_SPEEDS = [0.5, 1, 1.25, 1.5, 2, 4] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export type PlayerKeyAction =
  | { readonly type: "seek"; readonly delta: number }
  | { readonly type: "nav"; readonly dir: "prev" | "next" }
  | { readonly type: "toggle-play" }
  | { readonly type: "toggle-mute" }
  | { readonly type: "speed"; readonly dir: "down" | "up" };

export type PlayerKeyEvent = Pick<
  KeyboardEvent,
  "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey"
>;

export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return (el as HTMLElement).isContentEditable === true;
}

export function clampSeek(current: number, delta: number, duration: number): number {
  const target = current + delta;
  const lower = Math.max(0, target);
  if (!Number.isFinite(duration) || Number.isNaN(duration)) {
    return lower;
  }
  return Math.min(duration, lower);
}

export function stepPlaybackSpeed(current: number, dir: "down" | "up"): PlaybackSpeed {
  if (dir === "up") {
    const next = PLAYBACK_SPEEDS.find((s) => s > current);
    return next !== undefined ? next : PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1];
  }
  const prev = [...PLAYBACK_SPEEDS].reverse().find((s) => s < current);
  return prev !== undefined ? prev : PLAYBACK_SPEEDS[0];
}

export function cyclePlaybackSpeed(current: number): PlaybackSpeed {
  const index = PLAYBACK_SPEEDS.indexOf(current as PlaybackSpeed);
  if (index === -1) {
    return 1.25;
  }
  return PLAYBACK_SPEEDS[(index + 1) % PLAYBACK_SPEEDS.length];
}

export function resolvePlayerKeyAction(e: PlayerKeyEvent): PlayerKeyAction | null {
  // Never interfere with OS / browser accelerator keys
  if (e.ctrlKey || e.metaKey) {
    return null;
  }

  // Playback speed: < to slow down, > to speed up (YouTube standard shortcuts)
  if (e.key === "<" || (e.shiftKey && e.key === ",")) {
    return { type: "speed", dir: "down" };
  }
  if (e.key === ">" || (e.shiftKey && e.key === ".")) {
    return { type: "speed", dir: "up" };
  }

  // Arrow Left: navigation with Shift, 1s fine seek with Alt, 5s seek by default
  if (e.key === "ArrowLeft") {
    if (e.shiftKey) {
      return { type: "nav", dir: "prev" };
    }
    if (e.altKey) {
      return { type: "seek", delta: -1 };
    }
    return { type: "seek", delta: -5 };
  }

  // Arrow Right: navigation with Shift, 1s fine seek with Alt, 5s seek by default
  if (e.key === "ArrowRight") {
    if (e.shiftKey) {
      return { type: "nav", dir: "next" };
    }
    if (e.altKey) {
      return { type: "seek", delta: 1 };
    }
    return { type: "seek", delta: 5 };
  }

  // Bracket keys for video navigation
  if (e.key === "[") {
    return { type: "nav", dir: "prev" };
  }
  if (e.key === "]") {
    return { type: "nav", dir: "next" };
  }

  // YouTube standard 10s seek: J / L
  const lowerKey = e.key.toLowerCase();
  if (lowerKey === "j") {
    return { type: "seek", delta: -10 };
  }
  if (lowerKey === "l") {
    return { type: "seek", delta: 10 };
  }

  // Play / Pause toggle: Space
  if (e.key === " " || e.key === "Spacebar") {
    return { type: "toggle-play" };
  }

  // Mute toggle: M
  if (lowerKey === "m") {
    return { type: "toggle-mute" };
  }

  return null;
}
