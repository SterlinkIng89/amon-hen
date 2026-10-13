import React from "react";
import { ImageFraming } from "../../types";
import { DEFAULT_FRAMING, clampFraming } from "../../utils/thumbnailGenerator";

export interface ThumbnailFramingControlsProps {
  readonly framing?: ImageFraming;
  readonly onChange: (framing: ImageFraming) => void;
  readonly disabled?: boolean;
}

export default function ThumbnailFramingControls({
  framing = DEFAULT_FRAMING,
  onChange,
  disabled = false,
}: ThumbnailFramingControlsProps) {
  const current = clampFraming(framing);

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newZoom = parseFloat(e.target.value);
    if (!Number.isFinite(newZoom)) return;
    onChange(
      clampFraming({
        ...current,
        zoom: newZoom,
      })
    );
  };

  const handleCenter = () => {
    onChange(DEFAULT_FRAMING);
  };

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex items-center justify-between text-xs">
        <label
          htmlFor="framing-zoom-slider"
          className="text-text-secondary font-medium"
        >
          Zoom framing ({current.zoom.toFixed(1)}x)
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={handleCenter}
          className="text-[11px] text-text-muted hover:text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          Center image
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="framing-zoom-slider"
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={current.zoom}
          disabled={disabled}
          onChange={handleZoomChange}
          className="w-full accent-accent h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
        />
      </div>

      <span className="text-[10px] text-text-muted">
        Drag preview directly to pan and reposition framing.
      </span>
    </div>
  );
}
