import { useState, useRef, useCallback, useEffect } from "react";
import { TagThumbnailConfig, ImageFraming, ElementLayout, LogoLayer, TitleLayer } from "../types";

export interface UseThumbnailHistoryOptions {
  readonly maxHistory?: number;
  readonly resetKey?: string | number;
}

export interface UseThumbnailHistoryReturn {
  readonly past: readonly Partial<TagThumbnailConfig>[];
  readonly present: Partial<TagThumbnailConfig>;
  readonly future: readonly Partial<TagThumbnailConfig>[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly pushState: (nextState: Partial<TagThumbnailConfig>) => void;
  readonly beginBatch: () => void;
  readonly updateBatchPreview: (nextState: Partial<TagThumbnailConfig>) => void;
  readonly commitBatch: (finalState?: Partial<TagThumbnailConfig>) => void;
  readonly undo: () => Partial<TagThumbnailConfig> | null;
  readonly redo: () => Partial<TagThumbnailConfig> | null;
  readonly resetHistory: (initialState?: Partial<TagThumbnailConfig>) => void;
}

export function cloneThumbnailConfig(
  config: Partial<TagThumbnailConfig>
): Partial<TagThumbnailConfig> {
  const cloned: Partial<TagThumbnailConfig> = { ...config };

  if (config.image_framing) {
    cloned.image_framing = { ...config.image_framing };
  }
  if (config.episode_layout) {
    cloned.episode_layout = { ...config.episode_layout };
  }
  if (config.logo) {
    cloned.logo = { ...config.logo };
  }
  if (config.title) {
    cloned.title = { ...config.title };
  }

  return cloned;
}

function areFramingsEqual(a?: ImageFraming, b?: ImageFraming): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.offset_x === b.offset_x && a.offset_y === b.offset_y && a.zoom === b.zoom;
}

function areLayoutsEqual(a?: ElementLayout, b?: ElementLayout): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.scale === b.scale;
}

function areLogosEqual(a?: LogoLayer, b?: LogoLayer): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.enabled === b.enabled &&
    a.x === b.x &&
    a.y === b.y &&
    a.scale === b.scale
  );
}

function areTitlesEqual(a?: TitleLayer, b?: TitleLayer): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.enabled === b.enabled &&
    a.x === b.x &&
    a.y === b.y &&
    a.scale === b.scale &&
    a.color === b.color &&
    a.text_override === b.text_override
  );
}

export function isThumbnailConfigEqual(
  a: Partial<TagThumbnailConfig> | undefined,
  b: Partial<TagThumbnailConfig> | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  if (
    a.enabled !== b.enabled ||
    a.source_type !== b.source_type ||
    a.steam_asset_type !== b.steam_asset_type ||
    a.custom_image_path !== b.custom_image_path ||
    a.episode_position !== b.episode_position ||
    a.episode_format !== b.episode_format ||
    a.font_color !== b.font_color
  ) {
    return false;
  }

  if (!areFramingsEqual(a.image_framing, b.image_framing)) return false;
  if (!areLayoutsEqual(a.episode_layout, b.episode_layout)) return false;
  if (!areLogosEqual(a.logo, b.logo)) return false;
  if (!areTitlesEqual(a.title, b.title)) return false;

  return true;
}

export function buildConfigRestorePatch(
  current: Partial<TagThumbnailConfig>,
  target: Partial<TagThumbnailConfig>
): Partial<TagThumbnailConfig> {
  const patch: Partial<TagThumbnailConfig> = { ...cloneThumbnailConfig(target) };

  const optionalKeys: (keyof TagThumbnailConfig)[] = [
    "image_framing",
    "episode_layout",
    "logo",
    "title",
    "custom_image_path",
    "steam_asset_type",
  ];

  for (const key of optionalKeys) {
    if (current[key] !== undefined && target[key] === undefined) {
      patch[key] = undefined;
    }
  }

  return patch;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  return Boolean(
    target.isContentEditable ||
    target.contentEditable === "true" ||
    target.getAttribute?.("contenteditable") === "true" ||
    target.getAttribute?.("contenteditable") === ""
  );
}

function appendHistoryItem(
  history: readonly Partial<TagThumbnailConfig>[],
  item: Partial<TagThumbnailConfig>,
  maxHistory: number
): Partial<TagThumbnailConfig>[] {
  const next = [...history, item];
  return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
}

