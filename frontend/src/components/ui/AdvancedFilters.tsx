import { useState, useEffect, useRef, KeyboardEvent } from "react";

export interface AdvancedFiltersValue {
  dateFrom: string;
  dateTo: string;
  excludeWords: string[];
}

interface AdvancedFiltersProps {
  value: AdvancedFiltersValue;
  onChange: (v: AdvancedFiltersValue) => void;
  /** Date injected from an external click (e.g. analytics). Shown as a special chip. */
  analyticsDate?: string;
  onClearAnalyticsDate?: () => void;
  /** Alignment of the dropdown panel */
  align?: "left" | "right";
  showDateShortcuts?: boolean;
  showExcludeWords?: boolean;
  /** Label shown on date section, default "Date Range" */
  dateLabel?: string;
  /** Label shown on exclude section, default "Exclude Words" */
  excludeLabel?: string;
  /** Placeholder for exclude input */
  excludePlaceholder?: string;
}

export function useAdvancedFilters(initial?: Partial<AdvancedFiltersValue>) {
  const [dateFrom, setDateFrom] = useState(initial?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initial?.dateTo ?? "");
  const [excludeWords, setExcludeWords] = useState<string[]>(
    initial?.excludeWords ?? [],
  );

  const value: AdvancedFiltersValue = { dateFrom, dateTo, excludeWords };

  const onChange = (v: AdvancedFiltersValue) => {
    setDateFrom(v.dateFrom);
    setDateTo(v.dateTo);
    setExcludeWords(v.excludeWords);
  };

  const clearAll = () => {
    setDateFrom("");
    setDateTo("");
    setExcludeWords([]);
  };

  const activeCount =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + excludeWords.length;

  return {
    value,
    onChange,
    clearAll,
    activeCount,
    dateFrom,
    dateTo,
    excludeWords,
    setDateFrom,
    setDateTo,
    setExcludeWords,
  };
}

