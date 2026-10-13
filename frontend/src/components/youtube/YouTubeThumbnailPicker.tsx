import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  TagThumbnailConfig,
  EpisodeNumberPosition,
  EpisodeFormat,
} from "../../types";
import {
  GetCustomThumbnail,
  SaveCustomThumbnail,
  DeleteCustomThumbnail,
  SelectCustomThumbnailImage,
  UpdateYouTubeThumbnail,
} from "../../../wailsjs/go/backend/App";
import { useThumbnailAssets } from "../../hooks/useThumbnailAssets";
import ThumbnailCanvasEditor from "../ui/ThumbnailCanvasEditor";
import ThumbnailFramingControls from "../ui/ThumbnailFramingControls";
import ThumbnailElementControls from "../ui/ThumbnailElementControls";
import { renderTagThumbnailDataUrl } from "../../utils/thumbnailRender";
import {
  notifyCustomThumbChanged,
  setCachedCustomThumb,
} from "../../hooks/useThumbnailQueue";

export interface YouTubeThumbnailPickerProps {
  readonly videoPath: string;
  readonly gameTag: string;
  readonly episodeNumber: number;
  readonly tagThumbnailConfig?: TagThumbnailConfig;
  readonly onThumbnailReady?: (savedPath: string | null) => void;
  readonly onOpenTagSettings?: () => void;
  readonly youtubeId?: string;
  readonly onYouTubeUpdated?: (newThumbnailUrl: string) => void;
}

