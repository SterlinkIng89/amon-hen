import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchThumbnailProgress } from "../BatchThumbnailProgress";
import { BatchItem } from "../../../../types";

describe("BatchThumbnailProgress", () => {
  const defaultItems: BatchItem[] = [
    { videoId: "v1", episode: 1, cacheKey: "c1", status: "pending", thumbnailUpdatedAt: 1700000000 },
    { videoId: "v2", episode: 2, cacheKey: "c2", status: "pending", thumbnailUpdatedAt: 0 },
  ];

  it("renders idle state with start button and estimated quota", () => {
    const onStart = vi.fn();
    render(
      <BatchThumbnailProgress
        isProcessing={false}
        isDone={false}
        items={defaultItems}
        progress={{ current: 0, total: 2, successCount: 0, failCount: 0 }}
        quotaEstimate={100}
        onStart={onStart}
        onCancel={vi.fn()}
        onRetryFailed={vi.fn()}
      />
    );

    expect(screen.getByText(/100 units/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /update all/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onStart).toHaveBeenCalled();
  });

  it("renders in-progress state with cancel button and progress count", () => {
    const onCancel = vi.fn();
    render(
      <BatchThumbnailProgress
        isProcessing={true}
        isDone={false}
        items={[
          { videoId: "v1", episode: 1, cacheKey: "c1", status: "done" },
          { videoId: "v2", episode: 2, cacheKey: "c2", status: "uploading" },
        ]}
        progress={{ current: 1, total: 2, successCount: 1, failCount: 0 }}
        quotaEstimate={100}
        onStart={vi.fn()}
        onCancel={onCancel}
        onRetryFailed={vi.fn()}
      />
    );

    expect(screen.getByText(/1 \/ 2/i)).toBeInTheDocument();
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders completed state with retry button when there are failures", () => {
    const onRetry = vi.fn();
    render(
      <BatchThumbnailProgress
        isProcessing={false}
        isDone={true}
        items={[
          { videoId: "v1", episode: 1, cacheKey: "c1", status: "done" },
          { videoId: "v2", episode: 2, cacheKey: "c2", status: "failed", error: "Upload failed" },
        ]}
        progress={{ current: 2, total: 2, successCount: 1, failCount: 1 }}
        quotaEstimate={100}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onRetryFailed={onRetry}
      />
    );

    expect(screen.getByText(/1 succeeded, 1 failed/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /retry failed/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders selective action buttons for selected and unsynced videos", () => {
    const onStartSelected = vi.fn();
    const onStartUnsynced = vi.fn();

    render(
      <BatchThumbnailProgress
        isProcessing={false}
        isDone={false}
        items={defaultItems}
        selectedVideoIds={new Set(["v2"])}
        progress={{ current: 0, total: 2, successCount: 0, failCount: 0 }}
        quotaEstimate={100}
        onStart={vi.fn()}
        onStartSelected={onStartSelected}
        onStartUnsynced={onStartUnsynced}
        onCancel={vi.fn()}
        onRetryFailed={vi.fn()}
      />
    );

    expect(screen.getByText(/Selected:/i)).toBeInTheDocument();
    const selectedBtn = screen.getByRole("button", { name: /Update selected/i });
    expect(selectedBtn).toBeInTheDocument();
    fireEvent.click(selectedBtn);
    expect(onStartSelected).toHaveBeenCalled();

    const unsyncedBtn = screen.getByRole("button", { name: /Update unsynced/i });
    expect(unsyncedBtn).toBeInTheDocument();
    fireEvent.click(unsyncedBtn);
    expect(onStartUnsynced).toHaveBeenCalledWith();
  });

  it("renders quota-safe next 50 button when unsynced count exceeds 50", () => {
    const manyItems: BatchItem[] = Array.from({ length: 60 }, (_, idx) => ({
      videoId: `vid-${idx}`,
      episode: idx + 1,
      cacheKey: `c-${idx}`,
      status: "pending",
      thumbnailUpdatedAt: 0,
    }));
    const onStartUnsynced = vi.fn();

    render(
      <BatchThumbnailProgress
        isProcessing={false}
        isDone={false}
        items={manyItems}
        progress={{ current: 0, total: 60, successCount: 0, failCount: 0 }}
        quotaEstimate={3000}
        onStart={vi.fn()}
        onStartUnsynced={onStartUnsynced}
        onCancel={vi.fn()}
        onRetryFailed={vi.fn()}
      />
    );

    const next50Btn = screen.getByRole("button", { name: /Update next 50/i });
    expect(next50Btn).toBeInTheDocument();
    fireEvent.click(next50Btn);
    expect(onStartUnsynced).toHaveBeenCalledWith(50);
  });

  it("disables start buttons and displays alert when isAssetsReady is false", () => {
    const onStart = vi.fn();
    render(
      <BatchThumbnailProgress
        isProcessing={false}
        isDone={false}
        isAssetsReady={false}
        items={defaultItems}
        progress={{ current: 0, total: 2, successCount: 0, failCount: 0 }}
        quotaEstimate={100}
        onStart={onStart}
        onCancel={vi.fn()}
        onRetryFailed={vi.fn()}
      />
    );

    expect(screen.getByText(/Thumbnail artwork assets are loading or incomplete/i)).toBeInTheDocument();
    const startBtn = screen.getByRole("button", { name: /Update all/i });
    expect(startBtn).toBeDisabled();
  });
});
