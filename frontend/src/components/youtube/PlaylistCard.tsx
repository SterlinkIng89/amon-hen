import { YTPlaylist } from "../../types";

interface PlaylistCardProps {
  playlist: YTPlaylist;
  viewMode?: "grid" | "list";
  onClick?: () => void;
}

export default function PlaylistCard({
  playlist,
  viewMode = "grid",
  onClick,
}: PlaylistCardProps) {
  const isList = viewMode === "list";
  const heightClass = isList ? "h-[120px]" : "h-fit w-[213px]";
  const thumbHeightClass = isList ? "h-full" : "h-[120px]";

  return (
    <div
      className={`flex bg-card rounded-xl border border-border-subtle overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer group ${isList ? "flex-row" : "flex-col"} ${heightClass}`}
      onClick={onClick}
    >
      <div
        className={`relative bg-black/50 overflow-hidden shrink-0 ${isList ? "w-[213px]" : "w-full"} ${thumbHeightClass}`}
      >
        {playlist.thumbnailUrl ? (
          <img
            src={playlist.thumbnailUrl}
            alt={playlist.title}
            className="w-full h-full object-cover transition-transform duration-500"
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

        {/* Playlist Overlay */}
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
      </div>

      <div
        className={`flex flex-col flex-1 justify-start min-w-0 ${isList ? "px-3 py-2" : "p-3.5"}`}
      >
        <h3
          className={`font-bold text-text-primary line-clamp-2 leading-tight ${isList ? "text-xs" : "text-sm h-10"}`}
          title={playlist.title}
        >
          {playlist.title}
        </h3>
      </div>
    </div>
  );
}
