import { VideoFile, SortMode, LibraryGroupMode } from "../../types";
import { folderLabel } from "../../utils/videoUtils";
import StatsBar from "./StatsBar";
import AdvancedFilters, { ActiveFilterChips } from "../ui/AdvancedFilters";
import type { AdvancedFiltersValue } from "../ui/AdvancedFilters";

interface LibrarySubHeaderProps {
  folders: string[];
  activeFolders: string[];
  filteredVideos: VideoFile[];
  searchQuery: string;
  sortMode: SortMode;
  groupMode?: LibraryGroupMode;
  onSearchChange: (q: string) => void;
  onSortChange: (m: SortMode) => void;
  onGroupChange?: (m: LibraryGroupMode) => void;
  onToggleFolder: (path: string) => void;
  onOpenFolderSettings: (path: string) => void;
  filterUploaded: boolean;
  onToggleFilterUploaded: () => void;
  // Advanced filters
  advancedFilters: AdvancedFiltersValue;
  onAdvancedFiltersChange: (v: AdvancedFiltersValue) => void;
  // Tag management & filtering
  onOpenTagManagement: () => void;
  availableTags: string[];
  tagFilter: string;
  onTagFilterChange: (tag: string) => void;
}

const GROUP_OPTIONS: { value: LibraryGroupMode; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "game", label: "Game" },
  { value: "status", label: "Status" },
  { value: "folder", label: "Folder" },
  { value: "none", label: "None" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "name", label: "A–Z" },
  { value: "size", label: "Size" },
  { value: "duration", label: "Duration" },
  { value: "episode", label: "Episode" },
];

export default function LibrarySubHeader({
  folders,
  activeFolders,
  filteredVideos,
  searchQuery,
  sortMode,
  groupMode = "date",
  onSearchChange,
  onSortChange,
  onGroupChange,
  onToggleFolder,
  onOpenFolderSettings,
  filterUploaded,
  onToggleFilterUploaded,
  advancedFilters,
  onAdvancedFiltersChange,
  onOpenTagManagement,
  availableTags = [],
  tagFilter = "",
  onTagFilterChange,
}: LibrarySubHeaderProps) {
  if (folders.length === 0) return null;

  const hasActiveFilters =
    advancedFilters.dateFrom ||
    advancedFilters.dateTo ||
    advancedFilters.excludeWords.length > 0;

  return (
    <div className="flex flex-col border-b border-border-subtle bg-surface/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
      {/* Top Row: Filters & Sort */}
      <div className="flex items-center justify-between px-6 min-h-14 py-2 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Folders */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted tracking-wide">
              Folders
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {folders.map((f) => {
                const active = activeFolders.includes(f);
                return (
                  <div
                    key={f}
                    className={`flex items-center border rounded-lg overflow-hidden transition-all text-xs font-bold h-7 ${
                      active
                        ? "bg-accent text-white shadow-sm border-accent"
                        : "bg-elevated/50 border-border-subtle text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <button
                      className="flex items-center gap-1.5 px-3 h-full bg-transparent border-none text-inherit cursor-pointer transition-colors"
                      onClick={() => onToggleFolder(f)}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 opacity-80"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      {active && (
                        <svg
                          className="shrink-0"
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {folderLabel(f)}
                    </button>
                    <button
                      className={`flex items-center justify-center w-7 h-full bg-transparent border-none border-l cursor-pointer transition-colors ${
                        active
                          ? "border-white/20 hover:bg-black/20"
                          : "border-border-subtle hover:bg-border-subtle"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFolderSettings(f);
                      }}
                      title="Folder Settings"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                    </button>
                    {active && (
                      <button
                        className="flex items-center justify-center w-7 h-full bg-transparent border-none border-l cursor-pointer transition-colors hover:bg-black/20 border-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFolder(f);
                        }}
                        title="Remove filter"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-4 w-px bg-border-subtle" />

          {/* Search Bar */}
          <div className="relative group">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search videos..."
              className="bg-elevated/30 border border-border-subtle rounded-xl pl-9 pr-4 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all w-[240px] placeholder:text-text-muted"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-border-subtle" />

          {/* Hide Uploaded filter chip */}
          <button
            onClick={onToggleFilterUploaded}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterUploaded
                ? "bg-accent text-white shadow-sm border-accent"
                : "bg-elevated/50 border-border-subtle text-text-secondary hover:text-text-primary hover:bg-elevated"
            }`}
            title={
              filterUploaded
                ? "Showing only not-uploaded videos"
                : "Show only videos not yet uploaded"
            }
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Hide Uploaded
          </button>

          <div className="h-4 w-px bg-border-subtle" />

          {/* Tags Configuration & Filter */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenTagManagement}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all cursor-pointer bg-elevated/50 border-border-subtle text-text-secondary hover:text-text-primary hover:bg-elevated"
              title="Configure YouTube playlists and thumbnail templates for library tags"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              Tags
            </button>

            <select
              aria-label="Filter by tag"
              value={tagFilter}
              onChange={(e) => onTagFilterChange(e.target.value)}
              className="bg-elevated/50 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
            >
              <option value="">All Tags</option>
              <option value="__untagged__">Untagged</option>
              <option value="__placeholders__">Needs Variables</option>
              {availableTags.length > 0 && (
                <>
                  <option disabled>──────────</option>
                  {availableTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div className="h-4 w-px bg-border-subtle" />

          {/* Advanced Filters */}
          <AdvancedFilters
            value={advancedFilters}
            onChange={onAdvancedFiltersChange}
            align="left"
            excludeLabel="Exclude Words"
            excludePlaceholder="e.g. short, test…"
          />

          {/* Active chips */}
          <ActiveFilterChips
            value={advancedFilters}
            onClearDateRange={() =>
              onAdvancedFiltersChange({
                ...advancedFilters,
                dateFrom: "",
                dateTo: "",
              })
            }
            onClearExcludeWords={() =>
              onAdvancedFiltersChange({ ...advancedFilters, excludeWords: [] })
            }
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Segmented Group Control */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted tracking-wide">
              Group
            </span>
            <div className="flex items-center bg-elevated/60 border border-border-subtle rounded-lg p-0.5 gap-0.5">
              {GROUP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onGroupChange?.(opt.value)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    groupMode === opt.value
                      ? "bg-accent text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Segmented Sort Control */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted tracking-wide">
              Sort
            </span>
            <div className="flex items-center bg-elevated/60 border border-border-subtle rounded-lg p-0.5 gap-0.5">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onSortChange(opt.value)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    sortMode === opt.value
                      ? "bg-accent text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: StatsBar */}
      <StatsBar
        videos={filteredVideos}
        filterUploaded={filterUploaded}
        onToggleFilterUploaded={onToggleFilterUploaded}
      />
    </div>
  );
}
