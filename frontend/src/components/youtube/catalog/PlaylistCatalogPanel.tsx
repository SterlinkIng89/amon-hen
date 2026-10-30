import { FC, useState, useMemo, useEffect, useRef } from "react";
import { usePlaylistCatalog } from "../../../hooks/usePlaylistCatalog";
import {
  useBatchThumbnailUpdate,
  BatchThumbnailInputItem,
} from "../../../hooks/useBatchThumbnailUpdate";
import { useThumbnailAssets } from "../../../hooks/useThumbnailAssets";
import { PlaylistCatalogRow } from "./PlaylistCatalogRow";
import { PlaylistEpisodeTable } from "./PlaylistEpisodeTable";
import { BatchThumbnailProgress } from "./BatchThumbnailProgress";
import {
  GetAllGameTags,
  GetSteamAppID,
  GetTagPlaylistConfig,
  SaveCustomThumbnail,
  SetTagThumbnailConfig,
} from "../../../../wailsjs/go/backend/App";
import { backend } from "../../../../wailsjs/go/models";
import { BatchItem, TagThumbnailConfig } from "../../../types";
import { parseTagThumbnailConfig } from "../../../utils/tagConfigParser";
import { renderTagThumbnailDataUrl } from "../../../utils/thumbnailRender";
import TagThumbnailConfigSection from "../../ui/TagThumbnailConfigSection";
import ThumbnailCanvasEditor from "../../ui/ThumbnailCanvasEditor";
import { getTagBadgeStyle } from "../../../utils/tagColors";

