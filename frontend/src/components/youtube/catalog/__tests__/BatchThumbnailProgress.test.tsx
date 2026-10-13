import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchThumbnailProgress } from "../BatchThumbnailProgress";
import { BatchItem } from "../../../../types";

describe("BatchThumbnailProgress", () => {
  const defaultItems: BatchItem[] = [
    { videoId: "v1", episode: 1, cacheKey: "c1", status: "pending" },
    { videoId: "v2", episode: 2, cacheKey: "c2", status: "pending" },
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
    const btn = screen.getByRole("button", { name: /update all thumbnails on youtube/i });
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
});
