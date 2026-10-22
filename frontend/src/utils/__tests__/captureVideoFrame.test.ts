import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureVideoFrameDataUrl } from "../captureVideoFrame";

describe("captureVideoFrameDataUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when videoEl is null", () => {
    expect(captureVideoFrameDataUrl(null)).toBeNull();
  });

  it("returns null when videoEl.readyState is less than 2 (HAVE_CURRENT_DATA)", () => {
    const video = {
      readyState: 1, // HAVE_METADATA
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement;

    expect(captureVideoFrameDataUrl(video)).toBeNull();
  });

  it("returns null when videoEl has zero width or height", () => {
    const videoNoWidth = {
      readyState: 2,
      videoWidth: 0,
      videoHeight: 1080,
    } as HTMLVideoElement;

    const videoNoHeight = {
      readyState: 2,
      videoWidth: 1920,
      videoHeight: 0,
    } as HTMLVideoElement;

    expect(captureVideoFrameDataUrl(videoNoWidth)).toBeNull();
    expect(captureVideoFrameDataUrl(videoNoHeight)).toBeNull();
  });

  it("returns null when canvas 2D context is unavailable", () => {
    const video = {
      readyState: 4,
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement;

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(captureVideoFrameDataUrl(video)).toBeNull();
  });

  it("renders frame to 1280x720 canvas and returns jpeg data URL with default quality", () => {
    const video = {
      readyState: 4,
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement;

    const mockDrawImage = vi.fn();
    const mockToDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,mockframedata");

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId: string) => {
      if (contextId === "2d") {
        return {
          drawImage: mockDrawImage,
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(mockToDataURL);

    const result = captureVideoFrameDataUrl(video);

    expect(mockDrawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(mockToDataURL).toHaveBeenCalledWith("image/jpeg", 0.92);
    expect(result).toBe("data:image/jpeg;base64,mockframedata");
  });

  it("allows overriding jpeg quality", () => {
    const video = {
      readyState: 3,
      videoWidth: 1280,
      videoHeight: 720,
    } as HTMLVideoElement;

    const mockDrawImage = vi.fn();
    const mockToDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,customquality");

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId: string) => {
      if (contextId === "2d") {
        return {
          drawImage: mockDrawImage,
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(mockToDataURL);

    const result = captureVideoFrameDataUrl(video, 0.8);

    expect(mockDrawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(mockToDataURL).toHaveBeenCalledWith("image/jpeg", 0.8);
    expect(result).toBe("data:image/jpeg;base64,customquality");
  });
});
