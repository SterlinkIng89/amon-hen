import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchThumbnailUpdate, BatchThumbnailInputItem } from "../useBatchThumbnailUpdate";
import * as appBackend from "../../../wailsjs/go/backend/App";
import * as thumbRender from "../../utils/thumbnailRender";
import * as thumbAssets from "../useThumbnailAssets";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  SaveCustomThumbnail: vi.fn(),
  UpdateYouTubeThumbnail: vi.fn(),
  GetCustomThumbnail: vi.fn(),
}));

describe("useBatchThumbnailUpdate", () => {
  const mockConfig = {
    enabled: true,
    source_type: "steam" as const,
    episode_position: "bottom-right" as const,
    episode_format: "pad2" as const,
  };

  const mockItems: BatchThumbnailInputItem[] = [
    { videoId: "v1", episode: 1, cacheKey: "yt:v1", localFile: "C:\\Videos\\Ep1.mp4" },
    { videoId: "v2", episode: 2, cacheKey: "yt:v2" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(thumbAssets, "useThumbnailAssets").mockReturnValue({
      steamAssets: null,
      loadingAssets: false,
      baseImage: {} as HTMLImageElement,
      logoImage: null,
      gameTitle: "Hades",
    });

    vi.spyOn(thumbRender, "renderTagThumbnailDataUrl").mockReturnValue("data:image/jpeg;base64,mock");
    vi.mocked(appBackend.SaveCustomThumbnail).mockResolvedValue("/cache/yt_thumbs/mock.jpg");
    vi.mocked(appBackend.GetCustomThumbnail).mockResolvedValue("/cache/yt_thumbs/mock.jpg");
    vi.mocked(appBackend.UpdateYouTubeThumbnail).mockResolvedValue("https://yt.com/thumb.jpg");
  });

  it("calculates estimated quota correctly (50 per item)", () => {
    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    expect(result.current.estimatedQuota).toBe(100);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].status).toBe("pending");
    expect(result.current.isAssetsReady).toBe(true);
  });

  it("reports isAssetsReady as false and ignores start when assets are loading or missing", async () => {
    vi.spyOn(thumbAssets, "useThumbnailAssets").mockReturnValue({
      steamAssets: null,
      loadingAssets: false,
      baseImage: null,
      logoImage: null,
      gameTitle: "Hades",
    });

    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    expect(result.current.isAssetsReady).toBe(false);

    await act(async () => {
      await result.current.start();
    });

    expect(appBackend.UpdateYouTubeThumbnail).not.toHaveBeenCalled();
  });

  it("defaults episode_position to bottom-left when config is omitted", async () => {
    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        items: mockItems,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(thumbRender.renderTagThumbnailDataUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          episode_position: "bottom-left",
        }),
      })
    );
  });

  it("runs sequential updates and synchronizes cacheKey, localFile and thumbnailUpdatedAt", async () => {
    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    // v1 has cacheKey "yt:v1" and localFile "C:\Videos\Ep1.mp4"
    // v2 has cacheKey "yt:v2"
    expect(appBackend.SaveCustomThumbnail).toHaveBeenCalledWith("yt:v1", "data:image/jpeg;base64,mock");
    expect(appBackend.SaveCustomThumbnail).toHaveBeenCalledWith("C:\\Videos\\Ep1.mp4", "data:image/jpeg;base64,mock");
    expect(appBackend.SaveCustomThumbnail).toHaveBeenCalledWith("yt:v2", "data:image/jpeg;base64,mock");

    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[0].thumbnailUpdatedAt).toBeTypeOf("number");
    expect(result.current.items[1].status).toBe("done");
    expect(result.current.items[1].thumbnailUpdatedAt).toBeTypeOf("number");
    expect(result.current.running).toBe(false);
  });

  it("processes only selected videos with startSelected", async () => {
    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    await act(async () => {
      await result.current.startSelected(["v2"]);
    });

    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledTimes(1);
    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledWith("v2", "/cache/yt_thumbs/mock.jpg");
    expect(result.current.items[0].status).toBe("pending");
    expect(result.current.items[1].status).toBe("done");
  });

  it("processes only unsynced videos and respects maxCount with startUnsynced", async () => {
    const itemsWithSynced = [
      { videoId: "v1", episode: 1, cacheKey: "yt:v1", thumbnailUpdatedAt: 1700000000 },
      { videoId: "v2", episode: 2, cacheKey: "yt:v2" },
      { videoId: "v3", episode: 3, cacheKey: "yt:v3" },
    ];

    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: itemsWithSynced,
      })
    );

    // Call startUnsynced with maxCount=1: only v2 should run, v1 is synced, v3 exceeds maxCount
    await act(async () => {
      await result.current.startUnsynced(1);
    });

    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledTimes(1);
    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledWith("v2", "/cache/yt_thumbs/mock.jpg");
    expect(result.current.items[0].status).toBe("pending");
    expect(result.current.items[1].status).toBe("done");
    expect(result.current.items[2].status).toBe("pending");
  });

  it("processes only single video with updateSingle", async () => {
    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    await act(async () => {
      await result.current.updateSingle("v1");
    });

    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledTimes(1);
    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledWith("v1", "/cache/yt_thumbs/mock.jpg");
    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[1].status).toBe("pending");
  });

  it("continues to next item when a non-quota error occurs", async () => {
    vi.mocked(appBackend.UpdateYouTubeThumbnail)
      .mockRejectedValueOnce(new Error("File corrupt"))
      .mockResolvedValueOnce("https://yt.com/thumb.jpg");

    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.items[0].status).toBe("failed");
    expect(result.current.items[0].error).toContain("File corrupt");
    expect(result.current.items[1].status).toBe("done");
  });

  it("aborts remaining items and marks them skipped when quota is exceeded", async () => {
    vi.mocked(appBackend.UpdateYouTubeThumbnail).mockRejectedValueOnce(
      new Error("YouTube API quota exceeded")
    );

    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.items[0].status).toBe("failed");
    expect(result.current.items[1].status).toBe("skipped");
    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledTimes(1);
  });

  it("retryFailed only re-runs failed items", async () => {
    vi.mocked(appBackend.UpdateYouTubeThumbnail)
      .mockRejectedValueOnce(new Error("Network glitch"))
      .mockResolvedValueOnce("https://yt.com/thumb2.jpg");

    const { result } = renderHook(() =>
      useBatchThumbnailUpdate({
        tag: "Hades",
        config: mockConfig,
        items: mockItems,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.items[0].status).toBe("failed");
    expect(result.current.items[1].status).toBe("done");

    // Clear mocks and succeed on retry
    vi.clearAllMocks();
    vi.mocked(appBackend.SaveCustomThumbnail).mockResolvedValue("/cache/yt_thumbs/mock.jpg");
    vi.mocked(appBackend.GetCustomThumbnail).mockResolvedValue("/cache/yt_thumbs/mock.jpg");
    vi.mocked(appBackend.UpdateYouTubeThumbnail).mockResolvedValue("https://yt.com/thumb1.jpg");

    await act(async () => {
      await result.current.retryFailed();
    });

    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledTimes(1);
    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[1].status).toBe("done");
  });

  it("preserves completed status and timestamp when input items re-render after completion", async () => {
    let currentInput = [...mockItems];
    const onVideoUpdated = vi.fn();
    const onCompleted = vi.fn();

    const { result, rerender } = renderHook(
      (props: { items: typeof mockItems }) =>
        useBatchThumbnailUpdate({
          tag: "Hades",
          config: mockConfig,
          items: props.items,
          onVideoUpdated,
          onCompleted,
        }),
      { initialProps: { items: currentInput } }
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[0].thumbnailUpdatedAt).toBeTypeOf("number");
    expect(onCompleted).toHaveBeenCalled();

    // Re-render with new array reference
    currentInput = [
      { ...mockItems[0], thumbnailUpdatedAt: result.current.items[0].thumbnailUpdatedAt },
      { ...mockItems[1], thumbnailUpdatedAt: result.current.items[1].thumbnailUpdatedAt },
    ];

    act(() => {
      rerender({ items: currentInput });
    });

    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[1].status).toBe("done");
    expect(result.current.items[0].thumbnailUpdatedAt).toBeGreaterThan(0);
  });
});
