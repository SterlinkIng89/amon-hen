import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateAndSaveTagThumbnail,
  getTagThumbnailAssets,
  clearTagThumbnailAssetCache,
} from "../generateTagThumbnail";
import * as appBackend from "../../../wailsjs/go/backend/App";
import * as thumbQueue from "../../hooks/useThumbnailQueue";
import * as thumbRender from "../thumbnailRender";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue("/cache/yt_thumbs/saved.jpg"),
  GetSteamAppID: vi.fn().mockResolvedValue("12345"),
  GetSteamGameAssets: vi.fn().mockResolvedValue({
    headerUrl: "https://steam.cdn/header.jpg",
    logoUrl: "https://steam.cdn/logo.png",
    posterUrl: "https://steam.cdn/poster.jpg",
    heroUrl: "https://steam.cdn/hero.jpg",
    title: "Control Resonant",
  }),
  GetTagPlaylistConfig: vi.fn().mockResolvedValue({
    thumbnail_config: {
      enabled: true,
      source_type: "steam",
      episode_position: "bottom-left",
      episode_format: "pad2",
    },
  }),
}));

vi.mock("../../hooks/useThumbnailQueue", () => ({
  notifyCustomThumbChanged: vi.fn(),
}));

vi.mock("../thumbnailRender", () => ({
  renderTagThumbnailDataUrl: vi.fn().mockReturnValue("data:image/jpeg;base64,mockdata"),
}));

class MockImage {
  private _src = "";
  crossOrigin = "";
  complete = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  get src(): string {
    return this._src;
  }

  set src(val: string) {
    this._src = val;
    queueMicrotask(() => {
      if (val.includes("fail") || val.includes("error")) {
        this.complete = false;
        this.onerror?.();
      } else {
        this.complete = true;
        this.onload?.();
      }
    });
  }
}