export default function YouTubeThumbnailPicker({
  videoPath,
  gameTag,
  episodeNumber,
  tagThumbnailConfig,
  onThumbnailReady,
  onOpenTagSettings,
  youtubeId,
  onYouTubeUpdated,
}: YouTubeThumbnailPickerProps) {
  const [customThumbUrl, setCustomThumbUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);

  type PushState =
    | { status: "idle" }
    | { status: "pushing" }
    | { status: "success" }
    | { status: "error"; message: string };

  const [pushState, setPushState] = useState<PushState>({ status: "idle" });

  // Local overrides if user customizes specifically for this video
  const [localConfig, setLocalConfig] = useState<TagThumbnailConfig>(() => ({
    enabled: tagThumbnailConfig?.enabled ?? true,
    source_type: tagThumbnailConfig?.source_type ?? "steam",
    steam_asset_type: tagThumbnailConfig?.steam_asset_type ?? "header",
    custom_image_path: tagThumbnailConfig?.custom_image_path,
    episode_position: tagThumbnailConfig?.episode_position ?? "bottom-right",
    episode_format: tagThumbnailConfig?.episode_format ?? "pad2",
    font_color: tagThumbnailConfig?.font_color ?? "#ffffff",
    image_framing: tagThumbnailConfig?.image_framing,
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
        image_framing: tagThumbnailConfig.image_framing,
        episode_layout: tagThumbnailConfig.episode_layout,
        logo: tagThumbnailConfig.logo,
        title: tagThumbnailConfig.title,
      });
    }
  }, [tagThumbnailConfig]);

  const [checkedDisk, setCheckedDisk] = useState(false);
  const lastGeneratedTagRef = useRef<string | null>(null);
  const userResetRef = useRef(false);
  const isAutoGeneratingRef = useRef(false);

  // Check if a saved custom thumbnail already exists on disk for this video
  useEffect(() => {
    if (!videoPath) {
      setCheckedDisk(false);
      return;
    }
    setCheckedDisk(false);
    userResetRef.current = false;
    GetCustomThumbnail(videoPath)
      .then((url) => {
        if (url) {
          setCachedCustomThumb(videoPath, url);
          setCustomThumbUrl(url);
          lastGeneratedTagRef.current = gameTag;
          onThumbnailReady?.(url);
        } else {
          setCachedCustomThumb(videoPath, null);
          setCustomThumbUrl(null);
          lastGeneratedTagRef.current = null;
        }
      })
      .catch((err) => {
        console.error(err);
        setCustomThumbUrl(null);
      })
      .finally(() => {
        setCheckedDisk(true);
      });
  }, [videoPath, onThumbnailReady]);

  // When gameTag changes, reset userResetRef so the new tag can auto-generate
  useEffect(() => {
    userResetRef.current = false;
  }, [gameTag]);

  const { steamAssets, baseImage, logoImage, gameTitle, loadingAssets } =
    useThumbnailAssets(gameTag, localConfig);

  const exportAndSave = useCallback(async (): Promise<string> => {
    const dataUrl = renderTagThumbnailDataUrl({
      baseImage,
      logoImage,
      gameTitle,
      episodeNumber: episodeNumber > 0 ? episodeNumber : 1,
      config: localConfig,
    });
    const savedPath = await SaveCustomThumbnail(videoPath, dataUrl);
    setCustomThumbUrl(savedPath);
    onThumbnailReady?.(savedPath);

    try {
      const url = await GetCustomThumbnail(videoPath);
      notifyCustomThumbChanged(videoPath, url || null);
    } catch {
      notifyCustomThumbChanged(videoPath, savedPath);
    }

    return savedPath;
  }, [
    baseImage,
    logoImage,
    gameTitle,
    episodeNumber,
    localConfig,
    videoPath,
    onThumbnailReady,
  ]);

  // Automatically generate and save thumbnail when tag is assigned or changed
  useEffect(() => {
    if (!checkedDisk || !videoPath || !gameTag.trim()) return;
    if (localConfig.enabled === false) return;
    if (loadingAssets) return;
    if (userResetRef.current) return;
    if (isAutoGeneratingRef.current) return;

    const needsGeneration =
      !customThumbUrl || lastGeneratedTagRef.current !== gameTag;

    if (needsGeneration) {
      isAutoGeneratingRef.current = true;
      lastGeneratedTagRef.current = gameTag;
      exportAndSave()
        .catch((err) => {
          console.error("Auto-generation of tag thumbnail failed:", err);
        })
        .finally(() => {
          isAutoGeneratingRef.current = false;
        });
    }
  }, [
    checkedDisk,
    videoPath,
    gameTag,
    localConfig.enabled,
    loadingAssets,
    customThumbUrl,
    exportAndSave,
  ]);

  const handleSaveThumbnail = async () => {
    if (!videoPath) return;
    setIsSaving(true);
    try {
      await exportAndSave();
    } catch (err) {
      console.error("Failed to save custom thumbnail", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePushToYouTube = async () => {
    if (!videoPath || !youtubeId) return;
    setPushState({ status: "pushing" });
    try {
      const savedPath = await exportAndSave();
      const updatedUrl = await UpdateYouTubeThumbnail(youtubeId, savedPath);
      setPushState({ status: "success" });
      onYouTubeUpdated?.(updatedUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPushState({ status: "error", message: msg });
    }
  };

  const handleReset = async () => {
    if (!videoPath) return;
    userResetRef.current = true;
    lastGeneratedTagRef.current = null;
    try {
      await DeleteCustomThumbnail(videoPath);
      setCustomThumbUrl(null);
      onThumbnailReady?.(null);
      notifyCustomThumbChanged(videoPath, null);
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
          image_framing: tagThumbnailConfig.image_framing,
          episode_layout: tagThumbnailConfig.episode_layout,
          logo: tagThumbnailConfig.logo,
          title: tagThumbnailConfig.title,
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
            <div className="w-[180px] shrink-0">
              <ThumbnailCanvasEditor
                config={localConfig}
                baseImage={baseImage}
                logoImage={logoImage}
                gameTitle={gameTitle}
                episodeNumber={episodeNumber || 1}
                onConfigChange={(patch) =>
                  setLocalConfig((prev) => ({ ...prev, ...patch }))
                }
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

              {youtubeId && (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs text-xs py-1 text-accent border border-accent/30 hover:bg-accent/10"
                  onClick={handlePushToYouTube}
                  disabled={pushState.status === "pushing"}
                >
                  {pushState.status === "pushing" ? "Updating on YouTube..." : "Update on YouTube"}
                </button>
              )}

              {pushState.status === "error" && (
                <p role="alert" className="text-[11px] text-red-400">
                  {pushState.message}
                </p>
              )}

              {pushState.status === "success" && (
                <p className="text-[11px] text-emerald-400">
                  Thumbnail updated on YouTube
                </p>
              )}

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
              {/* Framing controls */}
              <ThumbnailFramingControls
                framing={localConfig.image_framing}
                disabled={!baseImage}
                onChange={(framing) =>
                  setLocalConfig((prev) => ({ ...prev, image_framing: framing }))
                }
              />

              {/* Title & Logo layer controls */}
              <ThumbnailElementControls
                config={localConfig}
                hasLogo={Boolean(steamAssets?.logoUrl)}
                defaultTitle={gameTitle}
                onChange={(patch) =>
                  setLocalConfig((prev) => ({ ...prev, ...patch }))
                }
              />

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
