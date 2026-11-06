import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBatchDescriptionUpdate } from "../useBatchDescriptionUpdate";
import * as AppBindings from "../../../wailsjs/go/backend/App";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  UpdateYouTubeVideoMetadata: vi.fn(),
}));

describe("useBatchDescriptionUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleItems = [
    { videoId: "v1", title: "Video 1", currentDescription: "Shared default description" },
    { videoId: "v2", title: "Video 2", currentDescription: "Different description" },
    { videoId: "v3", title: "Video 3", currentDescription: "" },
  ];

  it("computes syncedCount, unsyncedCount and estimatedQuota based on targetDescription", () => {
    const { result } = renderHook(() =>
      useBatchDescriptionUpdate({
        playlistId: "pl-1",
        targetDescription: "Shared default description",
        items: sampleItems,
      })
    );

    expect(result.current.syncedCount).toBe(1);
    expect(result.current.unsyncedCount).toBe(2);
    expect(result.current.estimatedQuota).toBe(100); // 2 unsynced * 50
    expect(result.current.running).toBe(false);
  });

  it("startUnsynced updates only unsynced videos and preserves title/privacy", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockResolvedValue(undefined as any);
    const onVideoUpdated = vi.fn();
    const onCompleted = vi.fn();

    const { result } = renderHook(() =>
      useBatchDescriptionUpdate({
        playlistId: "pl-1",
        targetDescription: "Shared default description",
        items: sampleItems,
        onVideoUpdated,
        onCompleted,
      })
    );

    await act(async () => {
      await result.current.startUnsynced();
    });

    // Only v2 and v3 should have been called (v1 was already synced)
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(2);
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v2", "", "Shared default description", "");
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v3", "", "Shared default description", "");

    expect(onVideoUpdated).toHaveBeenCalledTimes(2);
    expect(onVideoUpdated).toHaveBeenCalledWith("v2", "Shared default description");
    expect(onVideoUpdated).toHaveBeenCalledWith("v3", "Shared default description");

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(result.current.progress.successCount).toBe(2);
    expect(result.current.progress.failCount).toBe(0);
  });

  it("startUnsynced respects maxCount parameter", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockResolvedValue(undefined as any);

    const { result } = renderHook(() =>
      useBatchDescriptionUpdate({
        playlistId: "pl-1",
        targetDescription: "Shared default description",
        items: sampleItems,
      })
    );

    await act(async () => {
      await result.current.startUnsynced(1);
    });

    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(1);
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v2", "", "Shared default description", "");
  });

  it("startSelected updates only specified video IDs", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockResolvedValue(undefined as any);

    const { result } = renderHook(() =>
      useBatchDescriptionUpdate({
        playlistId: "pl-1",
        targetDescription: "Shared default description",
        items: sampleItems,
      })
    );

    await act(async () => {
      await result.current.startSelected(["v1", "v3"]);
    });

    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(2);
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v1", "", "Shared default description", "");
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v3", "", "Shared default description", "");
  });

  it("halts execution and marks remaining items as skipped when quota error occurs", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata)
      .mockRejectedValueOnce(new Error("quotaExceeded: YouTube API quota limit reached"))
      .mockResolvedValue(undefined as any);

    const { result } = renderHook(() =>
      useBatchDescriptionUpdate({
        playlistId: "pl-1",
        targetDescription: "Shared default description",
        items: sampleItems,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    // v1 fails with quota
    // v2 and v3 must be skipped without calling UpdateYouTubeVideoMetadata
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(1);

    const items = result.current.items;
    expect(items[0].status).toBe("failed");
    expect(items[0].error).toContain("quotaExceeded");
    expect(items[1].status).toBe("skipped");
    expect(items[2].status).toBe("skipped");
    expect(result.current.progress.failCount).toBe(1);
  });

  it("retryFailed re-attempts only failed items", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata)
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce(undefined as any);

    const { result } = renderHook(() =>
      useBatchDescriptionUpdate({
        playlistId: "pl-1",
        targetDescription: "Shared default description",
        items: [{ videoId: "v-fail", title: "Fail Video", currentDescription: "old" }],
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.items[0].status).toBe("failed");

    // Retry
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockResolvedValueOnce(undefined as any);
    await act(async () => {
      await result.current.retryFailed();
    });

    expect(result.current.items[0].status).toBe("done");
  });

  it("cancel halts queue processing and marks remaining as skipped", async () => {
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((res) => {
      resolveFirst = res;
    });

    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockImplementation(async (id) => {
      if (id === "v1") {
        await firstPromise;
      }
      return undefined as any;
    });

    const { result } = renderHook(() =>
      useBatchDescriptionUpdate({
        playlistId: "pl-1",
        targetDescription: "Shared default description",
        items: sampleItems,
      })
    );

    let batchPromise: Promise<void>;
    await act(async () => {
      batchPromise = result.current.start();
      result.current.cancel();
      resolveFirst!();
      await batchPromise;
    });

    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[1].status).toBe("skipped");
    expect(result.current.items[2].status).toBe("skipped");
  });
});
