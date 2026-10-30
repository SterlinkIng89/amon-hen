import React from "react";
import { TagThumbnailConfig, ElementLayout, LogoLayer, TitleLayer } from "../../types";
import {
  ANCHOR_PRESETS,
  AnchorPresetId,
  detectActiveAnchorPreset,
} from "../../utils/thumbnailSnap";

interface QuickAlignmentControlProps {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly onChangeCoord: (x: number, y: number) => void;
  readonly cornersOnly?: boolean;
}

const PRESET_MATRIX: readonly { readonly id: AnchorPresetId; readonly shortLabel: string }[] = [
  { id: "top-left", shortLabel: "TL" },
  { id: "top-center", shortLabel: "TC" },
  { id: "top-right", shortLabel: "TR" },
  { id: "center-left", shortLabel: "CL" },
  { id: "center", shortLabel: "C" },
  { id: "center-right", shortLabel: "CR" },
  { id: "bottom-left", shortLabel: "BL" },
  { id: "bottom-center", shortLabel: "BC" },
  { id: "bottom-right", shortLabel: "BR" },
];

function QuickAlignmentControl({
  label,
  x,
  y,
  onChangeCoord,
  cornersOnly = false,
}: QuickAlignmentControlProps) {
  const activePreset = detectActiveAnchorPreset({ x, y });

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-border-subtle/60 mt-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-text-muted font-medium">Quick alignment</span>
        <span className="text-text-secondary font-mono text-[10px]">
          X: {Math.round(x * 100)}% • Y: {Math.round(y * 100)}%
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* 3x3 Anchor Matrix */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-black/40 rounded border border-border-subtle/80 shrink-0">
          {PRESET_MATRIX.map(({ id, shortLabel }) => {
            const isCorner = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(id);
            if (cornersOnly && !isCorner && id !== "center") {
              return (
                <div
                  key={id}
                  className="w-5 h-5 rounded flex items-center justify-center opacity-20 pointer-events-none text-[9px]"
                >
                  •
                </div>
              );
            }
            const isActive = activePreset === id;
            const presetInfo = ANCHOR_PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                aria-label={`${label} ${presetInfo.label}`}
                title={`${label} ${presetInfo.label} (${Math.round(presetInfo.x * 100)}%, ${Math.round(presetInfo.y * 100)}%)`}
                onClick={() => onChangeCoord(presetInfo.x, presetInfo.y)}
                className={`w-5 h-5 rounded text-[9px] font-semibold transition-colors flex items-center justify-center cursor-pointer ${
                  isActive
                    ? "bg-accent text-white border border-accent shadow-xs"
                    : "bg-surface hover:bg-elevated text-text-muted hover:text-text-primary border border-border-subtle"
                }`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>

        {/* 1-Click Axis Centering Buttons */}
        <div className="flex flex-col gap-1 flex-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              aria-label={`${label} Center X`}
              title="Center horizontally at X = 50%"
              onClick={() => onChangeCoord(0.5, y)}
              className={`h-6 px-1.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                Math.abs(x - 0.5) < 0.01
                  ? "bg-accent/20 border-accent text-accent"
                  : "bg-surface border-border-subtle text-text-muted hover:text-text-primary"
              }`}
            >
              Center X
            </button>
            <button
              type="button"
              aria-label={`${label} Center Y`}
              title="Center vertically at Y = 50%"
              onClick={() => onChangeCoord(x, 0.5)}
              className={`h-6 px-1.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                Math.abs(y - 0.5) < 0.01
                  ? "bg-accent/20 border-accent text-accent"
                  : "bg-surface border-border-subtle text-text-muted hover:text-text-primary"
              }`}
            >
              Center Y
            </button>
          </div>
          <button
            type="button"
            aria-label={`${label} Center Both`}
            title="Center both horizontally and vertically at 50%"
            onClick={() => onChangeCoord(0.5, 0.5)}
            className={`h-6 px-2 rounded text-[10px] font-medium border transition-colors cursor-pointer flex items-center justify-center ${
              Math.abs(x - 0.5) < 0.01 && Math.abs(y - 0.5) < 0.01
                ? "bg-accent/20 border-accent text-accent"
                : "bg-surface border-border-subtle text-text-muted hover:text-text-primary"
            }`}
          >
            Center Both (50%)
          </button>
        </div>
      </div>

      <span className="text-[10px] text-text-muted">
        Hold Alt while dragging on canvas to bypass snap.
      </span>
    </div>
  );
}

export interface ThumbnailElementControlsProps {
  readonly config: TagThumbnailConfig;
  readonly hasLogo: boolean;
  readonly defaultTitle: string;
  readonly onChange: (patch: Partial<TagThumbnailConfig>) => void;
}

export default function ThumbnailElementControls({
  config,
  hasLogo,
  defaultTitle,
  onChange,
}: ThumbnailElementControlsProps) {
  const logo = config.logo;
  const title = config.title;
  const episodeLayout = config.episode_layout;

  const toggleLogo = () => {
    if (logo?.enabled) {
      onChange({
        logo: {
          ...logo,
          enabled: false,
        },
      });
    } else {
      onChange({
        logo: {
          x: logo?.x ?? 0.2,
          y: logo?.y ?? 0.2,
          scale: logo?.scale ?? 1,
          enabled: true,
        },
      });
    }
  };

  const toggleTitle = () => {
    if (title?.enabled) {
      onChange({
        title: {
          ...title,
          enabled: false,
        },
      });
    } else {
      onChange({
        title: {
          x: title?.x ?? 0.5,
          y: title?.y ?? 0.85,
          scale: title?.scale ?? 1,
          color: title?.color ?? "#ffffff",
          text_override: title?.text_override,
          enabled: true,
        },
      });
    }
  };

  const handleResetPositions = () => {
    onChange({
      episode_layout: undefined,
      logo: logo ? { ...logo, x: 0.2, y: 0.2, scale: 1 } : undefined,
      title: title ? { ...title, x: 0.5, y: 0.85, scale: 1 } : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3 pt-2 border-t border-border-subtle">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-primary">
          Title & Logo Layers
        </span>
        {(episodeLayout || logo?.enabled || title?.enabled) && (
          <button
            type="button"
            onClick={handleResetPositions}
            className="text-[11px] text-accent hover:underline cursor-pointer"
          >
            Reset element positions
          </button>
        )}
      </div>

      {/* Steam Game Logo Toggle & Scale */}
      <div className="flex flex-col gap-1.5 p-2 rounded bg-surface border border-border-subtle">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox checkbox-xs rounded border-border-subtle"
              checked={Boolean(logo?.enabled)}
              disabled={!hasLogo}
              onChange={toggleLogo}
            />
            <span>Steam game logo</span>
          </label>
          {!hasLogo && (
            <span className="text-[10px] text-text-muted">
              (No logo asset available)
            </span>
          )}
        </div>

        {logo?.enabled && (
          <>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-text-muted">Logo size</span>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.05"
                value={logo.scale || 1}
                onChange={(e) =>
                  onChange({
                    logo: {
                      ...logo,
                      scale: parseFloat(e.target.value) || 1,
                    },
                  })
                }
                className="w-32 accent-accent h-1.5 bg-white/10 rounded appearance-none cursor-pointer"
              />
            </div>
            <QuickAlignmentControl
              label="Logo"
              x={logo.x ?? 0.2}
              y={logo.y ?? 0.2}
              onChangeCoord={(newX, newY) =>
                onChange({
                  logo: {
                    ...logo,
                    x: newX,
                    y: newY,
                  },
                })
              }
            />
          </>
        )}
      </div>

      {/* Game Title Text Toggle, Override & Scale */}
      <div className="flex flex-col gap-2 p-2 rounded bg-surface border border-border-subtle">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox checkbox-xs rounded border-border-subtle"
              checked={Boolean(title?.enabled)}
              onChange={toggleTitle}
            />
            <span>Game title overlay</span>
          </label>
        </div>

        {title?.enabled && (
          <div className="flex flex-col gap-2 pt-1 animate-fadeIn">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="thumbnail-title-override-input"
                className="text-[11px] text-text-muted"
              >
                Custom title text
              </label>
              <input
                id="thumbnail-title-override-input"
                type="text"
                placeholder={defaultTitle || "Game title"}
                value={title.text_override || ""}
                onChange={(e) =>
                  onChange({
                    title: {
                      ...title,
                      text_override: e.target.value,
                    },
                  })
                }
                className="h-7 bg-background border border-border-subtle rounded px-2 text-xs text-text-primary outline-none focus:border-accent"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-text-muted">Title size</span>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.05"
                value={title.scale || 1}
                onChange={(e) =>
                  onChange({
                    title: {
                      ...title,
                      scale: parseFloat(e.target.value) || 1,
                    },
                  })
                }
                className="w-32 accent-accent h-1.5 bg-white/10 rounded appearance-none cursor-pointer"
              />
            </div>

            <QuickAlignmentControl
              label="Title"
              x={title.x ?? 0.5}
              y={title.y ?? 0.85}
              onChangeCoord={(newX, newY) =>
                onChange({
                  title: {
                    ...title,
                    x: newX,
                    y: newY,
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Episode scale slider & alignment if free positioning is active */}
      {episodeLayout && (
        <div className="flex flex-col gap-2 p-2 rounded bg-surface border border-border-subtle">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-text-secondary font-medium">
              Episode badge size
            </span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={episodeLayout.scale || 1}
              onChange={(e) =>
                onChange({
                  episode_layout: {
                    ...episodeLayout,
                    scale: parseFloat(e.target.value) || 1,
                  },
                })
              }
              className="w-32 accent-accent h-1.5 bg-white/10 rounded appearance-none cursor-pointer"
            />
          </div>
          <QuickAlignmentControl
            label="Episode"
            x={episodeLayout.x ?? 0.85}
            y={episodeLayout.y ?? 0.85}
            cornersOnly={true}
            onChangeCoord={(newX, newY) =>
              onChange({
                episode_layout: {
                  ...episodeLayout,
                  x: newX,
                  y: newY,
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}
