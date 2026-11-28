import { describe, it, expect, beforeEach } from "vitest";
import {
  useAppStore,
  mergeQueueItems,
  hasActiveOrCompletedQueueEntry,
} from "../useAppStore";
import type { QueueItem } from "../../components/youtube/UploadQueue";

function makeQueueItem(
  overrides: Partial<QueueItem> & Pick<QueueItem, "id" | "videoPath">,
): QueueItem {
  return {
    videoName: overrides.videoPath.split("/").pop() || "video.mp4",
    size: 1024,
    title: "Test Video",
    description: "",
    privacy: "unlisted",
    status: "pending",
    progress: 0,
    ...overrides,
  };
}

describe("useAppStore queue deduplication", () => {
  beforeEach(() => {
    useAppStore.setState({
      queue: [],
      queueRunning: false,
      queueAddedAt: 0,
      queueDoneAt: 0,
    });
  });

  it.each(["pending", "uploading", "processing", "done"] as const)(
    "skips adding a videoPath that already exists with status %s",
    (status) => {
      const existing = makeQueueItem({
        id: "existing-1",
        videoPath: "/videos/clip1.mp4",
        status,
        progress: status === "done" ? 100 : 42,
      });
      useAppStore.getState().setQueue([existing]);

      const duplicate = makeQueueItem({
        id: "new-2",
        videoPath: "/videos/clip1.mp4",
        status: "pending",
      });

      const added = useAppStore.getState().addToQueue([duplicate]);
      const state = useAppStore.getState();

      expect(added).toEqual([]);
      expect(state.queue).toHaveLength(1);
      expect(state.queue[0].id).toBe("existing-1");
      expect(state.queue[0].status).toBe(status);
      expect(state.queueAddedAt).toBe(0);
      expect(
        hasActiveOrCompletedQueueEntry(state.queue, "/videos/clip1.mp4"),
      ).toBe(true);
    },
  );

  it.each(["error", "interrupted"] as const)(
    "replaces an existing %s entry without creating a duplicate",
    (status) => {
      const failed = makeQueueItem({
        id: "failed-1",
        videoPath: "/videos/clip1.mp4",
        status,
        error: "network timeout",
      });
      useAppStore.getState().setQueue([failed]);

      const retryItem = makeQueueItem({
        id: "retry-2",
        videoPath: "/videos/clip1.mp4",
        status: "uploading",
      });

      const added = useAppStore.getState().addToQueue([retryItem]);
      const state = useAppStore.getState();

      expect(added).toEqual(["/videos/clip1.mp4"]);
      expect(state.queue).toHaveLength(1);
      expect(state.queue[0].id).toBe("retry-2");
      expect(state.queue[0].status).toBe("uploading");
      expect(state.queueAddedAt).toBeGreaterThan(0);
    },
  );

  it("deduplicates incoming batch items by videoPath", () => {
    const first = makeQueueItem({
      id: "batch-1",
      videoPath: "/videos/a.mp4",
      status: "pending",
    });
    const dupInBatch = makeQueueItem({
      id: "batch-1-dup",
      videoPath: "/videos/a.mp4",
      status: "pending",
    });
    const second = makeQueueItem({
      id: "batch-2",
      videoPath: "/videos/b.mp4",
      status: "pending",
    });

    const added = useAppStore
      .getState()
      .addToQueue([first, dupInBatch, second]);
    const state = useAppStore.getState();

    expect(added).toEqual(["/videos/a.mp4", "/videos/b.mp4"]);
    expect(state.queue).toHaveLength(2);
    expect(state.queue.map((i) => i.id)).toEqual(["batch-1", "batch-2"]);
  });

  it("supports prepending uploading items while preserving deduplication", () => {
    const pending = makeQueueItem({
      id: "p1",
      videoPath: "/videos/p1.mp4",
      status: "pending",
    });
    const uploading = makeQueueItem({
      id: "u1",
      videoPath: "/videos/u1.mp4",
      status: "uploading",
    });

    const { nextQueue, addedPaths } = mergeQueueItems(
      [pending],
      [uploading],
      "prepend",
    );

    expect(addedPaths).toEqual(["/videos/u1.mp4"]);
    expect(nextQueue.map((i) => i.id)).toEqual(["u1", "p1"]);
  });
});
