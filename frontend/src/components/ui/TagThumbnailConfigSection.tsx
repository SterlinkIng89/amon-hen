import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  TagThumbnailConfig,
  EpisodeNumberPosition,
  EpisodeFormat,
  SteamGameArtwork,
} from "../../types";
import {
  GetSteamAppID,
  GetSteamGameAssets,
  SelectCustomThumbnailImage,
} from "../../../wailsjs/go/backend/App";
import {
  renderThumbnailToCanvas,
  resolveThumbnailImageUrl,
} from "../../utils/thumbnailGenerator";

export interface TagThumbnailConfigSectionProps {
  readonly tag: string;
  readonly value?: TagThumbnailConfig;
  readonly onChange: (config: TagThumbnailConfig) => void;
}

const DEFAULT_CONFIG: TagThumbnailConfig = {
  enabled: false,
  source_type: "steam",
  steam_asset_type: "header",
  episode_position: "bottom-right",
  episode_format: "pad2",
  font_color: "#ffffff",
};

const FONT_COLORS = [
  { label: "White", value: "#ffffff" },
  { label: "Yellow", value: "#ffd600" },
  { label: "Orange", value: "#ff6b00" },
  { label: "Red", value: "#ff1744" },
  { label: "Cyan", value: "#00e5ff" },
  { label: "Green", value: "#00e676" },
  { label: "Black", value: "#111111" },
];

