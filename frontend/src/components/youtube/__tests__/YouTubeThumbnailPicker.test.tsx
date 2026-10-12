import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import YouTubeThumbnailPicker from "../YouTubeThumbnailPicker";
import { TagThumbnailConfig } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue("C:/cache/yt_thumbs/custom.jpg"),
  DeleteCustomThumbnail: vi.fn().mockResolvedValue(undefined),
  GetSteamAppID: vi.fn().mockResolvedValue("1091500"),
  GetSteamGameAssets: vi.fn().mockResolvedValue({
    heroUrl: "https://steam.cdn/hero.jpg",
    headerUrl: "https://steam.cdn/header.jpg",
    posterUrl: "https://steam.cdn/poster.jpg",
  }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue("C:/images/custom.png"),
}));

describe("YouTubeThumbnailPicker", () => {
  const tagConfig: TagThumbnailConfig = {
    enabled: true,
    source_type: "steam",
    steam_asset_type: "hero",
    episode_position: "bottom-right",
    episode_format: "hash",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders live preview canvas with tag template and episode number", async () => {
    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/ep1.mp4"
        gameTag="Cyberpunk 2077"
        episodeNumber={1}
        tagThumbnailConfig={tagConfig}
      />
    );

    expect(screen.getByText("YouTube Thumbnail")).toBeInTheDocument();
    expect(screen.getByText(/using cyberpunk 2077 template/i)).toBeInTheDocument();
  });

  it("calls onOpenTagSettings when clicking edit template button", async () => {
    const onOpenTagSettings = vi.fn();
    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/ep1.mp4"
        gameTag="Cyberpunk 2077"
        episodeNumber={1}
        tagThumbnailConfig={tagConfig}
        onOpenTagSettings={onOpenTagSettings}
      />
    );

    const editBtn = screen.getByRole("button", { name: /edit tag template/i });
    fireEvent.click(editBtn);

    expect(onOpenTagSettings).toHaveBeenCalled();
  });
});
