import { FC, useMemo, useState, useEffect } from "react";
import { VideoFile, BatchItem, TagThumbnailConfig } from "../../types";
import { useBatchThumbnailUpdate } from "../../hooks/useBatchThumbnailUpdate";
import { BatchThumbnailProgress } from "../youtube/catalog/BatchThumbnailProgress";
import { GetTagPlaylistConfig } from "../../../wailsjs/go/backend/App";
import { parseTagThumbnailConfig } from "../../utils/tagConfigParser";

interface BulkThumbnailModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly tag: string;
  readonly videos: VideoFile[];
  readonly onCompleted?: () => void;
}

export const BulkThumbnailModal: FC<BulkThumbnailModalProps> = ({
  isOpen,
  onClose,
  tag,
  videos,
  onCompleted,
}) => {
  const [tagConfig, setTagConfig] = useState<TagThumbnailConfig | undefined>();

  useEffect(() => {
    let active = true;
    if (!tag) {
      setTagConfig(undefined);
      return;
    }
    void GetTagPlaylistConfig(tag)
      .then((cfg) => {
        if (active) {
          setTagConfig(parseTagThumbnailConfig(cfg?.thumbnail_config));
        }
      })
      .catch(() => {
        if (active) setTagConfig(undefined);
      });
    return () => {
      active = false;
    };
  }, [tag]);

  const batchItems: BatchItem[] = useMemo(() => {
    return videos
      .filter((v) => Boolean(v.youtubeId))
      .map((v) => ({
        videoId: v.youtubeId!,
        episode: v.episode || 1,
        cacheKey: `${v.youtubeId}_${v.episode || 1}`,
        status: "pending",
      }));
  }, [videos]);

  const {
    items: currentBatchItems,
    running: isBatchProcessing,
    start: startBatch,
    cancel: cancelBatch,
    retryFailed,
    estimatedQuota,
  } = useBatchThumbnailUpdate({
    tag,
    config: tagConfig,
    items: batchItems,
    onCompleted,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-surface border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div>
            <h3 className="text-sm font-bold text-text-primary">
              Update YouTube Thumbnails
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Tag: <span className="font-mono text-accent">{tag}</span> ({batchItems.length} videos)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm text-text-muted hover:text-text-primary text-xs"
          >
            ✕
          </button>
        </div>

        <BatchThumbnailProgress
          isProcessing={isBatchProcessing}
          isDone={isBatchDone}
          items={currentBatchItems}
          progress={batchProgress}
          quotaEstimate={estimatedQuota}
          onStart={() => void startBatch()}
          onCancel={cancelBatch}
          onRetryFailed={() => void retryFailed()}
        />
      </div>
    </div>
  );
};
