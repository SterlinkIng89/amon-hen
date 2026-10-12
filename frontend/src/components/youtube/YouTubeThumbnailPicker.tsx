import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  TagThumbnailConfig,
  EpisodeNumberPosition,
  EpisodeFormat,
  SteamGameArtwork,
} from "../../types";
import {
  GetCustomThumbnail,
  SaveCustomThumbnail,
  DeleteCustomThumbnail,
  GetSteamAppID,
  GetSteamGameAssets,
  SelectCustomThumbnailImage,
} from "../../../wailsjs/go/backend/App";
import {
  renderThumbnailToCanvas,
  resolveThumbnailImageUrl,
} from "../../utils/thumbnailGenerator";

export interface YouTubeThumbnailPickerProps {
  readonly videoPath: string;
  readonly gameTag: string;
  readonly episodeNumber: number;
  readonly tagThumbnailConfig?: TagThumbnailConfig;
  readonly onThumbnailReady?: (savedPath: string | null) => void;
  readonly onOpenTagSettings?: () => void;
}

export default function YouTubeThumbnailPicker({
  videoPath,
  gameTag,
  episodeNumber,
  tagThumbnailConfig,
  onThumbnailReady,
  onOpenTagSettings,
}: YouTubeThumbnailPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);

  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasNode(node);
  }, []);
  const [steamAssets, setSteamAssets] = useState<SteamGameArtwork | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [customThumbUrl, setCustomThumbUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Local overrides if user customizes specifically for this video
  const [localConfig, setLocalConfig] = useState<TagThumbnailConfig>(() => ({
    enabled: tagThumbnailConfig?.enabled ?? true,
    source_type: tagThumbnailConfig?.source_type ?? "steam",
    steam_asset_type: tagThumbnailConfig?.steam_asset_type ?? "header",
    custom_image_path: tagThumbnailConfig?.custom_image_path,
    episode_position: tagThumbnailConfig?.episode_position ?? "bottom-right",
    episode_format: tagThumbnailConfig?.episode_format ?? "pad2",
    font_color: tagThumbnailConfig?.font_color ?? "#ffffff",
  }));

  // Sync when tagThumbnailConfig changes
  useEffect(() => {
    if (tagThumbnailConfig) {
      setLocalConfig({
        enabled: tagThumbnailConfig.enabled,
        source_type: tagThumbnailConfig.source_type,
        steam_asset_type: tagThumbnailConfig.steam_asset_type || "header",
        custom_image_path: tagThumbnailConfig.custom_image_path,
        episode_position: tagThumbnailConfig.episode_position,
        episode_format: tagThumbnailConfig.episode_format || "pad2",
        font_color: tagThumbnailConfig.font_color || "#ffffff",
      });
    }
  }, [tagThumbnailConfig]);

  // Check if a saved custom thumbnail already exists on disk for this video
  useEffect(() => {
    if (!videoPath) return;
    GetCustomThumbnail(videoPath)
      .then((url) => {
        if (url) {
          setCustomThumbUrl(url);
          onThumbnailReady?.(url);
        } else {
          setCustomThumbUrl(null);
        }
      })
      .catch(console.error);
  }, [videoPath, onThumbnailReady]);

  // Fetch Steam assets for the game tag
  useEffect(() => {
    if (!gameTag) {
      setSteamAssets(null);
      return;
    }
    let isCancelled = false;

    GetSteamAppID(gameTag)
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
      .catch(console.error);

    return () => {
      isCancelled = true;
    };
  }, [gameTag]);

  const resolvedImageUrl = useMemo(() => {
    return resolveThumbnailImageUrl(
      localConfig.source_type,
      localConfig.custom_image_path,
      localConfig.steam_asset_type,
      steamAssets
    );
  }, [localConfig.source_type, localConfig.custom_image_path, localConfig.steam_asset_type, steamAssets]);

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

  // Re-render canvas
  useEffect(() => {
    if (!canvasNode) return;
    renderThumbnailToCanvas(canvasNode, loadedImage, {
      showEpisode: true,
      episodeNumber: episodeNumber > 0 ? episodeNumber : 1,
      episodeFormat: localConfig.episode_format || "pad2",
      position: localConfig.episode_position || "bottom-right",
      fontColor: localConfig.font_color || "#ffffff",
    });
  }, [canvasNode, loadedImage, episodeNumber, localConfig.episode_format, localConfig.episode_position, localConfig.font_color]);

  const handleSaveThumbnail = async () => {
    if (!canvasRef.current || !videoPath) return;
    setIsSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.92);
      const savedPath = await SaveCustomThumbnail(videoPath, dataUrl);
      setCustomThumbUrl(savedPath);
      onThumbnailReady?.(savedPath);
    } catch (err) {
      console.error("Failed to save custom thumbnail", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!videoPath) return;
    try {
      await DeleteCustomThumbnail(videoPath);
      setCustomThumbUrl(null);
      onThumbnailReady?.(null);
      setIsCustomizing(false);
      if (tagThumbnailConfig) {
        setLocalConfig({
          enabled: tagThumbnailConfig.enabled,
          source_type: tagThumbnailConfig.source_type,
          steam_asset_type: tagThumbnailConfig.steam_asset_type || "header",
          custom_image_path: tagThumbnailConfig.custom_image_path,
          episode_position: tagThumbnailConfig.episode_position,
          episode_format: tagThumbnailConfig.episode_format || "pad2",
          font_color: tagThumbnailConfig.font_color || "#ffffff",
        });
      }
    } catch (err) {
      console.error("Failed to reset thumbnail", err);
    }
  };

  const handleBrowseCustomImage = async () => {
    try {
      const selected = await SelectCustomThumbnailImage();
      if (selected) {
        setLocalConfig((prev) => ({
          ...prev,
          custom_image_path: selected,
          source_type: "custom",
        }));
      }
    } catch (err) {
      console.error("Failed to browse custom thumbnail", err);
    }
  };

  const positions: Array<{ id: EpisodeNumberPosition; label: string }> = [
    { id: "top-left", label: "Top Left" },
    { id: "top-right", label: "Top Right" },
    { id: "bottom-left", label: "Bottom Left" },
    { id: "bottom-right", label: "Bottom Right" },
  ];

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-md bg-[#111113] border border-white/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary">
            YouTube Thumbnail
          </span>
          {tagThumbnailConfig?.enabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
              Automated
            </span>
          )}
          {customThumbUrl && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
              Saved
            </span>
          )}
        </div>

        {onOpenTagSettings && (
          <button
            type="button"
            className="text-[11px] text-accent hover:underline cursor-pointer"
            onClick={onOpenTagSettings}
          >
            Edit tag template
          </button>
        )}
      </div>

      {tagThumbnailConfig?.enabled ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-text-muted">
            Using {gameTag} template (Episode {episodeNumber || 1}).
          </p>

          <div className="flex gap-3 items-start">
            {/* Live 16:9 Canvas Preview */}
            <div className="aspect-video w-[180px] rounded border border-white/10 overflow-hidden bg-black/60 shrink-0">
              <canvas
                ref={setCanvasRef}
                className="w-full h-full object-cover"
                width={1280}
                height={720}
              />
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <button
                type="button"
                className="btn btn-primary btn-xs text-xs py-1"
                onClick={handleSaveThumbnail}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : customThumbUrl ? "Update Thumbnail" : "Apply as YouTube Thumbnail"}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-xs text-xs py-1 text-text-muted hover:text-white"
                onClick={() => setIsCustomizing((prev) => !prev)}
              >
                {isCustomizing ? "Hide Adjustments" : "Adjust for this video"}
              </button>

              {customThumbUrl && (
                <button
                  type="button"
                  className="text-[10px] text-red-400 hover:text-red-300 text-left pt-0.5"
                  onClick={handleReset}
                >
                  Reset to tag template
                </button>
              )}
            </div>
          </div>

          {/* Optional inline adjustments for single video */}
          {isCustomizing && (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-text-secondary">
                  Position
                </span>
                <div className="flex gap-1">
                  {positions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        (localConfig.episode_position || "bottom-right") === p.id
                          ? "bg-accent/25 border-accent text-accent font-medium"
                          : "bg-[#141416] border-white/10 text-text-muted"
                      }`}
                      onClick={() =>
                        setLocalConfig((prev) => ({ ...prev, episode_position: p.id }))
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-text-secondary">
                  Format
                </span>
                <select
                  style={{ backgroundColor: "#141416", color: "#f4f4f5" }}
                  className="bg-[#141416] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent"
                  value={localConfig.episode_format}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      episode_format: e.target.value as EpisodeFormat,
                    }))
                  }
                >
                  <option value="pad2">01</option>
                  <option value="hash">#01</option>
                  <option value="ep">EP 01</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-text-secondary">
                  Color
                </span>
                <div className="flex items-center gap-1.5">
                  {["#ffffff", "#ffd600", "#ff6b00", "#ff1744", "#00e5ff", "#00e676", "#111111"].map((color) => {
                    const isSelected =
                      (localConfig.font_color || "#ffffff").toLowerCase() ===
                      color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`w-3.5 h-3.5 rounded-full border transition-transform ${
                          isSelected
                            ? "border-accent scale-110"
                            : "border-white/20 hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() =>
                          setLocalConfig((prev) => ({ ...prev, font_color: color }))
                        }
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs text-[10px] px-2 py-0.5"
                  onClick={handleBrowseCustomImage}
                >
                  Choose Different Image...
                </button>
                {localConfig.custom_image_path && (
                  <span className="text-[10px] text-text-muted truncate max-w-[120px]">
                    {localConfig.custom_image_path}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between py-1">
          <p className="text-[11px] text-text-muted">
            No automated thumbnail configured for tag "{gameTag || "None"}".
          </p>
          {onOpenTagSettings && (
            <button
              type="button"
              className="btn btn-secondary btn-xs text-xs px-2.5"
              onClick={onOpenTagSettings}
            >
              Configure Template
            </button>
          )}
        </div>
      )}
    </div>
  );
}
