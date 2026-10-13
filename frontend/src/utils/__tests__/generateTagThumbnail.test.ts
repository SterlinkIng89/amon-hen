import { describe, it, expect, vi, beforeEach } from "vitest";
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
    name: "Control Resonant",
  }),
  GetTagPlaylistConfig: vi.fn().mockResolvedValue({
    thumbnail_config: {
      enabled: true,
      source_type: "steam",
      episode_position: "bottom-right",
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

describe("generateAndSaveTagThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTagThumbnailAssetCache();
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
});
