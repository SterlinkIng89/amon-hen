import { useState, useEffect, useRef } from "react";
import { TierLevel, scoreToDefaultTier } from "../../utils/steamInsightsUtils";

export interface SteamGameRatingPopoverProps {
  appid: number;
  initialTier?: TierLevel | null;
  initialScore?: number;
  onRate: (tier: TierLevel, score: number) => void;
  onRemoveRating?: () => void;
  onClose: () => void;
}

const TIERS: readonly TierLevel[] = ["S", "A", "B", "C", "D"];
const SCORES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function SteamGameRatingPopover({
  appid,
  initialTier,
  initialScore,
  onRate,
  onRemoveRating,
  onClose,
}: SteamGameRatingPopoverProps): React.JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPlacement, setPopoverPlacement] = useState<"up" | "down">("down");
  const [draftTier, setDraftTier] = useState<TierLevel | null>(initialTier ?? null);
  const [customScoreInput, setCustomScoreInput] = useState<string>(
    initialScore !== undefined ? String(initialScore) : ""
  );

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    if (roomBelow < 20 && rect.top > rect.height) {
      setPopoverPlacement("up");
    } else {
      setPopoverPlacement("down");
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleApplyCustomScore = () => {
    const parsed = parseFloat(customScoreInput);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      const effectiveTier = draftTier ?? initialTier ?? scoreToDefaultTier(parsed);
      onRate(effectiveTier, parsed);
      onClose();
    }
  };

  return (
    <div
      ref={popoverRef}
      data-testid={`quick-rate-popover-${appid}`}
      onClick={(e) => e.stopPropagation()}
      className={`absolute right-0 z-40 bg-elevated/95 backdrop-blur-md border border-border-medium rounded-xl p-3 shadow-md w-60 flex flex-col gap-2.5 ${
        popoverPlacement === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5"
      }`}
    >
      <div className="flex items-center justify-between text-xs pb-1.5 border-b border-border-subtle">
        <span className="font-bold text-text-primary">Personal rating</span>
        {initialTier && onRemoveRating && (
          <button
            type="button"
            data-testid={`popover-remove-rating-${appid}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveRating();
              onClose();
            }}
            className="text-[11px] text-red-400 hover:text-red-300 font-medium transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text-muted font-medium">Tier</span>
        <div className="grid grid-cols-5 gap-1">
          {TIERS.map((tier) => {
            const isSelectedTier = (draftTier ?? initialTier) === tier;
            return (
              <button
                key={tier}
                type="button"
                data-testid={`popover-tier-${appid}-${tier}`}
                onClick={() => {
                  setDraftTier(tier);
                  if (initialTier && initialScore !== undefined) {
                    onRate(tier, initialScore);
                  }
                }}
                className={`text-xs font-bold py-1.5 rounded-md transition-colors ${
                  isSelectedTier
                    ? "bg-accent text-white"
                    : "bg-surface hover:bg-card text-text-secondary hover:text-text-primary"
                }`}
              >
                {tier}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted font-medium">Score</span>
          <span className="text-[10px] text-text-muted tabular-nums">
            {customScoreInput || (initialScore !== undefined ? `${initialScore}/10` : "1–10")}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {SCORES.map((score) => {
            const effectiveTier = draftTier ?? initialTier ?? scoreToDefaultTier(score);
            const isCurrentScore = initialScore === score;
            return (
              <button
                key={score}
                type="button"
                data-testid={`popover-score-${appid}-${score}`}
                onClick={() => {
                  setCustomScoreInput(String(score));
                  onRate(effectiveTier, score);
                  onClose();
                }}
                className={`text-xs font-bold py-1.5 rounded-md transition-colors ${
                  isCurrentScore
                    ? "bg-accent text-white"
                    : "bg-surface hover:bg-card text-text-secondary hover:text-text-primary"
                }`}
              >
                {score}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border-subtle">
        <span className="text-[10px] text-text-muted font-medium shrink-0">Exact:</span>
        <input
          type="number"
          min="1"
          max="10"
          step="any"
          data-testid={`popover-score-input-${appid}`}
          value={customScoreInput}
          onChange={(e) => setCustomScoreInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleApplyCustomScore();
            }
          }}
          placeholder="e.g. 8.5"
          className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-md px-2 py-1 text-xs text-text-primary tabular-nums placeholder:text-text-muted focus:outline-none focus:border-border-medium"
        />
        <button
          type="button"
          data-testid={`popover-score-apply-${appid}`}
          onClick={handleApplyCustomScore}
          className="text-xs font-semibold px-2.5 py-1 rounded-md bg-card hover:bg-card-hover text-text-primary border border-border-subtle transition-colors shrink-0"
        >
          Set
        </button>
      </div>
    </div>
  );
}
