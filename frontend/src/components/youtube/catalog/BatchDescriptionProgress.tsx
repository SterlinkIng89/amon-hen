import { FC, useState, useMemo, useCallback } from "react";
import { useAppStore } from "../../../store/useAppStore";
import {
  useBatchDescriptionUpdate,
  BatchDescriptionInputItem,
} from "../../../hooks/useBatchDescriptionUpdate";
import { BatchDescriptionConfirmModal } from "./BatchDescriptionConfirmModal";
import { backend } from "../../../../wailsjs/go/models";

export interface BatchDescriptionProgressProps {
  readonly playlistId?: string;
  readonly videos: readonly backend.CatalogVideoDraft[];
  readonly selectedVideoIds?: ReadonlySet<string>;
  readonly onVideoUpdated?: (videoId: string, description: string) => void;
  readonly onCompleted?: () => void;
}

interface PendingAction {
  readonly type: "all" | "selected" | "unsynced" | "unsynced-50";
  readonly targetCount: number;
  readonly quotaUnits: number;
}

export const BatchDescriptionProgress: FC<BatchDescriptionProgressProps> = ({
  playlistId,
  videos,
  selectedVideoIds,
  onVideoUpdated,
  onCompleted,
}) => {
  const { defaultVideoDescription } = useAppStore();

  const [customDescription, setCustomDescription] = useState(
    defaultVideoDescription || ""
  );

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const inputItems: readonly BatchDescriptionInputItem[] = useMemo(() => {
    return videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      currentDescription: v.description || "",
    }));
  }, [videos]);

  const {
    running,
    isDone,
    syncedCount,
    unsyncedCount,
    progress,
    start,
    startSelected,
    startUnsynced,
    retryFailed,
    cancel,
  } = useBatchDescriptionUpdate({
    playlistId,
    targetDescription: customDescription,
    items: inputItems,
    onVideoUpdated,
    onCompleted,
  });

  const selectedCount = selectedVideoIds ? selectedVideoIds.size : 0;

  const effectiveQuota = useMemo(() => {
    if (selectedCount > 0) return selectedCount * 50;
    if (unsyncedCount > 0) return unsyncedCount * 50;
    return videos.length * 50;
  }, [selectedCount, unsyncedCount, videos.length]);

  const percent =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  const isCustomModified =
    customDescription.trim() !== (defaultVideoDescription || "").trim();

  const handleResetToDefault = useCallback(() => {
    setCustomDescription(defaultVideoDescription || "");
  }, [defaultVideoDescription]);

  const handleOpenConfirm = useCallback(
    (type: PendingAction["type"]) => {
      let targetCount = 0;
      switch (type) {
        case "selected":
          targetCount = selectedCount;
          break;
        case "unsynced":
          targetCount = unsyncedCount;
          break;
        case "unsynced-50":
          targetCount = Math.min(50, unsyncedCount);
          break;
        case "all":
          targetCount = videos.length;
          break;
      }
      setPendingAction({
        type,
        targetCount,
        quotaUnits: targetCount * 50,
      });
    },
    [selectedCount, unsyncedCount, videos.length]
  );

  const handleConfirmAction = useCallback(async () => {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;

    switch (action.type) {
      case "selected":
        if (selectedVideoIds && selectedVideoIds.size > 0) {
          await startSelected(Array.from(selectedVideoIds));
        }
        break;
      case "unsynced":
        await startUnsynced();
        break;
      case "unsynced-50":
        await startUnsynced(50);
        break;
      case "all":
        await start();
        break;
    }
  }, [pendingAction, selectedVideoIds, startSelected, startUnsynced, start]);

  const handleCloseModal = useCallback(() => {
    setPendingAction(null);
  }, []);

  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-text-primary shrink-0">
            YouTube Description Batch
          </h4>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded whitespace-nowrap bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Synced: <span className="tabular-nums font-semibold">{syncedCount}</span>/{videos.length}
            </span>
            {unsyncedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded whitespace-nowrap bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Needs desc: <span className="tabular-nums font-semibold">{unsyncedCount}</span>
              </span>
            )}
            {selectedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded whitespace-nowrap bg-accent/10 text-accent border border-accent/20">
                Selected: <span className="tabular-nums font-semibold">{selectedCount}</span>
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span className="font-medium text-text-secondary">
              Description template to apply:
            </span>
            <div className="flex items-center gap-2">
              {isCustomModified && (
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  disabled={running}
                  className="text-accent hover:underline text-[10px] font-medium disabled:opacity-50"
                >
                  Use default config
                </button>
              )}
              <span className="font-mono text-[10px]">
                {customDescription.length} / 5,000
              </span>
            </div>
          </div>
          <textarea
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            disabled={running}
            rows={3}
            maxLength={5000}
            placeholder="Enter description template to apply to playlist videos..."
            className="w-full bg-elevated/40 border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-y min-h-[70px] max-h-[160px] disabled:opacity-60"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
          <p className="text-[11px] text-text-secondary">
            Estimated quota:{" "}
            <span className="font-mono text-text-primary font-medium">
              {effectiveQuota} units
            </span>{" "}
            (50 units per video)
          </p>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!running && (
              <>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenConfirm("selected")}
                    disabled={!customDescription.trim()}
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                    title={`Update description for ${selectedCount} selected videos`}
                  >
                    <span>Update selected</span>
                    <span className="font-mono text-[10px] opacity-80">
                      ({selectedCount})
                    </span>
                  </button>
                )}

                {unsyncedCount > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenConfirm("unsynced")}
                      disabled={!customDescription.trim()}
                      className={`btn btn-sm flex items-center gap-1.5 ${
                        selectedCount > 0 ? "btn-secondary" : "btn-primary"
                      }`}
                      title={`Update description for ${unsyncedCount} unsynced videos`}
                    >
                      <span>Update unsynced</span>
                      <span className="font-mono text-[10px] opacity-80">
                        ({unsyncedCount})
                      </span>
                    </button>

                    {unsyncedCount > 50 && (
                      <button
                        type="button"
                        onClick={() => handleOpenConfirm("unsynced-50")}
                        disabled={!customDescription.trim()}
                        className="btn btn-secondary btn-sm flex items-center gap-1.5"
                        title="Update next 50 unsynced videos to stay within daily API quota (2,500 units)"
                      >
                        <span>Update next 50</span>
                        <span className="font-mono text-[10px] opacity-80">
                          (2,500 units)
                        </span>
                      </button>
                    )}
                  </>
                )}

                {(unsyncedCount === 0 || selectedCount > 0) && (
                  <button
                    type="button"
                    onClick={() => handleOpenConfirm("all")}
                    disabled={videos.length === 0 || !customDescription.trim()}
                    className={`btn btn-sm ${
                      selectedCount > 0 || unsyncedCount > 0
                        ? "btn-ghost text-text-secondary hover:text-text-primary"
                        : "btn-primary"
                    }`}
                    title={
                      unsyncedCount === 0
                        ? `Re-sync description for all ${videos.length} videos`
                        : `Update description for all ${videos.length} videos`
                    }
                  >
                    {unsyncedCount === 0
                      ? `Re-sync all (${videos.length})`
                      : `Update all (${videos.length})`}
                  </button>
                )}

                {isDone && progress.failCount > 0 && (
                  <button
                    type="button"
                    onClick={retryFailed}
                    className="btn btn-secondary btn-sm"
                  >
                    Retry failed
                  </button>
                )}
              </>
            )}

            {running && (
              <button
                type="button"
                onClick={cancel}
                className="btn btn-secondary btn-sm border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {running && (
        <div className="space-y-1.5 pt-2 border-t border-border-subtle animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
              Updating video descriptions... ({progress.current}/{progress.total})
            </span>
            <span className="font-mono text-text-primary font-medium">
              {percent}%
            </span>
          </div>
          <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-accent h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {!running && isDone && (
        <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-xs text-text-secondary">
          <span>Batch description update finished</span>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            {progress.successCount > 0 && (
              <span className="text-emerald-400">
                {progress.successCount} succeeded
              </span>
            )}
            {progress.failCount > 0 && (
              <span className="text-red-400">
                {progress.failCount} failed
              </span>
            )}
          </div>
        </div>
      )}

      {pendingAction && (
        <BatchDescriptionConfirmModal
          isOpen={Boolean(pendingAction)}
          targetCount={pendingAction.targetCount}
          quotaUnits={pendingAction.quotaUnits}
          descriptionPreview={customDescription}
          onConfirm={handleConfirmAction}
          onClose={handleCloseModal}
          isUpdating={running}
        />
      )}
    </div>
  );
};
