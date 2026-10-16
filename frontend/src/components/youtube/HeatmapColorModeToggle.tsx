import React from "react";

export type HeatmapColorMode = "intensity" | "game";

interface HeatmapColorModeToggleProps {
  readonly value: HeatmapColorMode;
  readonly onChange: (mode: HeatmapColorMode) => void;
}

export const HeatmapColorModeToggle: React.FC<HeatmapColorModeToggleProps> = ({
  value,
  onChange,
}) => {
  return (
    <div className="flex items-center bg-[#141418] p-1 rounded-lg border-0">
      <button
        type="button"
        onClick={() => onChange("intensity")}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          value === "intensity"
            ? "bg-accent text-white font-semibold shadow-sm"
            : "text-text-muted hover:text-text-primary"
        }`}
      >
        Intensity
      </button>
      <button
        type="button"
        onClick={() => onChange("game")}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          value === "game"
            ? "bg-accent text-white font-semibold shadow-sm"
            : "text-text-muted hover:text-text-primary"
        }`}
      >
        Game
      </button>
    </div>
  );
};
