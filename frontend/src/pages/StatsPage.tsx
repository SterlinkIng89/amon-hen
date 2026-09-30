import { useState } from "react";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import MostPlayedGames from "../components/stats/MostPlayedGames";
import LocalRecordingActivity from "../components/stats/LocalRecordingActivity";
import GamingInsights from "../components/stats/GamingInsights";
import { useAdvancedFilters } from "../components/ui/AdvancedFilters";

export default function StatsPage() {
  const filters = useAdvancedFilters();
  const [globalYear, setGlobalYear] = useState<string>("All");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      {/* ── Sticky sub-header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 h-14 shrink-0 border-b border-border-subtle bg-surface/50 backdrop-blur-md sticky top-0 z-20">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-accent shrink-0"
        >
          <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
        </svg>
        <h1 className="text-sm font-bold text-text-primary">Stats</h1>
      </div>

      {/* ── Full-page analytics ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-0">
        <ErrorBoundary area="Stats Analytics">
          <LocalRecordingActivity
            filters={filters}
            selectedYear={globalYear}
            onYearChange={setGlobalYear}
          />
        </ErrorBoundary>

        <ErrorBoundary area="Most Played Games">
          <MostPlayedGames filters={filters} globalYear={globalYear} />
        </ErrorBoundary>

        <ErrorBoundary area="Gaming Insights">
          <GamingInsights filters={filters} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
