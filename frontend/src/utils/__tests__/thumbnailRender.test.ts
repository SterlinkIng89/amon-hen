import { describe, it, expect, vi } from "vitest";
import {
  renderTagThumbnailDataUrl,
  renderPlaylistCoverDataUrl,
} from "../thumbnailRender";
import * as generator from "../thumbnailGenerator";

vi.spyOn(generator, "renderThumbnailToCanvas").mockImplementation(() => ({}));
vi.spyOn(generator, "renderPlaylistCoverToCanvas").mockImplementation(() => ({}));

describe("renderTagThumbnailDataUrl", () => {
  it("renders with showEpisode=true when episodeNumber > 0", () => {
    const fakeBase = {} as HTMLImageElement;
    const fakeLogo = {} as HTMLImageElement;

    renderTagThumbnailDataUrl({
      baseImage: fakeBase,
      logoImage: fakeLogo,
      gameTitle: "Hades",
      episodeNumber: 4,
      config: {
        enabled: true,
        source_type: "steam",
        episode_position: "bottom-right",
        episode_format: "pad2",
      },
    });

    expect(generator.renderThumbnailToCanvas).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      fakeBase,
      expect.objectContaining({
        showEpisode: true,
        episodeNumber: 4,
        episodeFormat: "pad2",
        position: "bottom-right",
      })
    );
  });

  it("falls back to position 'bottom-left' when episode_position is not specified", () => {
    renderTagThumbnailDataUrl({
      baseImage: null,
      logoImage: null,
      gameTitle: "Hades",
      episodeNumber: 1,
      config: {
        enabled: true,
        source_type: "steam",
      },
    });

    expect(generator.renderThumbnailToCanvas).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      null,
      expect.objectContaining({
        position: "bottom-left",
      })
    );
  });

  it("renders with showEpisode=false when episodeNumber <= 0", () => {
    renderTagThumbnailDataUrl({
      baseImage: null,
      logoImage: null,
      gameTitle: "Hades",
      episodeNumber: 0,
      config: {
        enabled: true,
        source_type: "steam",
        episode_position: "bottom-right",
        episode_format: "pad2",
      },
    });

    expect(generator.renderThumbnailToCanvas).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      null,
      expect.objectContaining({
        showEpisode: false,
      })
    );
  });
});

describe("renderPlaylistCoverDataUrl", () => {
  it("renders cover canvas without episode badge and returns data URL", () => {
    const fakeBase = {} as HTMLImageElement;
    const fakeLogo = {} as HTMLImageElement;

    const dataUrl = renderPlaylistCoverDataUrl({
      baseImage: fakeBase,
      logoImage: fakeLogo,
      gameTitle: "Hades",
      config: {
        enabled: true,
        source_type: "steam",
        episode_position: "bottom-right",
        episode_format: "pad2",
        logo: { x: 0.5, y: 0.5, scale: 1, enabled: true },
        title: { x: 0.5, y: 0.5, scale: 1, enabled: true, text_override: "Hades Cover" },
      },
    });

    expect(generator.renderPlaylistCoverToCanvas).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      fakeBase,
      expect.objectContaining({
        logo: expect.objectContaining({ image: fakeLogo }),
        title: expect.objectContaining({ text: "Hades Cover" }),
      })
    );
    expect(dataUrl).toBeDefined();
  });
});

