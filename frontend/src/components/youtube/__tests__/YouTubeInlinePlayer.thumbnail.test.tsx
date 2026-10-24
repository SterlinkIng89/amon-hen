import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import YouTubeInlinePlayer from "../YouTubeInlinePlayer";
import { YTVideo } from "../../../types";
import * as appBackend from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UpdateYouTubeVideoMetadata: vi.fn().mockResolvedValue(undefined),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  AddVideoToPlaylist: vi.fn().mockResolvedValue(undefined),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("pl-1"),
  LoadConfig: vi.fn().mockResolvedValue({
    tag_playlist_configs: {
      Hades: {
        vod_playlist_id: "pl-hades",
        thumbnail_config: {
          enabled: true,
          source_type: "steam",
          episode_position: "bottom-right",
          episode_format: "pad2",
        },
      },
    },
  }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue("C:/images/custom.png"),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue("https://yt.com/custom_thumb.jpg"),
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue("C:/cache/thumb.jpg"),
  GetSteamAppID: vi.fn().mockResolvedValue("1145360"),
  GetSteamGameAssets: vi.fn().mockResolvedValue({
    heroUrl: "https://steam.cdn/hero.jpg",
  }),
}));

describe("YouTubeInlinePlayer thumbnail section", () => {
  const mockVideo: YTVideo = {
    id: "vid-yt-123",
    title: "Hades Ep 1",
    description: "Playing Hades",
    publishedAt: "2026-01-01T00:00:00Z",
    thumbnailUrl: "https://yt.com/thumb.jpg",
    viewCount: 150,
    likeCount: 20,
    duration: "10:00",
    privacy: "public",
    gameTag: "Hades",
    episode: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows thumbnail picker and custom file upload directly in inspector", async () => {
    render(
      <YouTubeInlinePlayer
        video={mockVideo}
        onPrev={null}
        onNext={null}
      />
    );

    // Verify thumbnail section elements are present
    expect(screen.getByText("YouTube Thumbnail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload image file/i })).toBeInTheDocument();
  });

  it("handles direct image upload via SelectCustomThumbnailImage and UpdateYouTubeThumbnail", async () => {
    const onUpdate = vi.fn();
    render(
      <YouTubeInlinePlayer
        video={mockVideo}
        onPrev={null}
        onNext={null}
        onUpdate={onUpdate}
      />
    );

    const uploadFileBtn = screen.getByRole("button", { name: /upload image file/i });
    fireEvent.click(uploadFileBtn);

    await waitFor(() => {
      expect(appBackend.SelectCustomThumbnailImage).toHaveBeenCalled();
      expect(appBackend.UpdateYouTubeThumbnail).toHaveBeenCalledWith("vid-yt-123", "C:/images/custom.png");
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("does not call UpdateYouTubeThumbnail if user cancels file dialog", async () => {
    vi.mocked(appBackend.SelectCustomThumbnailImage).mockResolvedValueOnce("");
    render(
      <YouTubeInlinePlayer
        video={mockVideo}
        onPrev={null}
        onNext={null}
      />
    );

    const uploadFileBtn = screen.getByRole("button", { name: /upload image file/i });
    fireEvent.click(uploadFileBtn);

    await waitFor(() => {
      expect(appBackend.SelectCustomThumbnailImage).toHaveBeenCalled();
      expect(appBackend.UpdateYouTubeThumbnail).not.toHaveBeenCalled();
    });
  });
});
