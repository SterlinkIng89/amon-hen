import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchThumbnailUpdate } from "../useBatchThumbnailUpdate";
import * as appBackend from "../../../wailsjs/go/backend/App";
import * as thumbRender from "../../utils/thumbnailRender";
import * as thumbAssets from "../useThumbnailAssets";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  SaveCustomThumbnail: vi.fn(),
  UpdateYouTubeThumbnail: vi.fn(),
}));

describe("useBatchThumbnailUpdate", () => {
  const mockConfig = {
    enabled: true,
    source_type: "steam" as const,
    episode_position: "bottom-right" as const,
    episode_format: "pad2" as const,
  };

  const mockItems = [
    { videoId: "v1", episode: 1, cacheKey: "yt:v1" },
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
  });

  it("runs sequential updates through all items successfully", async () => {
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

    expect(appBackend.SaveCustomThumbnail).toHaveBeenCalledTimes(2);
    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledTimes(2);
    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[1].status).toBe("done");
    expect(result.current.running).toBe(false);
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
    vi.mocked(appBackend.UpdateYouTubeThumbnail).mockResolvedValue("https://yt.com/thumb1.jpg");

    await act(async () => {
      await result.current.retryFailed();
    });

    expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledTimes(1);
    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[1].status).toBe("done");
  });
});
