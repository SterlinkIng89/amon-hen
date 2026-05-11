import { YTVideo } from "../../types";

interface ChannelVideoCardProps {
  video: YTVideo;
  onUpdate: () => void;
  viewMode?: "grid" | "list";
}

export default function ChannelVideoCard({
  video,
  onUpdate,
  viewMode = "grid",
}: ChannelVideoCardProps) {
  // Parse ISO 8601 duration (e.g., PT1H2M30S)
  const parseDuration = (isoDuration: string) => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) return "0:00";

    const h = parseInt(matches[1] || "0");
    const m = parseInt(matches[2] || "0");
    const s = parseInt(matches[3] || "0");

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString();
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const isList = viewMode === "list";

  return (
    <div
      className={`flex bg-card rounded-xl border border-border-subtle overflow-hidden shadow-sm hover:shadow-md transition-shadow group ${isList ? "flex-row h-[100px]" : "flex-col"}`}
    >
      <div
        className={`relative bg-black/50 shrink-0 ${isList ? "w-[120px] h-full" : "aspect-video"}`}
      >
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          className={`absolute bottom-1 right-1 bg-black/80 backdrop-blur-md px-1 py-0.5 rounded text-[9px] font-bold text-white z-10 border border-white/10 ${isList ? "scale-90" : ""}`}
        >
          {parseDuration(video.duration)}
        </div>

        {video.localFile && (
          <div
            className={`absolute top-1 right-1 bg-green-500/90 backdrop-blur-md text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-lg border border-green-400/50 flex items-center gap-1 z-10 ${isList ? "scale-75 origin-top-right" : ""}`}
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
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            LOCAL
          </div>
        )}
      </div>

      <div
        className={`flex flex-col flex-1 min-w-0 ${isList ? "px-3 py-2 justify-between" : "p-3.5 gap-2"}`}
      >
        <div className="flex flex-col gap-1">
          <h3
            className={`font-bold text-text-primary line-clamp-2 leading-tight ${isList ? "text-xs" : "text-sm"}`}
            title={video.title}
          >
            {video.title}
          </h3>
          {isList && (
            <span className="text-[10px] text-text-muted font-medium">
              {formatDate(video.publishedAt)}
            </span>
          )}
        </div>

        <div
          className={`flex items-center justify-between text-text-secondary ${isList ? "text-[10px]" : "text-[11px] mt-auto pt-2"}`}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              {formatNumber(video.viewCount)}
            </span>
            <span className="flex items-center gap-1">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
              </svg>
              {formatNumber(video.likeCount)}
            </span>
          </div>
          {!isList && (
            <span className="font-medium">{formatDate(video.publishedAt)}</span>
          )}
          {isList && (
            <div className="flex items-center gap-2">
              <a
                href={`https://youtu.be/${video.id}`}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-1 rounded bg-elevated hover:bg-card text-text-secondary hover:text-text-primary transition-colors font-bold"
              >
                YouTube
              </a>
              <button className="px-2 py-1 rounded bg-accent/10 hover:bg-accent/20 text-accent transition-colors font-bold">
                Link
              </button>
            </div>
          )}
        </div>
      </div>

      {!isList && (
        <div className="flex items-center border-t border-border-subtle p-2 bg-surface/50">
          <a
            href={`https://youtu.be/${video.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center py-1.5 rounded text-xs font-bold text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors"
          >
            Open in YouTube
          </a>
          <div className="w-px h-4 bg-border-subtle mx-1" />
          <button className="flex-1 text-center py-1.5 rounded text-xs font-bold text-accent hover:bg-accent/10 transition-colors">
            Link File
          </button>
        </div>
      )}
    </div>
  );
}
