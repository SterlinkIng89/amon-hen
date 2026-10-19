export type PlayerKeyAction =
  | { readonly type: "seek"; readonly delta: number }
  | { readonly type: "nav"; readonly dir: "prev" | "next" }
  | { readonly type: "toggle-play" }
  | { readonly type: "toggle-mute" };

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

export function resolvePlayerKeyAction(e: PlayerKeyEvent): PlayerKeyAction | null {
  // Never interfere with OS / browser accelerator keys
  if (e.ctrlKey || e.metaKey) {
    return null;
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
