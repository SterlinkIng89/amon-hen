/**
 * Lightweight store built with useSyncExternalStore (React 18 built-in).
 * Same API surface as Zustand's create() but zero external dependencies.
 */
import { useSyncExternalStore } from "react";
import { QueueItem } from "../components/youtube/UploadQueue";
import { ViewMode, PlaylistPrivacy, SortMode, LibraryGroupMode } from "../types";


interface AppState {
  queue: QueueItem[];
  queueRunning: boolean;
  queueAddedAt: number; // timestamp bump — changes every time an item is added
  queueDoneAt: number; // timestamp bump — changes every time an item finishes
  ytAuthed: boolean;
  view: ViewMode;
  sortMode: SortMode;
  groupMode: LibraryGroupMode;
  filterUploaded: boolean;
  selectedIndex: number;
  defaultPlaylistPrivacy: PlaylistPrivacy;
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
        groupMode: state.groupMode,
        filterUploaded: state.filterUploaded,
        selectedIndex: state.selectedIndex,
        defaultPlaylistPrivacy: state.defaultPlaylistPrivacy,
      }),
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
  groupMode: (saved.groupMode as LibraryGroupMode) ?? "date",
  filterUploaded: saved.filterUploaded ?? false,
  selectedIndex: saved.selectedIndex ?? -1,
  defaultPlaylistPrivacy:
    (saved.defaultPlaylistPrivacy as PlaylistPrivacy) ?? "unlisted",
};

type Listener = () => void;
const listeners = new Set<Listener>();

function getSnapshot() {
  return state;
}

function setState(
  patch: Partial<AppState> | ((prev: AppState) => Partial<AppState>),
) {
  const incoming = typeof patch === "function" ? patch(state) : patch;
  const prevState = state;
  state = { ...state, ...incoming };
  if (
    prevState.view !== state.view ||
    prevState.sortMode !== state.sortMode ||
    prevState.groupMode !== state.groupMode ||
    prevState.filterUploaded !== state.filterUploaded ||
    prevState.selectedIndex !== state.selectedIndex ||
    prevState.defaultPlaylistPrivacy !== state.defaultPlaylistPrivacy
  ) {
    savePersistedPrefs(state);
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── Stable Module-level Action Setters ─────────────────────────────────────────

const setQueue = (
  queueOrUpdater: QueueItem[] | ((prev: QueueItem[]) => QueueItem[]),
) => {
  setState((prev) => ({
    queue:
      typeof queueOrUpdater === "function"
        ? queueOrUpdater(prev.queue)
        : queueOrUpdater,
  }));
};

const addToQueue = (items: QueueItem[]) =>
  setState((prev) => ({
    queue: [...prev.queue, ...items],
    queueAddedAt: Date.now(),
  }));

const bumpQueueAdded = () => setState({ queueAddedAt: Date.now() });
const bumpQueueDone = () => setState({ queueDoneAt: Date.now() });
const setQueueRunning = (queueRunning: boolean) => setState({ queueRunning });
const setYtAuthed = (ytAuthed: boolean) => setState({ ytAuthed });
const setView = (view: ViewMode) => setState({ view });
const setSortMode = (sortMode: SortMode) => setState({ sortMode });
const setGroupMode = (groupMode: LibraryGroupMode) => setState({ groupMode });
const setFilterUploaded = (filterUploaded: boolean) =>
  setState({ filterUploaded });
const setSelectedIndex = (selectedIndex: number) => setState({ selectedIndex });
const setDefaultPlaylistPrivacy = (defaultPlaylistPrivacy: PlaylistPrivacy) =>
  setState({ defaultPlaylistPrivacy });

const storeActions = {
  setQueue,
  addToQueue,
  bumpQueueAdded,
  bumpQueueDone,
  setQueueRunning,
  setYtAuthed,
  setView,
  setSortMode,
  setGroupMode,
  setFilterUploaded,
  setSelectedIndex,
  setDefaultPlaylistPrivacy,
};

// ─── React hook ───────────────────────────────────────────────────────────────

export function useAppStore() {
  const s = useSyncExternalStore(subscribe, getSnapshot);

  return {
    ...s,
    ...storeActions,
  };
}

useAppStore.getState = getSnapshot;
useAppStore.setState = setState;

