import React from "react";
import { TagThumbnailConfig, ElementLayout, LogoLayer, TitleLayer } from "../../types";

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
          </div>
        )}
      </div>

      {/* Episode scale slider if free positioning is active */}
      {episodeLayout && (
        <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded bg-surface border border-border-subtle">
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
      )}
    </div>
  );
}
