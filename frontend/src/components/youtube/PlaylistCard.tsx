import { useState } from "react";
import { YTPlaylist } from "../../types";
import { DeletePlaylist } from "../../../wailsjs/go/backend/App";

interface PlaylistCardProps {
  playlist: YTPlaylist;
  viewMode?: "grid" | "list";
  multiSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onSelectToggle?: (e: React.MouseEvent) => void;
  onDeleted?: () => void;
}

export default function PlaylistCard({
  playlist,
  viewMode = "grid",
  multiSelected = false,
  onClick,
  onSelectToggle,
  onDeleted,
}: PlaylistCardProps) {
  const isList = viewMode === "list";
  const heightClass = isList ? "h-[120px]" : "h-full";
  const thumbHeightClass = isList ? "h-full" : "aspect-video";

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
    setError("");
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
    setError("");
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    setError("");
    try {
      await DeletePlaylist(playlist.id);
      onDeleted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace(/^Error: /, ""));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const privacy = (playlist.privacy || "public").toLowerCase();
  const getPrivacyBadge = () => {
    switch (privacy) {
      case "private":
        return {
          label: "Private",
          className: "bg-amber-500/10 text-amber-400 border-amber-500/25",
          icon: (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ),
        };
      case "unlisted":
        return {
          label: "Unlisted",
          className: "bg-sky-500/10 text-sky-400 border-sky-500/25",
          icon: (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          ),
        };
      default:
        return {
          label: "Public",
          className: "bg-green-500/10 text-green-400 border-green-500/25",
          icon: (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          ),
        };
    }
  };

  const badge = getPrivacyBadge();

  // While the confirm modal is open, show a warning overlay instead of navigating
  if (confirmDelete) {
    return (
      <div
        className={`flex bg-card rounded-xl border border-red-500/40 overflow-hidden shadow-sm ${isList ? "flex-row" : "flex-col"} ${heightClass} relative`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dimmed thumbnail */}
        <div
          className={`relative bg-black/50 overflow-hidden shrink-0 ${isList ? "w-[213px]" : "w-full"} ${thumbHeightClass} opacity-30`}
        >
          {playlist.thumbnailUrl ? (
            <img
              src={playlist.thumbnailUrl}
              alt={playlist.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-elevated text-text-muted" />
          )}
        </div>

        {/* Warning panel */}
        <div className={`flex flex-col flex-1 justify-center min-w-0 ${isList ? "px-4 py-3" : "p-4"} gap-3`}>
          {/* Warning header */}
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-red-400 shrink-0">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span className="text-xs font-bold text-red-400">Delete from YouTube?</span>
          </div>

          {/* Warning body */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-text-primary leading-snug line-clamp-2">{playlist.title}</span>
            <span className="text-[10px] text-text-muted leading-relaxed">
              This will <span className="text-red-400 font-bold">permanently delete</span> the playlist
              and its {playlist.videoCount} video link{playlist.videoCount !== 1 ? "s" : ""} from YouTube.
              Videos themselves are not deleted.
            </span>
            {error && (
              <span className="text-[10px] text-red-400 font-medium mt-0.5">{error}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              className="flex-1 py-1.5 rounded-md text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <span className="flex items-center justify-center gap-1.5">
                  <div className="w-2.5 h-2.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  Deleting...
                </span>
              ) : "Delete"}
            </button>
            <button
              className="flex-1 py-1.5 rounded-md text-[11px] font-bold bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              onClick={handleCancelDelete}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex rounded-xl overflow-hidden transition-all duration-300 cursor-pointer group ${isList ? "flex-row" : "flex-col"} ${heightClass} relative select-none border ${
        multiSelected
          ? "bg-accent/10 border-accent/50"
          : "bg-card border-transparent hover:border-accent/30 hover:bg-elevated"
      }`}
      onClick={onClick}
    >
      <div
        className={`relative bg-black/50 overflow-hidden shrink-0 ${isList ? "w-[213px]" : "w-full"} ${thumbHeightClass}`}
      >
        {/* Selection Checkbox */}
        <div
          className={`absolute top-2 left-2 z-30 transition-opacity duration-200 ${
            multiSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            if (onSelectToggle) {
              e.preventDefault();
              e.stopPropagation();
              onSelectToggle(e);
            }
          }}
        >
          <div className={`w-5 h-5 rounded border shadow-sm flex items-center justify-center transition-colors ${
            multiSelected ? "bg-accent border-accent text-white" : "bg-black/40 border-white/40 text-transparent hover:border-white/80 backdrop-blur-sm"
          }`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        {playlist.thumbnailUrl ? (
          <img
            src={playlist.thumbnailUrl}
            alt={playlist.title}
            className="w-full h-full object-cover transition-opacity duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-elevated text-text-muted">
            <svg
              width={isList ? "20" : "32"}
              height={isList ? "20" : "32"}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v18"></path>
              <rect x="3" y="9" width="18" height="12" rx="2"></rect>
              <path d="M3 13h18"></path>
            </svg>
          </div>
        )}

        {/* Playlist overlay — count + icon */}
        <div
          className={`absolute right-0 top-0 bottom-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-1 transition-all ${isList ? "w-8" : "w-1/3 gap-1.5"}`}
        >
          <span
            className={`text-white font-bold ${isList ? "text-[10px]" : "text-sm"}`}
          >
            {playlist.videoCount}
          </span>
          <svg
            width={isList ? "12" : "20"}
            height={isList ? "12" : "20"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </div>

        {/* Delete button — hover absolute */}
        <button
          className="absolute top-2 left-9 p-1.5 rounded-full bg-black/50 border border-white/20 backdrop-blur-md text-white/80 hover:text-red-400 hover:bg-black/80 hover:border-red-500/50 opacity-0 group-hover:opacity-100 transition-all shadow-lg z-20"
          onClick={handleDeleteClick}
          title="Delete playlist from YouTube"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
      </div>

      <div
        className={`flex flex-col flex-1 min-w-0 ${isList ? "px-3 py-2 justify-between" : "p-3 pb-2.5 gap-2"}`}
      >
        <h3
          className={`font-semibold text-text-primary line-clamp-2 leading-tight ${isList ? "text-xs" : "text-[13px] min-h-[32px]"}`}
          title={playlist.title}
        >
          {playlist.title}
        </h3>

        <div className={`flex items-center justify-between text-text-secondary ${isList ? "text-[10px]" : "text-[11px] mt-auto"}`}>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.className}`}>
            {badge.icon}
            <span>{badge.label}</span>
          </span>
          <span className="text-[10px] text-text-muted">
            {playlist.videoCount} {playlist.videoCount === 1 ? "video" : "videos"}
          </span>
        </div>
      </div>
    </div>
  );
}

