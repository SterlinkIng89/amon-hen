import { useState } from "react";
import { OpenFolderInExplorer } from "../../../wailsjs/go/backend/App";
import { cyclePlaybackSpeed } from "../../utils/playerKeys";

interface YouTubeTransportBarProps {
  readonly videoId: string;
  readonly videoTitle: string;
  readonly localFile?: string;
  readonly isWide: boolean;
  readonly isInfoExpanded: boolean;
  readonly playbackRate: number;
  readonly onPlaybackRateChange: (rate: number) => void;
  readonly onPrev: (() => void) | null;
  readonly onNext: (() => void) | null;
  readonly onToggleInfoExpanded: () => void;
}

function getParentDirectory(path: string): string {
  const parent = path.replace(/[\\/][^\\/]+$/, "");
  return parent || path;
}

export default function YouTubeTransportBar({
  videoId,
  videoTitle,
  localFile,
  isWide,
  isInfoExpanded,
  playbackRate,
  onPlaybackRateChange,
  onPrev,
  onNext,
  onToggleInfoExpanded,
}: YouTubeTransportBarProps) {
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCycleSpeed = () => {
    const next = cyclePlaybackSpeed(playbackRate);
    onPlaybackRateChange(next > 2 ? 0.5 : next);
  };

  const handleOpenFolder = () => {
    if (localFile) {
      OpenFolderInExplorer(getParentDirectory(localFile)).catch(console.error);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://youtu.be/${videoId}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy YouTube link:", err);
    }
  };

  return (
    <div
      className={`flex items-center px-6 py-3 bg-[#0f0f0f] shrink-0 z-10 relative ${
        isWide ? "justify-center" : "justify-between"
      }`}
    >
      {!isWide && (
        <div className="flex-1 flex items-center gap-2 overflow-hidden mr-4">
          <span
            className="font-medium text-sm text-white/90 truncate"
            title={videoTitle}
          >
            {videoTitle}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div
          className="relative"
          onMouseEnter={() => setShowShortcutsHelp(true)}
          onMouseLeave={() => setShowShortcutsHelp(false)}
        >
          <button
            type="button"
            className={`p-2.5 rounded-full transition-colors flex items-center justify-center ${
              showShortcutsHelp
                ? "bg-white/20 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white/90"
            }`}
            onClick={() => setShowShortcutsHelp((prev) => !prev)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.001" />
              <path d="M10 8h.001" />
              <path d="M14 8h.001" />
              <path d="M18 8h.001" />
              <path d="M8 12h.001" />
              <path d="M12 12h.001" />
              <path d="M16 12h.001" />
              <path d="M7 16h10" />
            </svg>
          </button>

          {showShortcutsHelp && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-64 rounded-lg bg-[#181818] border border-white/10 shadow-sm p-3 text-white z-50 pointer-events-auto"
              role="tooltip"
            >
              <div className="font-medium text-xs text-white/90 pb-2 mb-2 border-b border-white/10">
                Keyboard shortcuts
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Seek</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">←</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">→</kbd>
                    <span className="text-white/40 text-[10px]">5s</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Fine seek</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">Alt</kbd>
                    <span className="text-white/40">+</span>
                    <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">← / →</kbd>
                    <span className="text-white/40 text-[10px]">1s</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Seek 10s</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">J</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">L</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Next / Previous</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">Shift</kbd>
                    <span className="text-white/40">+</span>
                    <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">← / →</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Next / Previous</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">[</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">]</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Play / Pause</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">Space</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Mute / Unmute</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">M</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Playback speed</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">&lt;</kbd>
                    <span className="text-white/40">/</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] border border-white/10">&gt;</kbd>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Playback speed"
          className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-colors flex items-center justify-center shrink-0 ${
            playbackRate !== 1
              ? "bg-[#3ea6ff]/20 text-[#3ea6ff]"
              : "text-white/60 hover:bg-white/10 hover:text-white/90"
          }`}
          onClick={handleCycleSpeed}
          title="Playback speed (< / >)"
        >
          {playbackRate}x
        </button>

        <button
          type="button"
          className="px-5 py-2.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-medium text-white/90 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          title="Previous"
          aria-label="Previous"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
          Previous
        </button>

        <button
          type="button"
          className="px-5 py-2.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-medium text-white/90 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={onNext ?? undefined}
          disabled={!onNext}
          title="Next"
          aria-label="Next"
        >
          Next
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>

        <button
          type="button"
          className={`px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 text-xs font-medium ${
            copiedLink
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
          onClick={handleCopyLink}
          title="Copy YouTube link"
          aria-label="Copy YouTube link"
        >
          {copiedLink ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Copied!</span>
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
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Copy Link</span>
            </>
          )}
        </button>

        {localFile && (
          <button
            type="button"
            className="px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
            onClick={handleOpenFolder}
            title="Open file folder"
            aria-label="Open file folder"
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
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>Open Folder</span>
          </button>
        )}
      </div>

      {!isWide && (
        <div className="flex-1 flex justify-end ml-4">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-white/90 hover:bg-white/10 transition-all px-4 py-2 rounded-full"
            onClick={onToggleInfoExpanded}
            aria-label={isInfoExpanded ? "Hide Details" : "Show Details"}
          >
            {isInfoExpanded ? "Hide Details" : "Show Details"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${
                isInfoExpanded ? "rotate-180" : ""
              }`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
