import { describe, it, expect, vi } from "vitest";
import { renderTagThumbnailDataUrl } from "../thumbnailRender";
import * as generator from "../thumbnailGenerator";

vi.spyOn(generator, "renderThumbnailToCanvas").mockImplementation(() => ({} as any));

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
