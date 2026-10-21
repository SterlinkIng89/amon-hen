import { VideoGroupYT } from "../../types";

export interface ChannelGroupHeaderProps {
  readonly group: VideoGroupYT;
  readonly allSelected: boolean;
  readonly partiallySelected: boolean;
  readonly collapsed: boolean;
  readonly onToggleSelectGroup: () => void;
  readonly onToggleCollapse: () => void;
}

export default function ChannelGroupHeader({
  group,
  allSelected,
  partiallySelected,
  collapsed,
  onToggleSelectGroup,
  onToggleCollapse,
}: ChannelGroupHeaderProps) {
  const totalViews = group.videos.reduce(
    (sum, v) => sum + (v.viewCount || 0),
    0,
  );

  return (
    <div className="flex items-center gap-3 mb-4">
      <button
        type="button"
        onClick={onToggleSelectGroup}
        aria-label={`Select all videos in ${group.label}`}
        title={allSelected ? "Deselect group" : "Select group"}
        className={`w-5 h-5 rounded border shadow-xs flex items-center justify-center transition-all cursor-pointer shrink-0 ${
          allSelected || partiallySelected
            ? "bg-accent border-accent text-white"
            : "bg-elevated border-border-subtle text-transparent hover:border-border-medium"
        }`}
      >
        {allSelected ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : partiallySelected ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ) : null}
      </button>

      <div className="flex items-center gap-2 bg-elevated border border-border-subtle rounded-full px-3 py-0.5 shrink-0">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent shrink-0"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="font-bold text-text-primary text-[13px]">
          {group.label}
        </span>
      </div>

      <span className="text-xs text-text-muted font-semibold bg-elevated/80 border border-border-subtle px-2 py-0.5 rounded-full shrink-0">
        {group.videos.length} video{group.videos.length !== 1 ? "s" : ""}
      </span>

      <span className="text-xs text-text-muted font-medium bg-elevated/50 border border-border-subtle px-2 py-0.5 rounded-full shrink-0">
        {totalViews.toLocaleString()} views
      </span>

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={
          collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`
        }
        title={collapsed ? "Expand group" : "Collapse group"}
        className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated/80 transition-colors cursor-pointer shrink-0"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${
            collapsed ? "-rotate-90" : "rotate-0"
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        className="flex-1 h-px shrink-0"
        style={{
          background:
            "linear-gradient(to right, rgba(255,255,255,0.07) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}
