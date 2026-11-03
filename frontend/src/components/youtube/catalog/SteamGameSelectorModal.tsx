import { FC, useState, useEffect, useCallback, useId } from "react";
import { backend } from "../../../../wailsjs/go/models";
import { SearchSteamGames, SetSteamAppID } from "../../../../wailsjs/go/backend/App";

export interface SteamGameSelectorModalProps {
  readonly isOpen: boolean;
  readonly tag: string;
  readonly currentAppId: string | null;
  readonly currentGameTitle?: string;
  readonly onSelectAppId: (appId: string | null) => void;
  readonly onClose: () => void;
}

export const SteamGameSelectorModal: FC<SteamGameSelectorModalProps> = ({
  isOpen,
  tag,
  currentAppId,
  currentGameTitle,
  onSelectAppId,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState(tag);
  const [customAppId, setCustomAppId] = useState("");
  const [results, setResults] = useState<readonly backend.SteamSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchInputId = useId();
  const customInputId = useId();

  // Reset search query to tag when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(tag);
      setCustomAppId(currentAppId ?? "");
      setErrorMsg(null);
    }
  }, [isOpen, tag, currentAppId]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const query = searchQuery.trim();
    if (!query) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);

    const timer = setTimeout(() => {
      SearchSteamGames(query)
        .then((items) => {
          if (active) {
            setResults(items || []);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setResults([]);
            setIsLoading(false);
          }
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, searchQuery]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const handleSelectGame = async (appId: string) => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await SetSteamAppID(tag, appId);
      onSelectAppId(appId);
      onClose();
    } catch {
      setErrorMsg("Failed to save Steam AppID binding.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyCustomAppId = async () => {
    const trimmed = customAppId.trim();
    if (!trimmed) return;
    if (!/^\d+$/.test(trimmed)) {
      setErrorMsg("AppID must contain digits only.");
      return;
    }
    await handleSelectGame(trimmed);
  };

  const handleUnlink = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await SetSteamAppID(tag, "");
      onSelectAppId(null);
      onClose();
    } catch {
      setErrorMsg("Failed to unlink Steam AppID.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="steam-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-border-subtle rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-elevated/40">
          <div>
            <h3 id="steam-modal-title" className="text-sm font-semibold text-text-primary">
              Link Steam Game for &ldquo;{tag}&rdquo;
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Select the correct Steam title or provide an exact Steam AppID.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-elevated transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Current match state */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-elevated/40 border border-border-subtle">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-text-muted">Currently Matched</span>
              <div className="text-xs font-semibold text-text-primary">
                {currentAppId ? (
                  <span>
                    {currentGameTitle ? `${currentGameTitle} ` : ""}
                    <span className="font-mono text-text-muted font-normal">
                      (AppID {currentAppId})
                    </span>
                  </span>
                ) : (
                  <span className="text-text-secondary">No Steam match linked</span>
                )}
              </div>
            </div>
            {currentAppId && (
              <button
                type="button"
                onClick={handleUnlink}
                disabled={isSaving}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                Unlink
              </button>
            )}
          </div>

          {/* Search Steam games */}
          <div className="space-y-1.5">
            <label htmlFor={searchInputId} className="text-xs font-medium text-text-secondary">
              Search Steam store &amp; local library
            </label>
            <div className="relative">
              <input
                id={searchInputId}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search game title..."
                className="w-full bg-elevated/60 border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
              {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Search results list */}
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-text-muted">Search Results</div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {results.length === 0 && !isLoading ? (
                <div className="text-xs text-text-muted text-center py-6 bg-elevated/20 rounded-xl border border-dashed border-border-subtle">
                  No games found for &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                results.map((item) => {
                  const isCurrent = item.appId === currentAppId;
                  return (
                    <div
                      key={item.appId}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                        isCurrent
                          ? "bg-accent/10 border-accent/40"
                          : "bg-elevated/30 border-border-subtle hover:bg-elevated/60 hover:border-border-muted"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.headerUrl ? (
                          <img
                            src={item.headerUrl}
                            alt={item.name}
                            className="w-16 h-8 object-cover rounded-md bg-elevated shrink-0 border border-border-subtle"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-16 h-8 rounded-md bg-elevated shrink-0 border border-border-subtle flex items-center justify-center text-[10px] text-text-muted">
                            Steam
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-text-primary truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] font-mono text-text-muted">
                            AppID: {item.appId}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        {isCurrent ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/20 text-accent">
                            Selected
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectGame(item.appId)}
                            disabled={isSaving}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-elevated hover:bg-elevated/80 text-text-primary border border-border-subtle transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Select
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Manual AppID override */}
          <div className="pt-3 border-t border-border-subtle space-y-1.5">
            <label htmlFor={customInputId} className="text-xs font-medium text-text-secondary">
              Or specify Steam AppID directly
            </label>
            <div className="flex gap-2">
              <input
                id={customInputId}
                type="text"
                value={customAppId}
                onChange={(e) => setCustomAppId(e.target.value)}
                placeholder="e.g. 3830"
                className="flex-1 bg-elevated/60 border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent font-mono transition-colors"
              />
              <button
                type="button"
                onClick={handleApplyCustomAppId}
                disabled={!customAppId.trim() || isSaving}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-elevated hover:bg-elevated/80 text-text-primary border border-border-subtle transition-colors cursor-pointer disabled:opacity-50"
              >
                Apply AppID
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-subtle bg-elevated/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium bg-elevated hover:bg-elevated/80 text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