describe("generateAndSaveTagThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTagThumbnailAssetCache();
    vi.stubGlobal("Image", MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null if videoPath or tag is empty", async () => {
    expect(
      await generateAndSaveTagThumbnail({ videoPath: "", tag: "Control" })
    ).toBeNull();
    expect(
      await generateAndSaveTagThumbnail({ videoPath: "/path/vid.mp4", tag: "" })
    ).toBeNull();
  });

  it("returns existing thumbnail if overwrite is false and thumbnail exists", async () => {
    vi.mocked(appBackend.GetCustomThumbnail).mockResolvedValueOnce(
      "/cache/yt_thumbs/existing.jpg"
    );

    const res = await generateAndSaveTagThumbnail({
      videoPath: "/path/vid.mp4",
      tag: "Control Resonant",
      overwrite: false,
    });

    expect(res).toBe("/cache/yt_thumbs/existing.jpg");
    expect(appBackend.SaveCustomThumbnail).not.toHaveBeenCalled();
  });

  it("generates and saves thumbnail when tag is added to video", async () => {
    vi.mocked(appBackend.GetCustomThumbnail)
      .mockResolvedValueOnce("") // initial check
      .mockResolvedValueOnce("/cache/yt_thumbs/saved.jpg"); // after save check

    const res = await generateAndSaveTagThumbnail({
      videoPath: "/path/vid.mp4",
      tag: "Control Resonant",
      episodeNumber: 1,
    });

    expect(appBackend.GetSteamAppID).toHaveBeenCalledWith("Control Resonant");
    expect(thumbRender.renderTagThumbnailDataUrl).toHaveBeenCalled();
    expect(appBackend.SaveCustomThumbnail).toHaveBeenCalledWith(
      "/path/vid.mp4",
      "data:image/jpeg;base64,mockdata"
    );
    expect(thumbQueue.notifyCustomThumbChanged).toHaveBeenCalledWith(
      "/path/vid.mp4",
      "/cache/yt_thumbs/saved.jpg"
    );
    expect(res).toBe("/cache/yt_thumbs/saved.jpg");
  });

  it("passes correct episode number (e.g. 14) and 0 to renderTagThumbnailDataUrl", async () => {
    vi.mocked(appBackend.GetCustomThumbnail)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("/cache/yt_thumbs/saved14.jpg");

    await generateAndSaveTagThumbnail({
      videoPath: "/path/vid.mp4",
      tag: "Control Resonant",
      episodeNumber: 14,
    });

    expect(thumbRender.renderTagThumbnailDataUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeNumber: 14,
      })
    );

    vi.mocked(appBackend.GetCustomThumbnail)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("/cache/yt_thumbs/saved0.jpg");

    await generateAndSaveTagThumbnail({
      videoPath: "/path/vid2.mp4",
      tag: "Control Resonant",
      episodeNumber: 0,
    });

    expect(thumbRender.renderTagThumbnailDataUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeNumber: 0,
        config: expect.objectContaining({
          episode_position: "bottom-left",
        }),
      })
    );
  });

  it("does not generate thumbnail if config has enabled=false", async () => {
    const res = await generateAndSaveTagThumbnail({
      videoPath: "/path/vid.mp4",
      tag: "Control Resonant",
      config: {
        enabled: false,
        source_type: "steam",
        episode_position: "bottom-right",
        episode_format: "pad2",
      },
    });

    expect(res).toBeNull();
    expect(appBackend.SaveCustomThumbnail).not.toHaveBeenCalled();
  });

  it("reuses asset cache when called consecutively for same tag", async () => {
    await getTagThumbnailAssets("Control Resonant");
    await getTagThumbnailAssets("Control Resonant");

    expect(appBackend.GetSteamAppID).toHaveBeenCalledTimes(1);
  });

  it("falls back to headerUrl when primary asset fails to load", async () => {
    vi.mocked(appBackend.GetSteamAppID).mockResolvedValueOnce("12345");
    vi.mocked(appBackend.GetSteamGameAssets).mockResolvedValueOnce({
      heroUrl: "https://steam.cdn/hero_fail.jpg",
      headerUrl: "https://steam.cdn/header.jpg",
      posterUrl: "https://steam.cdn/poster.jpg",
      logoUrl: "https://steam.cdn/logo.png",
      title: "Control Resonant",
    });

    const assets = await getTagThumbnailAssets("Control Resonant", {
      enabled: true,
      source_type: "steam",
      steam_asset_type: "hero",
      episode_position: "bottom-left",
      episode_format: "pad2",
    });

    expect(assets.baseImage).not.toBeNull();
    expect(assets.baseImage?.src).toBe("https://steam.cdn/header.jpg");
  });

  it("evicts cacheKey from assetCache when baseImage is null, allowing retry", async () => {
    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue("12345");
    vi.mocked(appBackend.GetSteamGameAssets).mockResolvedValue({
      headerUrl: "https://steam.cdn/header_fail.jpg",
      heroUrl: "https://steam.cdn/hero_fail.jpg",
      posterUrl: "https://steam.cdn/poster_fail.jpg",
      logoUrl: "https://steam.cdn/logo.png",
      title: "Control Resonant",
    });

    const first = await getTagThumbnailAssets("Control Resonant");
    expect(first.baseImage).toBeNull();
    expect(appBackend.GetSteamAppID).toHaveBeenCalledTimes(1);

    vi.mocked(appBackend.GetSteamGameAssets).mockResolvedValue({
      headerUrl: "https://steam.cdn/header_success.jpg",
      heroUrl: "https://steam.cdn/hero_success.jpg",
      posterUrl: "https://steam.cdn/poster_success.jpg",
      logoUrl: "https://steam.cdn/logo.png",
      title: "Control Resonant",
    });

    const second = await getTagThumbnailAssets("Control Resonant");
    expect(appBackend.GetSteamAppID).toHaveBeenCalledTimes(2);
    expect(second.baseImage).not.toBeNull();
    expect(second.baseImage?.src).toBe("https://steam.cdn/header_success.jpg");
  });
});
