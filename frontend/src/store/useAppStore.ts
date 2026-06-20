/**
 * Lightweight store built with useSyncExternalStore (React 18 built-in).
 * Same API surface as Zustand's create() but zero external dependencies.
 */
import { useSyncExternalStore } from "react";
import { QueueItem } from "../components/youtube/UploadQueue";
import { ViewMode } from "../types";

type SortMode = "date" | "name" | "size";

interface AppState {
  queue: QueueItem[];
  queueRunning: boolean;
  queueAddedAt: number; // timestamp bump — changes every time an item is added
  queueDoneAt: number;  // timestamp bump — changes every time an item finishes
  ytAuthed: boolean;
  view: ViewMode;
  sortMode: SortMode;
  filterUploaded: boolean;
  selectedIndex: number;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const PREFS_KEY = "amon-hen-prefs";

function loadPersistedPrefs(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistedPrefs(state: AppState) {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        view: state.view,
        sortMode: state.sortMode,
        filterUploaded: state.filterUploaded,
        selectedIndex: state.selectedIndex,
      })
    );
  } catch {}
}

// ─── Store implementation ─────────────────────────────────────────────────────

const saved = loadPersistedPrefs();

let state: AppState = {
  queue: [],
  queueRunning: false,
  queueAddedAt: 0,
  queueDoneAt: 0,
  ytAuthed: false,
  view: (saved.view as ViewMode) ?? "grid",
  sortMode: (saved.sortMode as SortMode) ?? "date",
  filterUploaded: saved.filterUploaded ?? false,
  selectedIndex: saved.selectedIndex ?? -1,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function getSnapshot() {
  return state;
}

function setState(patch: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) {
  const incoming = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...incoming };
  savePersistedPrefs(state);
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── React hook ───────────────────────────────────────────────────────────────

export function useAppStore() {
  const s = useSyncExternalStore(subscribe, getSnapshot);

  const setQueue = (queueOrUpdater: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => {
    setState((prev) => ({
      queue:
        typeof queueOrUpdater === "function"
          ? queueOrUpdater(prev.queue)
          : queueOrUpdater,
    }));
  };

  return {
    ...s,
    setQueue,
    addToQueue: (items: QueueItem[]) =>
      setState((prev) => ({ queue: [...prev.queue, ...items], queueAddedAt: Date.now() })),
    bumpQueueAdded: () => setState({ queueAddedAt: Date.now() }),
    bumpQueueDone: () => setState({ queueDoneAt: Date.now() }),
    setQueueRunning: (queueRunning: boolean) => setState({ queueRunning }),
    setYtAuthed: (ytAuthed: boolean) => setState({ ytAuthed }),
    setView: (view: ViewMode) => setState({ view }),
    setSortMode: (sortMode: SortMode) => setState({ sortMode }),
    setFilterUploaded: (filterUploaded: boolean) => setState({ filterUploaded }),
    setSelectedIndex: (selectedIndex: number) => setState({ selectedIndex }),
  };
}
