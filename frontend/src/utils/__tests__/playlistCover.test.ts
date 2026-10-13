import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_COVER_CONFIG,
  generateAndUploadPlaylistCover,
} from "../playlistCover";
import * as thumbnailRender from "../thumbnailRender";
import * as appBackend from "../../../wailsjs/go/backend/App";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  SaveCustomThumbnail: vi.fn(),
  SetYouTubePlaylistThumbnail: vi.fn(),
}));

vi.spyOn(thumbnailRender, "renderPlaylistCoverDataUrl").mockReturnValue("data:image/jpeg;base64,mockCoverData");

describe("playlistCover utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports valid DEFAULT_COVER_CONFIG with bottom-right pad2 defaults", () => {
    expect(DEFAULT_COVER_CONFIG.enabled).toBe(true);
    expect(DEFAULT_COVER_CONFIG.source_type).toBe("steam");
    expect(DEFAULT_COVER_CONFIG.episode_position).toBe("bottom-right");
    expect(DEFAULT_COVER_CONFIG.episode_format).toBe("pad2");
  });

  it("orchestrates dataUrl rendering, local file save, and playlist thumbnail upload", async () => {
    vi.mocked(appBackend.SaveCustomThumbnail).mockResolvedValue("C:/cache/thumbs/mock.jpg");
    vi.mocked(appBackend.SetYouTubePlaylistThumbnail).mockResolvedValue("/cache/yt_thumbs/mock.jpg?v=1");

    const result = await generateAndUploadPlaylistCover({
      playlistId: "pl-xyz",
      baseImage: null,
      logoImage: null,
      gameTitle: "Dark Souls",
      config: null,
    });

    expect(thumbnailRender.renderPlaylistCoverDataUrl).toHaveBeenCalledWith({
      baseImage: null,
      logoImage: null,
      gameTitle: "Dark Souls",
      config: DEFAULT_COVER_CONFIG,
    });
    expect(appBackend.SaveCustomThumbnail).toHaveBeenCalledWith(
      "playlist_pl-xyz",
      "data:image/jpeg;base64,mockCoverData"
    );
    expect(appBackend.SetYouTubePlaylistThumbnail).toHaveBeenCalledWith(
      "pl-xyz",
      "C:/cache/thumbs/mock.jpg"
    );
    expect(result).toBe("/cache/yt_thumbs/mock.jpg?v=1");
  });
});
