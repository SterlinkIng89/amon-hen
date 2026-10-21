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
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue("https://yt.com/thumb_up.jpg"),
}));

vi.mock("../../../hooks/useThumbnailQueue", () => ({
  notifyCustomThumbChanged: vi.fn(),
  setCachedCustomThumb: vi.fn(),
  subscribeCustomThumb: vi.fn().mockReturnValue(() => {}),
}));

describe("YouTubeThumbnailPicker", () => {
  const tagConfig: TagThumbnailConfig = {
    enabled: true,
    source_type: "steam",
    steam_asset_type: "hero",
    episode_position: "bottom-right",
    episode_format: "hash",
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { GetCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValue("");
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

  it("defaults episode_position to bottom-left when tagThumbnailConfig has no position", () => {
    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/ep1.mp4"
        gameTag="Cyberpunk 2077"
        episodeNumber={1}
        tagThumbnailConfig={{ enabled: true, source_type: "steam" }}
      />
    );

    const adjustBtn = screen.getByRole("button", { name: /adjust for this video/i });
    fireEvent.click(adjustBtn);

    const bottomLeftBtn = screen.getByRole("button", { name: "Bottom Left" });
    expect(bottomLeftBtn).toHaveClass("text-accent");
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

  it("does not render 'Update on YouTube' button when youtubeId is missing", () => {
    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/ep1.mp4"
        gameTag="Cyberpunk 2077"
        episodeNumber={1}
        tagThumbnailConfig={tagConfig}
      />
    );

    expect(screen.queryByRole("button", { name: /update on youtube/i })).not.toBeInTheDocument();
  });

  it("renders 'Update on YouTube' button and handles save, push, and success callback", async () => {
    const onYouTubeUpdated = vi.fn();
    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/ep1.mp4"
        gameTag="Cyberpunk 2077"
        episodeNumber={1}
        tagThumbnailConfig={tagConfig}
        youtubeId="yt-vid-999"
        onYouTubeUpdated={onYouTubeUpdated}
      />
    );

    const pushBtn = screen.getByRole("button", { name: /update on youtube/i });
    expect(pushBtn).toBeInTheDocument();

    fireEvent.click(pushBtn);

    await waitFor(() => {
      expect(onYouTubeUpdated).toHaveBeenCalledWith("https://yt.com/thumb_up.jpg");
    });
  });

  it("calls notifyCustomThumbChanged when saving custom thumbnail", async () => {
    const { notifyCustomThumbChanged } = await import(
      "../../../hooks/useThumbnailQueue"
    );
    const { GetCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValue(
      "/cache/yt_thumbs/custom_saved.jpg",
    );

    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/ep1.mp4"
        gameTag="Cyberpunk 2077"
        episodeNumber={1}
        tagThumbnailConfig={tagConfig}
      />,
    );

    const saveBtn = screen.getByRole("button", {
      name: /apply as youtube thumbnail/i,
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(notifyCustomThumbChanged).toHaveBeenCalledWith(
        "C:/videos/ep1.mp4",
        "/cache/yt_thumbs/custom_saved.jpg",
      );
    });
  });

  it("calls notifyCustomThumbChanged with null when resetting custom thumbnail", async () => {
    const { notifyCustomThumbChanged } = await import(
      "../../../hooks/useThumbnailQueue"
    );
    const { GetCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValue(
      "/cache/yt_thumbs/custom_saved.jpg",
    );

    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/ep1.mp4"
        gameTag="Cyberpunk 2077"
        episodeNumber={1}
        tagThumbnailConfig={tagConfig}
      />,
    );

    const resetBtn = await screen.findByRole("button", {
      name: /reset to tag template/i,
    });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(notifyCustomThumbChanged).toHaveBeenCalledWith(
        "C:/videos/ep1.mp4",
        null,
      );
    });
  });

  it("automatically generates and saves thumbnail when video has no custom thumbnail and tag is provided", async () => {
    const { SaveCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );

    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/new_video.mp4"
        gameTag="Control Resonant"
        episodeNumber={1}
        tagThumbnailConfig={tagConfig}
      />,
    );

    await waitFor(() => {
      expect(SaveCustomThumbnail).toHaveBeenCalled();
    });
  });

  it("updates thumbnail and calls onThumbnailReady when subscribeCustomThumb fires", async () => {
    let subscriberCallback: ((url: string | null) => void) | null = null;
    const { subscribeCustomThumb } = await import(
      "../../../hooks/useThumbnailQueue"
    );
    vi.mocked(subscribeCustomThumb).mockImplementation((_path, cb) => {
      subscriberCallback = cb;
      return () => {};
    });

    const onReady = vi.fn();
    render(
      <YouTubeThumbnailPicker
        videoPath="C:/videos/test_sub.mp4"
        gameTag=""
        episodeNumber={0}
        onThumbnailReady={onReady}
      />,
    );

    expect(subscriberCallback).toBeDefined();
    if (subscriberCallback) {
      (subscriberCallback as (url: string | null) => void)(
        "C:/cache/yt_thumbs/new_frame.jpg",
      );
    }

    expect(onReady).toHaveBeenCalledWith("C:/cache/yt_thumbs/new_frame.jpg");
  });
});

