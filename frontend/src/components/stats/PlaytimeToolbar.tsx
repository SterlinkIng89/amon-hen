export interface PlaytimeToolbarProps {
  readonly viewMode: "month" | "year";
  readonly onViewModeChange: (mode: "month" | "year") => void;
  readonly years: readonly string[];
  readonly selectedYear: string;
  readonly onYearSelect: (year: string) => void;
  readonly selectedMonthKey: string; // "YYYY-MM"
  readonly onMonthSelect: (monthKey: string) => void;
  readonly monthsWithData: ReadonlySet<string>; // set of "YYYY-MM"
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function PlaytimeToolbar({
  viewMode,
  onViewModeChange,
  years,
  selectedYear,
  onYearSelect,
  selectedMonthKey,
  onMonthSelect,
  monthsWithData,
}: PlaytimeToolbarProps) {
  const currentMonthNum = parseInt(selectedMonthKey.split("-")[1] || "1", 10);

  return (
    <div className="flex flex-wrap items-center gap-3 w-full py-1">
      {/* 1. Mode Switcher (By month / By year) */}
      <div className="flex items-center bg-surface/60 p-0.5 rounded-lg border border-border-subtle shrink-0">
        <button
          type="button"
          onClick={() => onViewModeChange("month")}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            viewMode === "month"
              ? "bg-accent text-white shadow-xs"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          By month
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("year")}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            viewMode === "year"
              ? "bg-accent text-white shadow-xs"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          By year
        </button>
      </div>

      {/* 2. Year Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        {years.map((y) => {
          const isSelected = selectedYear === y;
          return (
            <button
              key={y}
              type="button"
              onClick={() => onYearSelect(y)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all border whitespace-nowrap ${
                isSelected
                  ? "bg-surface border-accent text-accent"
                  : "bg-transparent border-border-subtle text-text-muted hover:text-text-secondary hover:border-text-muted"
              }`}
            >
              {y}
            </button>
          );
        })}
      </div>

      {/* 3. Divider & Month Pills (Visible in "month" view) */}
      {viewMode === "month" && (
        <>
          <div className="h-5 w-px bg-border-subtle shrink-0 hidden sm:block" />

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
            {MONTH_NAMES.map((name, idx) => {
              const monthNum = idx + 1;
              const monthKey = `${selectedYear}-${String(monthNum).padStart(2, "0")}`;
              const isSelected = currentMonthNum === monthNum;
              const hasData = monthsWithData.has(monthKey);

              return (
                <button
                  key={name}
                  type="button"
                  disabled={!hasData}
                  onClick={() => onMonthSelect(monthKey)}
                  title={hasData ? `${name} ${selectedYear}` : `No data for ${name}`}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    isSelected
                      ? "border border-accent text-accent bg-accent/10 font-bold"
                      : hasData
                        ? "text-text-secondary hover:text-text-primary hover:bg-surface/50"
                        : "text-text-muted/40 cursor-not-allowed"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