export default function AdvancedFilters({
  value,
  onChange,
  analyticsDate,
  onClearAnalyticsDate,
  align = "right",
  showDateShortcuts = true,
  showExcludeWords = true,
  dateLabel = "Date Range",
  excludeLabel = "Exclude Words",
  excludePlaceholder = "Type word + Enter to add…",
}: AdvancedFiltersProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [excludeInput, setExcludeInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { dateFrom, dateTo, excludeWords } = value;

  const activeFilterCount =
    (analyticsDate ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    excludeWords.length;

  // Close panel on outside click
  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const set = (patch: Partial<AdvancedFiltersValue>) =>
    onChange({ ...value, ...patch });

  const clearAll = () => {
    onChange({ dateFrom: "", dateTo: "", excludeWords: [] });
    onClearAnalyticsDate?.();
    setExcludeInput("");
  };

  const addExcludeWord = (raw: string) => {
    const words = raw
      .split(/[,，\s]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    const next = [...excludeWords];
    words.forEach((w) => {
      if (!next.includes(w)) next.push(w);
    });
    set({ excludeWords: next });
    setExcludeInput("");
  };

  const removeExcludeWord = (w: string) =>
    set({ excludeWords: excludeWords.filter((x) => x !== w) });

  const handleExcludeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (excludeInput.trim()) addExcludeWord(excludeInput);
    } else if (
      e.key === "Backspace" &&
      !excludeInput &&
      excludeWords.length > 0
    ) {
      set({ excludeWords: excludeWords.slice(0, -1) });
    }
  };

  const clearDate = () => {
    set({ dateFrom: "", dateTo: "" });
    onClearAnalyticsDate?.();
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* ── Trigger button ───────────────────────────────────────────────── */}
      <button
        onClick={() => setShowPanel((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${
          showPanel || activeFilterCount > 0
            ? "bg-accent/10 border-accent/40 text-accent"
            : "bg-elevated/50 border-border-subtle text-text-secondary hover:text-text-primary hover:bg-elevated"
        }`}
        title="Advanced filters"
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
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filters
        {activeFilterCount > 0 && (
          <span className="ml-0.5 w-4 h-4 rounded-full bg-accent text-white text-[9px] font-black flex items-center justify-center leading-none">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ───────────────────────────────────────────────── */}
      {showPanel && (
        <div
          className={`absolute top-full mt-2 z-50 w-[340px] bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden animate-slideDown ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span className="text-xs font-black text-text-primary">
                Advanced Filters
              </span>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] font-bold text-text-muted hover:text-red-400 transition-colors px-2 py-0.5 rounded-lg hover:bg-red-400/10"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* ── Date filter ────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-accent"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-[10px] font-black text-text-primary tracking-wider">
                  {dateLabel}
                </span>
                {(dateFrom || dateTo || analyticsDate) && (
                  <button
                    onClick={clearDate}
                    className="ml-auto text-[9px] font-bold text-text-muted hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {analyticsDate ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/30 rounded-xl">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent shrink-0"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="text-xs font-bold text-accent flex-1">
                    {analyticsDate}
                  </span>
                  <span className="text-[9px] text-accent/70 font-semibold">
                    from analytics
                  </span>
                  <button
                    onClick={() => onClearAnalyticsDate?.()}
                    className="p-0.5 rounded-full hover:bg-accent/20 text-accent transition-colors"
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-text-muted tracking-wider block mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => set({ dateFrom: e.target.value })}
                      className="w-full bg-elevated/40 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-text-muted tracking-wider block mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => set({ dateTo: e.target.value })}
                      className="w-full bg-elevated/40 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Quick shortcuts */}
              {showDateShortcuts && !analyticsDate && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { label: "This week", days: 7 },
                    { label: "This month", days: 30 },
                    { label: "Last 90d", days: 90 },
                    { label: "This year", days: 365 },
                  ].map(({ label, days }) => (
                    <button
                      key={label}
                      onClick={() => {
                        const to = new Date().toISOString().substring(0, 10);
                        const from = new Date(Date.now() - days * 86400000)
                          .toISOString()
                          .substring(0, 10);
                        set({ dateFrom: from, dateTo: to });
                      }}
                      className="px-2 py-0.5 text-[9px] font-bold bg-elevated/60 hover:bg-accent/10 border border-border-subtle hover:border-accent/30 rounded-full text-text-muted hover:text-accent transition-all"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Exclude words ───────────────────────────────────────────── */}
            {showExcludeWords && (
              <>
                <div className="h-px bg-border-subtle" />
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-red-400"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                    <span className="text-[10px] font-black text-text-primary tracking-wider">
                      {excludeLabel}
                    </span>
                    {excludeWords.length > 0 && (
                      <button
                        onClick={() => set({ excludeWords: [] })}
                        className="ml-auto text-[9px] font-bold text-text-muted hover:text-red-400 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Chip input */}
                  <div
                    className="min-h-[38px] flex flex-wrap gap-1.5 p-2 bg-elevated/40 border border-border-subtle rounded-xl focus-within:border-red-400/50 focus-within:ring-2 focus-within:ring-red-400/10 transition-all cursor-text"
                    onClick={() =>
                      (
                        document.getElementById(
                          "adv-exclude-input",
                        ) as HTMLInputElement
                      )?.focus()
                    }
                  >
                    {excludeWords.map((w) => (
                      <span
                        key={w}
                        className="flex items-center gap-1 px-2 py-0.5 bg-red-500/15 border border-red-500/30 rounded-full text-[10px] font-bold text-red-400"
                      >
                        {w}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeExcludeWord(w);
                          }}
                          className="hover:text-red-300 transition-colors ml-0.5"
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <input
                      id="adv-exclude-input"
                      type="text"
                      placeholder={
                        excludeWords.length === 0 ? excludePlaceholder : ""
                      }
                      value={excludeInput}
                      onChange={(e) => setExcludeInput(e.target.value)}
                      onKeyDown={handleExcludeKeyDown}
                      onBlur={() => {
                        if (excludeInput.trim()) addExcludeWord(excludeInput);
                      }}
                      className="flex-1 min-w-[80px] bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
                    />
                  </div>
                  <p className="mt-1.5 text-[9px] text-text-muted">
                    Press{" "}
                    <kbd className="px-1 py-0.5 bg-elevated border border-border-subtle rounded text-[8px]">
                      Enter
                    </kbd>{" "}
                    or{" "}
                    <kbd className="px-1 py-0.5 bg-elevated border border-border-subtle rounded text-[8px]">
                      ,
                    </kbd>{" "}
                    to add each word
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Active filter chips ──────────────────────────────────────────────────────

interface ActiveChipsProps {
  value: AdvancedFiltersValue;
  analyticsDate?: string;
  onClearDateRange: () => void;
  onClearAnalyticsDate?: () => void;
  onClearExcludeWords: () => void;
}

export function ActiveFilterChips({
  value,
  analyticsDate,
  onClearDateRange,
  onClearAnalyticsDate,
  onClearExcludeWords,
}: ActiveChipsProps) {
  const { dateFrom, dateTo, excludeWords } = value;

  return (
    <>
      {/* Analytics date chip */}
      {analyticsDate && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg text-xs font-bold text-accent shrink-0 animate-fadeIn">
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
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {analyticsDate}
          <button
            onClick={onClearAnalyticsDate}
            className="p-0.5 rounded-full hover:bg-accent/20 transition-colors"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Date range chip */}
      {!analyticsDate && (dateFrom || dateTo) && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg text-xs font-bold text-accent shrink-0 animate-fadeIn">
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
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {dateFrom && dateTo
            ? `${dateFrom} → ${dateTo}`
            : dateFrom
              ? `From ${dateFrom}`
              : `Until ${dateTo}`}
          <button
            onClick={onClearDateRange}
            className="p-0.5 rounded-full hover:bg-accent/20 transition-colors"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Exclude words chip */}
      {excludeWords.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs font-bold text-red-400 shrink-0 animate-fadeIn">
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
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          {excludeWords.length === 1
            ? `"${excludeWords[0]}"`
            : `${excludeWords.length} words`}
          <button
            onClick={onClearExcludeWords}
            className="p-0.5 rounded-full hover:bg-red-400/20 transition-colors"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