export const PlaylistCatalogPanel: FC = () => {
  const {
    playlists,
    isLoadingPlaylists,
    loadError,
    loadPlaylists,
    selectedPlaylistId,
    draft,
    isLoadingDraft,
    draftError,
    selectPlaylist,
    reloadDraft,
    updateVideoThumbnail,
    updatePlaylistTemplatePreview,
    editedTag,
    setEditedTag,
    editedEpisodes,
    setEpisode,
    hasConflicts,
    canApply,
    isApplying,
    applyError,
    applySuccess,
    applyCatalog,
    autoNumberByDate,
    autoNumberByOrder,
    reverseEpisodes,
  } = usePlaylistCatalog();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterUnlinkedOnly, setFilterUnlinkedOnly] = useState(false);
  const [updateLocal, setUpdateLocal] = useState(true);
  const [matchedSteamAppId, setMatchedSteamAppId] = useState<string | null>(null);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

  // Reset video selection and preview when selected playlist changes
  useEffect(() => {
    setSelectedVideoIds(new Set());
    setPreviewVideoId(null);
  }, [selectedPlaylistId]);

  // Fetch known game tags for autocomplete
  useEffect(() => {
    let active = true;
    void GetAllGameTags()
      .then((tags) => {
        if (active && Array.isArray(tags)) {
          setKnownTags(tags);
        }
      })
      .catch(() => {
        if (active) setKnownTags([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Tag thumbnail configuration state
  const [thumbConfig, setThumbConfig] = useState<TagThumbnailConfig>({
    enabled: true,
    source_type: "steam",
    steam_asset_type: "header",
    episode_position: "bottom-left",
    episode_format: "pad2",
    font_color: "#ffffff",
  });
  const [isConfigCustomized, setIsConfigCustomized] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);

  // Check Steam App ID when editedTag changes
  useEffect(() => {
    let active = true;
    if (!editedTag.trim()) {
      setMatchedSteamAppId(null);
      return;
    }
    void GetSteamAppID(editedTag.trim())
      .then((appId) => {
        if (active) {
          setMatchedSteamAppId(appId && appId !== "NOT_FOUND" && appId !== "0" && appId !== "" ? appId : null);
        }
      })
      .catch(() => {
        if (active) setMatchedSteamAppId(null);
      });
    return () => {
      active = false;
    };
  }, [editedTag]);

  // Load tag thumbnail configuration whenever editedTag changes
  useEffect(() => {
    let active = true;
    const tag = editedTag.trim();
    if (!tag) {
      setIsConfigCustomized(false);
      return;
    }

    void GetTagPlaylistConfig(tag)
      .then((cfg) => {
        if (!active) return;
        const parsed = parseTagThumbnailConfig(cfg?.thumbnail_config);
        if (parsed) {
          setThumbConfig({
            ...parsed,
            enabled: true,
          });
          setIsConfigCustomized(true);
        } else {
          setThumbConfig({
            enabled: true,
            source_type: "steam",
            steam_asset_type: "header",
            episode_position: "bottom-left",
            episode_format: "pad2",
            font_color: "#ffffff",
          });
          setIsConfigCustomized(false);
        }
      })
      .catch(() => {
        if (active) setIsConfigCustomized(false);
      });

    return () => {
      active = false;
    };
  }, [editedTag]);

  const handleSaveThumbnailTemplate = async () => {
    const tag = editedTag.trim();
    if (!tag) return;
    setIsSavingTemplate(true);
    setTemplateSaveSuccess(false);
    setTemplateSaveError(null);
    try {
      await SetTagThumbnailConfig(
        tag,
        backend.TagThumbnailConfig.createFrom(thumbConfig)
      );
      setIsConfigCustomized(true);
      setTemplateSaveSuccess(true);
      setTimeout(() => setTemplateSaveSuccess(false), 3000);

      let previewDataUrl = "";
      if (baseImage) {
        try {
          previewDataUrl = renderTagThumbnailDataUrl({
            baseImage,
            logoImage,
            gameTitle,
            episodeNumber: sampleEpisode,
            config: thumbConfig,
          });
          await SaveCustomThumbnail("tag_template_" + tag.toLowerCase(), previewDataUrl);
        } catch (renderErr: unknown) {
          console.warn("[PlaylistCatalogPanel] Failed to render tag template preview:", renderErr);
        }
      }

      updatePlaylistTemplatePreview(tag, previewDataUrl);
      void loadPlaylists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTemplateSaveError(msg);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Sample episode for thumbnail preview (previewVideoId or defaults to first video's episode or 1)
  const sampleEpisode = useMemo(() => {
    if (!draft?.videos || draft.videos.length === 0) return 1;
    if (previewVideoId) {
      const previewVid = draft.videos.find((v) => v.videoId === previewVideoId);
      if (previewVid) {
        return editedEpisodes[previewVid.videoId] ?? previewVid.episode ?? 1;
      }
    }
    const firstVid = draft.videos[0];
    return editedEpisodes[firstVid.videoId] ?? firstVid.episode ?? 1;
  }, [draft?.videos, editedEpisodes, previewVideoId]);

  // Load preview assets for the current tag and thumbnail configuration
  const {
    baseImage,
    logoImage,
    gameTitle,
    loadingAssets: isLoadingAssets,
  } = useThumbnailAssets(editedTag.trim(), thumbConfig);

  // Filtered playlists
  const filteredPlaylists = useMemo(() => {
    return playlists.filter((pl) => {
      if (filterUnlinkedOnly && pl.linked) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return pl.title.toLowerCase().includes(q) || pl.tag.toLowerCase().includes(q);
      }
      return true;
    });
  }, [playlists, filterUnlinkedOnly, searchQuery]);

  // Prepare batch items for thumbnail updates with localFile and thumbnailUpdatedAt
  const batchItems: BatchThumbnailInputItem[] = useMemo(() => {
    if (!draft?.videos) return [];
    return draft.videos.map((vid) => {
      const ep = editedEpisodes[vid.videoId] ?? vid.episode ?? 1;
      return {
        videoId: vid.videoId,
        episode: ep,
        cacheKey: `${vid.videoId}_${ep}`,
        localFile: vid.localFile,
        thumbnailUpdatedAt: vid.thumbnailUpdatedAt,
      };
    });
  }, [draft?.videos, editedEpisodes]);

  const {
    items: currentBatchItems,
    running: isBatchProcessing,
    isAssetsReady,
    start: startBatch,
    startSelected,
    startUnsynced,
    updateSingle,
    cancel: cancelBatch,
    retryFailed,
    estimatedQuota,
  } = useBatchThumbnailUpdate({
    tag: editedTag.trim(),
    config: thumbConfig,
    items: batchItems,
    onVideoUpdated: (videoId, newThumbUrl) => {
      updateVideoThumbnail(videoId, newThumbUrl);
    },
    onCompleted: () => {
      void loadPlaylists();
      void reloadDraft();
    },
  });

  const isBatchDone = useMemo(() => {
    return (
      !isBatchProcessing &&
      currentBatchItems.length > 0 &&
      currentBatchItems.some((i) => i.status !== "pending")
    );
  }, [isBatchProcessing, currentBatchItems]);

  const batchProgress = useMemo(() => {
    const total = currentBatchItems.length;
    const current = currentBatchItems.filter((i) => i.status !== "pending").length;
    const successCount = currentBatchItems.filter((i) => i.status === "done").length;
    const failCount = currentBatchItems.filter((i) => i.status === "failed").length;
    return { current, total, successCount, failCount };
  }, [currentBatchItems]);

  // Resolve VOD and Clip playlist IDs for 1:1 playlist cover generator
  const isCurrentVod = draft?.kind === "vod";
  const isCurrentClip = draft?.kind === "clip";
  const tagVodPlaylist = playlists.find(
    (p) => p.tag === editedTag.trim() && p.kind === "vod"
  );
  const tagClipPlaylist = playlists.find(
    (p) => p.tag === editedTag.trim() && p.kind === "clip"
  );
  const vodPlaylistId = isCurrentVod ? draft?.playlistId : tagVodPlaylist?.playlistId;
  const clipPlaylistId = isCurrentClip ? draft?.playlistId : tagClipPlaylist?.playlistId;

  return (
    <div className="flex h-full w-full bg-base overflow-hidden">
      {/* Master List Pane (Sidebar) */}
      <div className="w-[320px] 2xl:w-[350px] shrink-0 border-r border-border-subtle flex flex-col bg-surface z-10">
        <div className="p-3 border-b border-border-subtle bg-surface space-y-2">
          <div className="relative group">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors pointer-events-none"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search playlists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-elevated/40 border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setFilterUnlinkedOnly(!filterUnlinkedOnly)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                filterUnlinkedOnly
                  ? "bg-accent/15 text-accent border-accent/40"
                  : "bg-elevated/50 text-text-secondary border-border-subtle hover:text-text-primary hover:bg-elevated"
              }`}
            >
              Unlinked only
            </button>
            <span className="text-text-muted text-[11px] font-mono">
              {filteredPlaylists.length} of {playlists.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
          {isLoadingPlaylists && playlists.length === 0 && (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {loadError && (
            <div className="p-4 text-xs text-center text-red-400">
              {loadError}
            </div>
          )}
          {!isLoadingPlaylists && filteredPlaylists.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted text-xs">
              <p>No playlists found.</p>
            </div>
          )}
          {filteredPlaylists.map((pl, idx) => {
            const pId = pl.playlistId || `pl-${idx}`;
            return (
              <PlaylistCatalogRow
                key={pId}
                playlist={pl}
                isSelected={selectedPlaylistId === pId}
                onSelect={() => void selectPlaylist(pId)}
              />
            );
          })}
        </div>
      </div>

      {/* Detail Pane */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-base custom-scrollbar">
        {!selectedPlaylistId && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
            <div className="w-12 h-12 rounded-full bg-elevated/50 flex items-center justify-center mb-3 text-text-muted">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <p className="font-semibold text-text-primary text-sm">Select a playlist to map game tag and episodes</p>
            <p className="text-xs text-text-secondary mt-1 max-w-sm">
              Link YouTube playlists with game artwork from Steam and maintain consistent episode numbering between YouTube and your local library.
            </p>
          </div>
        )}

        {selectedPlaylistId && isLoadingDraft && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {selectedPlaylistId && draftError && (
          <div className="flex-1 flex items-center justify-center p-8 text-xs text-red-400">
            {draftError}
          </div>
        )}

        {selectedPlaylistId && !isLoadingDraft && draft && (
          <div className="p-6 w-full space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border-subtle pb-4">
              <div>
                <h3 className="text-base font-bold text-text-primary">{draft.title}</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {draft.videoCount} {draft.videoCount === 1 ? "video" : "videos"} in playlist
                </p>
              </div>
              <div>
                {draft.linked ? (
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border"
                    style={getTagBadgeStyle(draft.tag)}
                  >
                    Linked to {draft.tag}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-surface text-text-muted border border-border-subtle">
                    Unlinked
                  </span>
                )}
              </div>
            </div>

            {/* Responsive Two-Column Studio Layout (Adapts from mobile to ultrawide) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 2xl:grid-cols-12 gap-6 items-start">
              {/* Left Column: Metadata & Episode Mapping */}
              <div className="xl:col-span-7 2xl:col-span-7 3xl:col-span-8 space-y-4">
                {/* Game Tag Mapping */}
                <div className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-text-primary">Game Tag Mapping</h4>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="w-full sm:w-72">
                      <input
                        type="text"
                        list="catalog-known-tags"
                        value={editedTag}
                        onChange={(e) => setEditedTag(e.target.value)}
                        placeholder="Enter game tag (e.g. control)"
                        className="w-full bg-elevated/60 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors font-mono"
                      />
                      <datalist id="catalog-known-tags">
                        {knownTags.map((tag) => (
                          <option key={tag} value={tag} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex items-center gap-2">
                      {matchedSteamAppId ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2a10 10 0 0 0-10 10c0 4.42 2.87 8.17 6.84 9.5l2.6-3.77A3.48 3.48 0 0 1 11 16.5c0-.98.4-1.87 1.05-2.51L10.3 11.2A5.5 5.5 0 0 1 12 11c3.04 0 5.5 2.46 5.5 5.5 0 2.22-1.32 4.13-3.21 4.97l2.67 3.87A10 10 0 0 0 22 12a10 10 0 0 0-10-10z" />
                          </svg>
                          Steam matched: AppID {matchedSteamAppId}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-elevated/50 text-text-secondary border border-border-subtle">
                          No Steam match found
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Episode Mapping Table */}
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-text-primary">Episode Mapping</h4>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      Verify episode numbering, select rows for thumbnail updates, or preview in the template studio.
                    </p>
                  </div>

                  {hasConflicts && (
                    <div className="p-3 text-xs bg-fire-dim text-red-400 border border-border-fire rounded-xl">
                      Please resolve duplicate or invalid episode numbers before saving.
                    </div>
                  )}

                  <PlaylistEpisodeTable
                    videos={draft.videos || []}
                    episodes={editedEpisodes}
                    onEpisodeChange={setEpisode}
                    batchItems={currentBatchItems}
                    selectedVideoIds={selectedVideoIds}
                    onSelectionChange={setSelectedVideoIds}
                    previewVideoId={previewVideoId}
                    onSelectPreviewVideo={setPreviewVideoId}
                    onUpdateSingleVideo={updateSingle}
                    isBatchRunning={isBatchProcessing}
                    isAssetsReady={isAssetsReady}
                    onAutoNumberByDate={autoNumberByDate}
                    onAutoNumberByOrder={autoNumberByOrder}
                    onReverseEpisodes={reverseEpisodes}
                  />
                </div>

                {/* Save Actions */}
                <div className="bg-surface border border-border-subtle rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <label htmlFor="update-local-checkbox" className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      id="update-local-checkbox"
                      checked={updateLocal}
                      onChange={(e) => setUpdateLocal(e.target.checked)}
                      className="rounded border-border-subtle text-accent focus:ring-accent bg-elevated"
                    />
                    Sync game tag and episode numbers to matched local library videos
                  </label>

                  <div className="flex items-center gap-3">
                    {applyError && (
                      <span className="text-xs text-red-400 font-medium">
                        {applyError}
                      </span>
                    )}
                    {applySuccess && (
                      <span className="text-xs text-emerald-400 font-medium">
                        Playlist saved &amp; linked!
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => void applyCatalog(updateLocal)}
                      disabled={!canApply || isApplying}
                      className="btn btn-primary btn-sm px-4 py-2 font-semibold"
                    >
                      {isApplying ? "Saving..." : "Save & link playlist"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Thumbnail Studio & Batch Execution */}
              <div className="xl:col-span-5 2xl:col-span-5 3xl:col-span-4 space-y-4 xl:sticky xl:top-4">
                {/* Template Preview Card */}
                <div className="bg-surface border border-border-subtle rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-primary">Thumbnail Studio</span>
                      {isConfigCustomized ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border"
                          style={getTagBadgeStyle(editedTag.trim())}
                        >
                          Customized for {editedTag.trim()}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-elevated/80 text-text-muted border border-border-subtle">
                          Default template
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowTemplateEditor((prev) => !prev)}
                      className="btn btn-secondary btn-xs flex items-center gap-1.5 font-medium"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`transition-transform duration-200 ${showTemplateEditor ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      {showTemplateEditor ? "Hide editor" : "Customize"}
                    </button>
                  </div>

                  <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border-subtle shadow-sm shrink-0 flex items-center justify-center">
                    <ThumbnailCanvasEditor
                      config={thumbConfig}
                      baseImage={baseImage}
                      logoImage={logoImage}
                      gameTitle={gameTitle}
                      episodeNumber={sampleEpisode}
                      onConfigChange={(patch) =>
                        setThumbConfig((prev) => ({ ...prev, ...patch, enabled: true }))
                      }
                    />
                    {isLoadingAssets && (
                      <div className="absolute inset-0 flex items-center justify-center bg-base/60 backdrop-blur-xs pointer-events-none">
                        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {!isLoadingAssets && !baseImage && (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-text-muted bg-base/80 pointer-events-none">
                        No artwork loaded
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="bg-elevated/40 border border-border-subtle rounded-lg p-2.5">
                      <span className="text-[11px] font-semibold text-text-muted block">Artwork source</span>
                      <span className="text-text-primary font-medium mt-0.5 block truncate">
                        {thumbConfig.source_type === "custom"
                          ? "Custom image"
                          : `Steam: ${
                              thumbConfig.steam_asset_type === "hero"
                                ? "Hero (16:9)"
                                : thumbConfig.steam_asset_type === "poster"
                                ? "Cover Poster"
                                : "Header Capsule"
                            }`}
                      </span>
                    </div>

                    <div className="bg-elevated/40 border border-border-subtle rounded-lg p-2.5">
                      <span className="text-[11px] font-semibold text-text-muted block">Episode badge</span>
                      <span className="text-text-primary font-medium mt-0.5 block truncate">
                        {thumbConfig.episode_format === "hash"
                          ? "#01"
                          : thumbConfig.episode_format === "ep"
                          ? "EP 01"
                          : thumbConfig.episode_format === "number"
                          ? "1"
                          : "01 (Double digit)"}{" "}
                        • {thumbConfig.episode_position.replace("-", " ")}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-text-secondary">
                    Previewing Episode #{sampleEpisode}. Click any row's thumbnail in the table to preview that episode.
                  </p>

                  {/* Collapsible Template Editor */}
                  {showTemplateEditor && (
                    <div className="border-t border-border-subtle pt-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                        <h5 className="text-xs font-semibold text-text-primary">
                          Template Editor for "{editedTag.trim()}"
                        </h5>

                        <div className="flex items-center gap-3">
                          {templateSaveSuccess && (
                            <span className="text-xs text-emerald-400 font-medium">
                              Template saved!
                            </span>
                          )}
                          {templateSaveError && (
                            <span className="text-xs text-red-400 font-medium">
                              {templateSaveError}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleSaveThumbnailTemplate()}
                            disabled={isSavingTemplate || !editedTag.trim()}
                            className="btn btn-primary btn-xs px-3 font-semibold"
                          >
                            {isSavingTemplate ? "Saving..." : "Save Template"}
                          </button>
                        </div>
                      </div>

                      <TagThumbnailConfigSection
                        tag={editedTag.trim()}
                        value={thumbConfig}
                        onChange={setThumbConfig}
                        vodPlaylistId={vodPlaylistId}
                        clipPlaylistId={clipPlaylistId}
                        onPlaylistCoverUpdated={() => {
                          void loadPlaylists();
                        }}
                        hidePreviewCanvas={true}
                      />
                    </div>
                  )}
                </div>

                {/* Batch Thumbnail Execution Progress */}
                <BatchThumbnailProgress
                  isProcessing={isBatchProcessing}
                  isDone={isBatchDone}
                  isAssetsReady={isAssetsReady}
                  items={currentBatchItems}
                  selectedVideoIds={selectedVideoIds}
                  progress={batchProgress}
                  quotaEstimate={estimatedQuota}
                  onStart={() => void startBatch()}
                  onStartSelected={() => void startSelected(Array.from(selectedVideoIds))}
                  onStartUnsynced={(max) => void startUnsynced(max)}
                  onCancel={cancelBatch}
                  onRetryFailed={() => void retryFailed()}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
