import { useState, useRef, useEffect } from "react";

interface Props {
  selectedCount: number;
  isUpdating?: boolean;
  onClearSelection: () => void;
  onUpdateVisibility: (privacy: "public" | "unlisted" | "private") => void;
}

export default function PlaylistBulkActionBar({
  selectedCount,
  isUpdating = false,
  onClearSelection,
  onUpdateVisibility,
}: Props) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] animate-slideUp select-none">
      <div className="bg-elevated/95 backdrop-blur-md border border-border-medium rounded-2xl shadow-2xl px-3.5 py-2 flex items-center gap-4">
        {/* Selection Info */}
        <div className="flex items-center gap-2 pl-1">
          <div className="bg-accent text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
            {selectedCount}
          </div>
          <span className="text-xs font-medium text-text-primary whitespace-nowrap">
            {selectedCount === 1 ? "playlist selected" : "playlists selected"}
          </span>
        </div>

        <div className="h-4 w-px bg-border-medium" />

        {/* Action: Change Visibility */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="btn btn-primary btn-sm flex items-center gap-2"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Updating...</span>
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Set Visibility</span>
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
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </>
            )}
          </button>

          {isDropdownOpen && !isUpdating && (
            <div className="absolute bottom-full left-0 mb-2 w-48 bg-elevated border border-border-medium rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn p-1">
              <button
                className="w-full text-left px-3 py-2 text-xs font-medium text-text-primary hover:bg-green-500/15 hover:text-green-400 rounded-lg transition-colors flex items-center gap-2.5"
                onClick={() => {
                  setIsDropdownOpen(false);
                  onUpdateVisibility("public");
                }}
              >
                <div className="w-5 h-5 rounded bg-green-500/10 text-green-400 flex items-center justify-center shrink-0">
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
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span>Public</span>
                  <span className="text-[10px] text-text-muted">
                    Anyone can search and view
                  </span>
                </div>
              </button>

              <button
                className="w-full text-left px-3 py-2 text-xs font-medium text-text-primary hover:bg-sky-500/15 hover:text-sky-400 rounded-lg transition-colors flex items-center gap-2.5"
                onClick={() => {
                  setIsDropdownOpen(false);
                  onUpdateVisibility("unlisted");
                }}
              >
                <div className="w-5 h-5 rounded bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
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
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span>Unlisted</span>
                  <span className="text-[10px] text-text-muted">
                    Anyone with the link can view
                  </span>
                </div>
              </button>

              <button
                className="w-full text-left px-3 py-2 text-xs font-medium text-text-primary hover:bg-amber-500/15 hover:text-amber-400 rounded-lg transition-colors flex items-center gap-2.5"
                onClick={() => {
                  setIsDropdownOpen(false);
                  onUpdateVisibility("private");
                }}
              >
                <div className="w-5 h-5 rounded bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
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
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span>Private</span>
                  <span className="text-[10px] text-text-muted">
                    Only you can view
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Clear Selection */}
        <button
          className="p-1.5 rounded-full text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={onClearSelection}
          disabled={isUpdating}
          title="Clear selection"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
