import { describe, it, expect, vi } from "vitest";
import {
  getCachedCustomThumb,
  setCachedCustomThumb,
  subscribeCustomThumb,
  notifyCustomThumbChanged,
} from "../useThumbnailQueue";

describe("useThumbnailQueue - Custom Thumbnail Cache & PubSub", () => {
  it("returns undefined for uncached video paths", () => {
    expect(getCachedCustomThumb("/path/to/uncached_video.mp4")).toBeUndefined();
  });

  it("stores and retrieves custom thumbnail URL and null (negative cache)", () => {
    const pathA = "/path/to/video_a.mp4";
    const pathB = "/path/to/video_b.mp4";

    setCachedCustomThumb(pathA, "/cache/yt_thumbs/abc.jpg");
    setCachedCustomThumb(pathB, null);

    expect(getCachedCustomThumb(pathA)).toBe("/cache/yt_thumbs/abc.jpg");
    expect(getCachedCustomThumb(pathB)).toBeNull();
  });

  it("notifies subscribers when notifyCustomThumbChanged is called with cache-busting param", () => {
    const path = "/path/to/video_subscribed.mp4";
    const listener = vi.fn();

    const unsubscribe = subscribeCustomThumb(path, listener);

    notifyCustomThumbChanged(path, "/cache/yt_thumbs/xyz.jpg");

    expect(listener).toHaveBeenCalledTimes(1);
    const calledUrl = listener.mock.calls[0][0];
    expect(calledUrl).toMatch(/^\/cache\/yt_thumbs\/xyz\.jpg\?v=\d+$/);
    expect(getCachedCustomThumb(path)).toBe(calledUrl);

    unsubscribe();
  });

  it("notifies subscribers with null when custom thumbnail is deleted/cleared", () => {
    const path = "/path/to/video_reset.mp4";
    const listener = vi.fn();

    const unsubscribe = subscribeCustomThumb(path, listener);

    notifyCustomThumbChanged(path, null);

    expect(listener).toHaveBeenCalledWith(null);
    expect(getCachedCustomThumb(path)).toBeNull();

    unsubscribe();
  });

  it("does not notify unsubscribed listeners", () => {
    const path = "/path/to/video_unsub.mp4";
    const listener = vi.fn();

    const unsubscribe = subscribeCustomThumb(path, listener);
    unsubscribe();

    notifyCustomThumbChanged(path, "/cache/yt_thumbs/new.jpg");

    expect(listener).not.toHaveBeenCalled();
  });
});
