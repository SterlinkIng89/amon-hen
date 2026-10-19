import React from "react";

export type SteamPageTab = "insights" | "backlog" | "rankings";

export interface SteamStatsSubHeaderProps {
  readonly tab: SteamPageTab;
  readonly queuedCount: number;
  readonly ratedCount: number;
  readonly syncing: boolean;
  readonly syncProgress: string;
  readonly hideUtilities: boolean;
  readonly onSelectTab: (tab: SteamPageTab) => void;
  readonly onToggleUtilities: () => void;
  readonly onSync: () => void;
}

export function SteamLogo({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.979 0C5.353 0 0 5.373 0 12c0 6.628 5.353 12 11.979 12 6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12zm6.604 17.581c-.244-.122-1.396-.612-1.396-.612l-.93-1.425c.37-.123.69-.328.947-.6.284-.301.442-.693.442-1.1s-.158-.799-.442-1.1c-.283-.301-.663-.468-1.077-.468-.415 0-.794.167-1.078.468-.283.301-.442.699-.442 1.1s.159.799.442 1.1c.219.232.502.413.82.528l.942 1.455c-.201.096-.423.167-.659.206-.689.117-1.42-.034-1.956-.376l-1.98 1.054c.148.431.137.904-.038 1.332-.239.585-.71.996-1.309 1.144-.6.148-1.229.006-1.722-.387-.492-.393-.787-.976-.816-1.611-.029-.635.211-1.246.66-1.685.45-.439 1.066-.644 1.687-.56l3.32-3.155c-.006-.064-.01-.129-.01-.194 0-1.258.989-2.284 2.203-2.284 1.215 0 2.203 1.026 2.203 2.284 0 .914-.51 1.7-1.245 2.067l.951 1.455c.677.309 1.305.808 1.83 1.463l-1.408.86zM9.988 18.06c-.347.086-.711.003-1-.228-.288-.231-.462-.572-.479-.944-.017-.373.123-.732.385-.989.262-.257.624-.378.971-.329s.642.345.811.687c.168.343.161.75-.02 1.085-.181.336-.505.577-.868.665-.038.009-.076.014-.113.018-.285.034-.572-.008-.887-1.065zm2.753-3.66l-3.32 3.155c.006.064.01.129.01.194 0 1.258-.989 2.284-2.203 2.284-.047 0-.094-.001-.141-.004l-2.029-4.225c.191-.123.411-.214.654-.268.689-.117 1.42.034 1.956.376l1.98-1.054c-.148-.431-.137-.904.038-1.332.239-.585.71-.996 1.309-1.144.6-.148 1.229-.006 1.722.387.492.393.787-.976.816 1.611.029.635-.211 1.246-.66 1.685-.45.439-1.066.644-1.687.56l-2.029-4.225c.191-.123.411-.214.654-.268z" />
    </svg>
  );
}

export function SteamStatsSubHeader({
  tab,
  queuedCount,
  ratedCount,
  syncing,
  syncProgress,
  hideUtilities,
  onSelectTab,
  onToggleUtilities,
  onSync,
}: SteamStatsSubHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-5 h-14 shrink-0 border-b border-border-subtle bg-surface/50 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <SteamLogo className="w-5 h-5 text-accent shrink-0" />
          <h1 className="text-sm font-bold text-text-primary whitespace-nowrap">Steam</h1>
        </div>

        <nav aria-label="Steam View Navigation" className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border-subtle">
          <button
            type="button"
            data-testid="steam-tab-insights"
            onClick={() => onSelectTab("insights")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tab === "insights" ? "bg-elevated text-text-primary shadow-xs" : "text-text-muted hover:text-text-primary"}`}
          >
            Insights
          </button>
          <button
            type="button"
            data-testid="steam-tab-backlog"
            onClick={() => onSelectTab("backlog")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tab === "backlog" ? "bg-elevated text-text-primary shadow-xs" : "text-text-muted hover:text-text-primary"}`}
          >
            <span>Up next backlog</span>
            {queuedCount > 0 && <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-accent/20 text-accent">{queuedCount}</span>}
          </button>
          <button
            type="button"
            data-testid="steam-tab-rankings"
            onClick={() => onSelectTab("rankings")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tab === "rankings" ? "bg-elevated text-text-primary shadow-xs" : "text-text-muted hover:text-text-primary"}`}
          >
            <span>Personal rankings</span>
            {ratedCount > 0 && <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">{ratedCount}</span>}
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {syncing && (
          <span className="text-xs text-text-muted flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
            {syncProgress || "Syncing library..."}
          </span>
        )}
        <button
          type="button"
          data-testid="steam-hide-utilities-toggle"
          onClick={onToggleUtilities}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${hideUtilities ? "bg-accent/10 border-accent/30 text-accent" : "bg-surface border-border-subtle text-text-muted hover:text-text-primary"}`}
          title={hideUtilities ? "Utilities hidden (Wallpaper Engine, Soundpad)" : "Utilities shown"}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${hideUtilities ? "bg-accent" : "bg-text-muted"}`} />
          <span>Hide utilities</span>
        </button>
        <button
          type="button"
          data-testid="steam-sync-btn"
          onClick={onSync}
          disabled={syncing}
          className="btn btn-primary h-8 min-h-8 px-3 text-xs font-medium flex items-center gap-1.5"
        >
          <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21L21.5 8" />
          </svg>
          <span>{syncing ? "Syncing..." : "Sync library"}</span>
        </button>
      </div>
    </div>
  );
}
