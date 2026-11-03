import { FC } from "react";

export interface SteamMatchBadgeProps {
  readonly appId: string | null;
  readonly gameTitle?: string;
  readonly isLoading: boolean;
  readonly onOpenSelector: () => void;
}

export const SteamMatchBadge: FC<SteamMatchBadgeProps> = ({
  appId,
  gameTitle,
  isLoading,
  onOpenSelector,
}) => {
  const matchLabel = gameTitle ? `${gameTitle} (AppID ${appId})` : `AppID ${appId}`;

  return (
    <div className="flex items-center gap-2">
      {isLoading ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-elevated/50 text-text-muted border border-border-subtle">
          Checking Steam match...
        </span>
      ) : appId ? (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 max-w-xs sm:max-w-md truncate">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-10 10c0 4.42 2.87 8.17 6.84 9.5l2.6-3.77A3.48 3.48 0 0 1 11 16.5c0-.98.4-1.87 1.05-2.51L10.3 11.2A5.5 5.5 0 0 1 12 11c3.04 0 5.5 2.46 5.5 5.5 0 2.22-1.32 4.13-3.21 4.97l2.67 3.87A10 10 0 0 0 22 12a10 10 0 0 0-10-10z" />
          </svg>
          <span className="truncate">Steam matched: {matchLabel}</span>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-elevated/50 text-text-secondary border border-border-subtle">
          No Steam match found
        </span>
      )}
      <button
        type="button"
        onClick={onOpenSelector}
        disabled={isLoading}
        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-elevated/60 text-text-secondary hover:text-text-primary hover:bg-elevated border border-border-subtle transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title="Search or change Steam game binding"
      >
        {appId ? "Change" : "Link Steam game"}
      </button>
    </div>
  );
};