export function useThumbnailHistory(
  initialOrExternalConfig: Partial<TagThumbnailConfig>,
  options?: UseThumbnailHistoryOptions
): UseThumbnailHistoryReturn {
  const maxHistory = options?.maxHistory ?? 50;
  const resetKey = options?.resetKey;

  const [past, setPast] = useState<Partial<TagThumbnailConfig>[]>([]);
  const [present, setPresent] = useState<Partial<TagThumbnailConfig>>(() =>
    cloneThumbnailConfig(initialOrExternalConfig)
  );
  const [future, setFuture] = useState<Partial<TagThumbnailConfig>[]>([]);

  const pastRef = useRef(past);
  pastRef.current = past;
  const presentRef = useRef(present);
  presentRef.current = present;
  const futureRef = useRef(future);
  futureRef.current = future;

  const isBatchingRef = useRef(false);
  const batchStartPresentRef = useRef<Partial<TagThumbnailConfig> | null>(null);
  const isHistoryNavigatingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const externalBatchStartRef = useRef<Partial<TagThumbnailConfig> | null>(null);

  const flushExternalBatch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const startingPresent = externalBatchStartRef.current;
    if (startingPresent && !isThumbnailConfigEqual(startingPresent, presentRef.current)) {
      externalBatchStartRef.current = null;
      const nextPast = appendHistoryItem(pastRef.current, startingPresent, maxHistory);
      pastRef.current = nextPast;
      setPast(nextPast);
      setFuture([]);
      futureRef.current = [];
    } else {
      externalBatchStartRef.current = null;
    }
  }, [maxHistory]);

  // Synchronize when external config changes (from framing controls, element controls, color, format)
  useEffect(() => {
    if (isBatchingRef.current) return;
    if (isHistoryNavigatingRef.current) {
      isHistoryNavigatingRef.current = false;
      return;
    }
    if (!isThumbnailConfigEqual(initialOrExternalConfig, presentRef.current)) {
      if (externalBatchStartRef.current === null) {
        externalBatchStartRef.current = cloneThumbnailConfig(presentRef.current);
      }
      setFuture([]);
      futureRef.current = [];
      const nextCloned = cloneThumbnailConfig(initialOrExternalConfig);
      presentRef.current = nextCloned;
      setPresent(nextCloned);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        flushExternalBatch();
      }, 300);
    }
  }, [initialOrExternalConfig, flushExternalBatch]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Reset when resetKey changes
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      externalBatchStartRef.current = null;
      const fresh = cloneThumbnailConfig(initialOrExternalConfig);
      pastRef.current = [];
      presentRef.current = fresh;
      futureRef.current = [];
      setPast([]);
      setPresent(fresh);
      setFuture([]);
      isBatchingRef.current = false;
      batchStartPresentRef.current = null;
    }
  }, [resetKey, initialOrExternalConfig]);

  const pushState = useCallback(
    (nextState: Partial<TagThumbnailConfig>) => {
      flushExternalBatch();
      const clonedNext = cloneThumbnailConfig(nextState);
      if (isThumbnailConfigEqual(clonedNext, presentRef.current)) {
        return;
      }
      const previousPresent = presentRef.current;
      presentRef.current = clonedNext;
      setPast((prevPast) => appendHistoryItem(prevPast, previousPresent, maxHistory));
      setPresent(clonedNext);
      setFuture([]);
    },
    [maxHistory, flushExternalBatch]
  );

  const beginBatch = useCallback(() => {
    flushExternalBatch();
    isBatchingRef.current = true;
    batchStartPresentRef.current = cloneThumbnailConfig(presentRef.current);
  }, [flushExternalBatch]);

  const updateBatchPreview = useCallback(
    (nextState: Partial<TagThumbnailConfig>) => {
      const cloned = cloneThumbnailConfig(nextState);
      presentRef.current = cloned;
      setPresent(cloned);
    },
    []
  );

  const commitBatch = useCallback(
    (finalState?: Partial<TagThumbnailConfig>) => {
      if (!isBatchingRef.current) return;
      isBatchingRef.current = false;

      const startingPresent = batchStartPresentRef.current;
      batchStartPresentRef.current = null;

      const resolvedFinal = finalState
        ? cloneThumbnailConfig(finalState)
        : presentRef.current;

      if (!startingPresent || isThumbnailConfigEqual(startingPresent, resolvedFinal)) {
        return;
      }

      presentRef.current = resolvedFinal;
      setPast((prevPast) => appendHistoryItem(prevPast, startingPresent, maxHistory));
      setPresent(resolvedFinal);
      setFuture([]);
    },
    [maxHistory]
  );

  const undo = useCallback((): Partial<TagThumbnailConfig> | null => {
    flushExternalBatch();
    if (pastRef.current.length === 0) return null;

    isHistoryNavigatingRef.current = true;
    const currentPresent = presentRef.current;
    const previous = pastRef.current[pastRef.current.length - 1];
    const newPast = pastRef.current.slice(0, pastRef.current.length - 1);
    const newFuture = [currentPresent, ...futureRef.current];

    presentRef.current = previous;
    pastRef.current = newPast;
    futureRef.current = newFuture;

    setPast(newPast);
    setFuture(newFuture);
    setPresent(previous);

    return previous;
  }, [flushExternalBatch]);

  const redo = useCallback((): Partial<TagThumbnailConfig> | null => {
    flushExternalBatch();
    if (futureRef.current.length === 0) return null;

    isHistoryNavigatingRef.current = true;
    const currentPresent = presentRef.current;
    const next = futureRef.current[0];
    const newFuture = futureRef.current.slice(1);
    const resolvedPast = appendHistoryItem(pastRef.current, currentPresent, maxHistory);

    presentRef.current = next;
    pastRef.current = resolvedPast;
    futureRef.current = newFuture;

    setPast(resolvedPast);
    setFuture(newFuture);
    setPresent(next);

    return next;
  }, [maxHistory, flushExternalBatch]);

  const resetHistory = useCallback(
    (initialState?: Partial<TagThumbnailConfig>) => {
      const fresh = cloneThumbnailConfig(initialState || initialOrExternalConfig);
      setPast([]);
      setPresent(fresh);
      setFuture([]);
      isBatchingRef.current = false;
      batchStartPresentRef.current = null;
    },
    [initialOrExternalConfig]
  );

  const hasPendingExternalChange =
    externalBatchStartRef.current !== null &&
    !isThumbnailConfigEqual(externalBatchStartRef.current, present);

  return {
    past,
    present,
    future,
    canUndo: past.length > 0 || hasPendingExternalChange,
    canRedo: future.length > 0,
    pushState,
    beginBatch,
    updateBatchPreview,
    commitBatch,
    undo,
    redo,
    resetHistory,
  };
}