export default function TagThumbnailConfigSection({
  tag,
  value,
  onChange,
}: TagThumbnailConfigSectionProps) {
  const config: TagThumbnailConfig = {
    ...DEFAULT_CONFIG,
    ...value,
    source_type: value?.source_type || DEFAULT_CONFIG.source_type,
    steam_asset_type: value?.steam_asset_type || DEFAULT_CONFIG.steam_asset_type,
    episode_position: value?.episode_position || DEFAULT_CONFIG.episode_position,
    episode_format: value?.episode_format || DEFAULT_CONFIG.episode_format,
    font_color: value?.font_color || DEFAULT_CONFIG.font_color,
  };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);

  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasNode(node);
  }, []);
  const [steamAssets, setSteamAssets] = useState<SteamGameArtwork | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  // Fetch Steam assets whenever tag changes
  useEffect(() => {
    if (!tag) {
      setSteamAssets(null);
      return;
    }
    let isCancelled = false;
    setLoadingAssets(true);

    GetSteamAppID(tag)
      .then((appId) => {
        if (isCancelled) return;
        if (appId && appId !== "NOT_FOUND") {
          return GetSteamGameAssets(appId);
        }
        return null;
      })
      .then((assets) => {
        if (!isCancelled && assets) {
          setSteamAssets(assets);
        }
      })
      .catch((err) => {
        console.error("Failed to load Steam assets for tag:", tag, err);
      })
      .finally(() => {
        if (!isCancelled) setLoadingAssets(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [tag]);

  const resolvedImageUrl = React.useMemo(() => {
    return resolveThumbnailImageUrl(
      config.source_type,
      config.custom_image_path,
      config.steam_asset_type,
      steamAssets
    );
  }, [config.source_type, config.custom_image_path, config.steam_asset_type, steamAssets]);

  // Preload image element for canvas
  useEffect(() => {
    if (!resolvedImageUrl) {
      setLoadedImage(null);
      return;
    }
    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = resolvedImageUrl;
    img.onload = () => {
      if (!isCancelled) setLoadedImage(img);
    };
    img.onerror = () => {
      if (!isCancelled) setLoadedImage(null);
    };
    return () => {
      isCancelled = true;
    };
  }, [resolvedImageUrl]);

  // Render to canvas
  useEffect(() => {
    if (!canvasNode || !config.enabled) return;
    renderThumbnailToCanvas(canvasNode, loadedImage, {
      showEpisode: true,
      episodeNumber: 1,
      episodeFormat: config.episode_format || "pad2",
      position: config.episode_position || "bottom-right",
      fontColor: config.font_color || "#ffffff",
    });
  }, [canvasNode, config.enabled, loadedImage, config.episode_format, config.episode_position, config.font_color]);

  const update = (patch: Partial<TagThumbnailConfig>) => {
    onChange({
      ...DEFAULT_CONFIG,
      ...config,
      ...patch,
    });
  };

  const handleBrowseCustomImage = async () => {
    try {
      const selected = await SelectCustomThumbnailImage();
      if (selected) {
        update({ custom_image_path: selected, source_type: "custom" });
      }
    } catch (err) {
      console.error("Failed to browse custom thumbnail image", err);
    }
  };

  const positions: Array<{ id: EpisodeNumberPosition; label: string }> = [
    { id: "top-left", label: "Top Left" },
    { id: "top-right", label: "Top Right" },
    { id: "bottom-left", label: "Bottom Left" },
    { id: "bottom-right", label: "Bottom Right" },
  ];

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-white/5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-text-primary flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox checkbox-xs rounded border-white/20"
              checked={config.enabled}
              onChange={(e) => {
                const isEnabled = e.target.checked;
                if (isEnabled) {
                  update({
                    enabled: true,
                    source_type: config.source_type || "steam",
                    steam_asset_type: config.steam_asset_type || "header",
                    episode_position: config.episode_position || "bottom-right",
                    episode_format: config.episode_format || "pad2",
                    font_color: config.font_color || "#ffffff",
                  });
                } else {
                  update({ enabled: false });
                }
              }}
            />
            <span>Automate YouTube thumbnail for this tag</span>
          </label>
        </div>
      </div>

      {config.enabled && (
        <div className="flex flex-col gap-3.5 pl-6 animate-fadeIn">
          {/* Source Tabs */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Artwork Source
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`h-8 flex items-center justify-center text-xs font-medium rounded border transition-colors ${
                  config.source_type === "steam"
                    ? "bg-accent/20 border-accent text-accent"
                    : "bg-[#141416] border-white/10 text-text-muted hover:text-white"
                }`}
                onClick={() => update({ source_type: "steam" })}
              >
                Steam Artwork
              </button>
              <button
                type="button"
                className={`h-8 flex items-center justify-center text-xs font-medium rounded border transition-colors ${
                  config.source_type === "custom"
                    ? "bg-accent/20 border-accent text-accent"
                    : "bg-[#141416] border-white/10 text-text-muted hover:text-white"
                }`}
                onClick={() => update({ source_type: "custom" })}
              >
                Custom Image
              </button>
            </div>
          </div>

          {/* Steam Asset Sub-picker */}
          {config.source_type === "steam" && (
            <div className="flex flex-col gap-1.5">
              {loadingAssets ? (
                <span className="text-[11px] text-text-muted">
                  Searching Steam artwork for "{tag}"...
                </span>
              ) : steamAssets ? (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className={`h-10 flex items-center justify-center text-center px-1 text-[11px] leading-tight rounded border transition-colors ${
                      (config.steam_asset_type || "header") === "header"
                        ? "bg-white/15 border-white/30 text-white font-medium"
                        : "bg-[#141416] border-white/10 text-text-muted hover:text-white"
                    }`}
                    onClick={() => update({ steam_asset_type: "header" })}
                  >
                    Header Capsule
                  </button>
                  <button
                    type="button"
                    className={`h-10 flex items-center justify-center text-center px-1 text-[11px] leading-tight rounded border transition-colors ${
                      (config.steam_asset_type || "header") === "hero"
                        ? "bg-white/15 border-white/30 text-white font-medium"
                        : "bg-[#141416] border-white/10 text-text-muted hover:text-white"
                    }`}
                    onClick={() => update({ steam_asset_type: "hero" })}
                  >
                    Hero (16:9)
                  </button>
                  <button
                    type="button"
                    className={`h-10 flex items-center justify-center text-center px-1 text-[11px] leading-tight rounded border transition-colors ${
                      (config.steam_asset_type || "header") === "poster"
                        ? "bg-white/15 border-white/30 text-white font-medium"
                        : "bg-[#141416] border-white/10 text-text-muted hover:text-white"
                    }`}
                    onClick={() => update({ steam_asset_type: "poster" })}
                  >
                    Cover Poster
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-text-muted bg-white/5 rounded p-2">
                  No Steam artwork found for "{tag}". You can choose "Custom Image" to upload your own artwork.
                </div>
              )}
            </div>
          )}

          {/* Custom Image File picker */}
          {config.source_type === "custom" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-8 btn btn-secondary btn-xs text-xs px-2.5 flex items-center justify-center"
                  onClick={handleBrowseCustomImage}
                >
                  Choose Image File...
                </button>
                <span className="text-[11px] text-text-muted truncate max-w-[220px]">
                  {config.custom_image_path || "No file selected"}
                </span>
              </div>
            </div>
          )}

          {/* Episode Position */}
          <div className="flex flex-col gap-1.5 pt-1">
            <label className="text-xs font-medium text-text-secondary">
              Episode Position
            </label>
            <div className="grid grid-cols-2 gap-2">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  className={`h-8 flex items-center justify-center text-center px-2 text-xs font-medium rounded border transition-colors ${
                    (config.episode_position || "bottom-right") === pos.id
                      ? "bg-accent/25 border-accent text-accent"
                      : "bg-[#141416] border-white/10 text-text-muted hover:text-white"
                  }`}
                  onClick={() => update({ episode_position: pos.id })}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {/* Episode Format Selector */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="episode-format-select"
              className="text-xs font-medium text-text-secondary"
            >
              Episode Format
            </label>
            <select
              id="episode-format-select"
              style={{ backgroundColor: "#141416", color: "#f4f4f5" }}
              className="h-8 w-full bg-[#141416] border border-white/10 rounded px-2.5 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
              value={config.episode_format}
              onChange={(e) =>
                update({ episode_format: e.target.value as EpisodeFormat })
              }
            >
              <option value="pad2">01 (Double digit e.g. 01, 02)</option>
              <option value="hash">#01 (e.g. #01, #02)</option>
              <option value="ep">EP 01 (e.g. EP 01, EP 02)</option>
            </select>
          </div>

          {/* Episode Font Color */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                Number Color
              </label>
              <span className="text-[10px] text-text-muted font-mono">
                {config.font_color || "#ffffff"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                {FONT_COLORS.map((c) => {
                  const isSelected =
                    (config.font_color || "#ffffff").toLowerCase() ===
                    c.value.toLowerCase();
                  return (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      className={`w-7 h-7 rounded-full border-2 transition-transform flex items-center justify-center ${
                        isSelected
                          ? "border-accent scale-110"
                          : "border-white/20 hover:border-white/50 hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => update({ font_color: c.value })}
                    >
                      {isSelected && (
                        <div
                          className={`w-2 h-2 rounded-full ${
                            c.value === "#ffffff" ||
                            c.value === "#ffd600" ||
                            c.value === "#00e5ff"
                              ? "bg-black"
                              : "bg-white"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Native color picker for custom color */}
              <label
                className="w-7 h-7 rounded-full border border-white/20 hover:border-white/50 flex items-center justify-center cursor-pointer relative overflow-hidden bg-white/5 shrink-0"
                title="Custom Color"
              >
                <input
                  type="color"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  value={config.font_color || "#ffffff"}
                  onChange={(e) => update({ font_color: e.target.value })}
                />
                <span className="text-[11px] text-text-muted font-bold">+</span>
              </label>
            </div>
          </div>

          {/* Live Preview Canvas */}
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-xs font-medium text-text-secondary">
              Thumbnail Preview
            </span>
            <div className="aspect-video w-full max-w-[280px] rounded border border-white/10 overflow-hidden bg-black/60 relative">
              <canvas
                ref={setCanvasRef}
                className="w-full h-full object-cover"
                width={1280}
                height={720}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
