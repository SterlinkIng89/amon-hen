import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import VideoPill from "../VideoPill";
import { YTVideo, VideoFile } from "../../../types";

// Mock Wails backend App calls
vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetThumbnail: vi.fn().mockResolvedValue(""),
  GetVideoPreview: vi.fn().mockResolvedValue(""),
  GetVideoDuration: vi.fn().mockResolvedValue(0),
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../hooks/useInView", () => ({
  useInView: vi.fn().mockReturnValue(true),
}));

const mockVideo: YTVideo = {
  id: "test-vid-1",
  title: "Episode 10 - Boss Fight",
  description: "Test description",
  publishedAt: "2026-01-01T00:00:00Z",
  thumbnailUrl: "https://example.com/thumb.jpg",
  viewCount: 1500,
  likeCount: 120,
  duration: "PT10M15S",
  privacy: "public",
  localFile: "",
};

describe("VideoPill Duplicate Indicator", () => {
  it("renders duplicate badge when duplicateCount > 1 in grid view", () => {
    render(<VideoPill video={mockVideo} duplicateCount={2} viewMode="grid" />);

    const badge = screen.getByText("Duplicate (2x)");
    expect(badge).toBeInTheDocument();
  });

  it("renders duplicate badge when duplicateCount > 1 in list view", () => {
    render(<VideoPill video={mockVideo} duplicateCount={3} viewMode="list" />);

    const badge = screen.getByText("Duplicate (3x)");
    expect(badge).toBeInTheDocument();
  });

  it("does not render duplicate badge when duplicateCount is undefined or <= 1", () => {
    const { rerender } = render(
      <VideoPill video={mockVideo} viewMode="grid" />,
    );
    expect(screen.queryByText(/Duplicate/i)).not.toBeInTheDocument();

    rerender(
      <VideoPill video={mockVideo} duplicateCount={1} viewMode="grid" />,
    );
    expect(screen.queryByText(/Duplicate/i)).not.toBeInTheDocument();
  });
});

describe("VideoPill Monetization and Status Indicator", () => {
  it("does not render status indicator for healthy monetized YT video with no issues", () => {
    const monetizedVid: YTVideo = {
      ...mockVideo,
      monetizationStatus: "monetized",
    };
    render(<VideoPill video={monetizedVid} viewMode="grid" />);
    expect(screen.queryByTestId("video-status-badge")).not.toBeInTheDocument();
  });

  it("renders demonetized / issue indicator when video has copyright issues", () => {
    const copyrightVid: YTVideo = {
      ...mockVideo,
      monetizationStatus: "demonetized",
      rejectionReason: "copyright",
      statusIssues: ["rejected", "copyright"],
    };
    render(<VideoPill video={copyrightVid} viewMode="list" />);
    const badge = screen.getByTestId("video-status-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Demonetized • Copyright claim");
    expect(badge.className).toContain("text-rose-500");
  });
});

describe("VideoPill Title Placeholder Highlighting", () => {
  const localVideo = {
    name: "2026-08-26 14-30-00.mp4",
    path: "/videos/2026-08-26 14-30-00.mp4",
    size: 104857600,
    modTime: 1787754600000,
    folder: "/videos",
    game: "Overwatch 2",
  };

  const gameProfiles = {
    "Overwatch 2": {
      type: "multiplayer",
      titleTemplate: "{game} - {event} - {gamemode} - {date}",
      modes: ["Quick Play", "Competitive"],
    },
  };

  it("highlights unfilled 'Title' and 'Mode' placeholders with amber badge style", () => {
    const unfilledVideo = {
      ...localVideo,
      event: "",
      gameMode: "",
    };

    render(
      <VideoPill
        video={unfilledVideo}
        gameProfiles={gameProfiles}
        viewMode="grid"
      />,
    );

    const titlePlaceholder = screen.getByText("Title");
    const modePlaceholder = screen.getByText("Mode");

    expect(titlePlaceholder).toBeInTheDocument();
    expect(titlePlaceholder.className).toContain("text-amber-400");
    expect(modePlaceholder).toBeInTheDocument();
    expect(modePlaceholder.className).toContain("text-amber-400");
  });

  it("highlights only unfilled placeholders when some fields are filled", () => {
    const partiallyFilledVideo = {
      ...localVideo,
      event: "Grand Finals",
      gameMode: "",
    };

    render(
      <VideoPill
        video={partiallyFilledVideo}
        gameProfiles={gameProfiles}
        viewMode="list"
      />,
    );

    const eventText = screen.getByText("Grand Finals");
    const modePlaceholder = screen.getByText("Mode");

    expect(eventText).toBeInTheDocument();
    expect(eventText.className).not.toContain("text-amber-400");
    expect(modePlaceholder).toBeInTheDocument();
    expect(modePlaceholder.className).toContain("text-amber-400");
  });

  it("does not highlight when all variables are filled", () => {
    const filledVideo = {
      ...localVideo,
      event: "Grand Finals",
      gameMode: "Competitive",
    };

    render(
      <VideoPill
        video={filledVideo}
        gameProfiles={gameProfiles}
        viewMode="grid"
      />,
    );

    expect(screen.getByText("Grand Finals")).toBeInTheDocument();
    expect(screen.getByText("Competitive")).toBeInTheDocument();
    expect(screen.queryByText("Title")).not.toBeInTheDocument();
    expect(screen.queryByText("Mode")).not.toBeInTheDocument();
  });
});

describe("VideoPill Delete Action & Top Overlay Alignment", () => {
  it("renders delete button within top overlay when onDelete is provided", () => {
    const onDelete = vi.fn();
    const onSelectToggle = vi.fn();
    render(
      <VideoPill
        video={mockVideo}
        onDelete={onDelete}
        onSelectToggle={onSelectToggle}
        viewMode="grid"
      />,
    );

    const deleteBtn = screen.getByRole("button", {
      name: /delete video from youtube/i,
    });
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn.className).toContain("w-5");
    expect(deleteBtn.className).toContain("h-5");
    expect(deleteBtn.className).toContain("rounded");

    const selectBtn = screen.getByRole("button", { name: /select video/i });
    expect(selectBtn).toBeInTheDocument();
    expect(selectBtn.className).toContain("w-5");
    expect(selectBtn.className).toContain("h-5");
    expect(selectBtn.className).toContain("rounded");
  });

  it("triggers onDelete without firing card onClick or selectToggle", () => {
    const onDelete = vi.fn();
    const onSelectToggle = vi.fn();
    const onClick = vi.fn();
    render(
      <VideoPill
        video={mockVideo}
        onDelete={onDelete}
        onSelectToggle={onSelectToggle}
        onClick={onClick}
        viewMode="grid"
      />,
    );

    const deleteBtn = screen.getByRole("button", {
      name: /delete video from youtube/i,
    });
    fireEvent.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSelectToggle).not.toHaveBeenCalled();
  });
});

describe("VideoPill Custom Thumbnail Integration", () => {
  const localVideo: VideoFile = {
    name: "Episode_01.mp4",
    path: "/videos/game/Episode_01.mp4",
    size: 1048576,
    modTime: 1700000000,
    folder: "game",
    game: "Elden Ring",
    durationSecs: 3600,
  };

  it("displays custom thumbnail when GetCustomThumbnail returns a valid URL", async () => {
    const { GetCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValueOnce(
      "/cache/yt_thumbs/custom_1.jpg",
    );

    render(
      <VideoPill
        video={{ ...localVideo, path: "/videos/game/custom_thumb_1.mp4" }}
        viewMode="grid"
      />,
    );

    await vi.waitFor(() => {
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/cache/yt_thumbs/custom_1.jpg");
    });
  });

  it("falls back to extracted video frame thumbnail when no custom thumbnail is present", async () => {
    const { GetCustomThumbnail, GetThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValueOnce("");
    vi.mocked(GetThumbnail).mockResolvedValueOnce("/cache/thumbs/extracted_1.jpg");

    render(
      <VideoPill
        video={{ ...localVideo, path: "/videos/game/fallback.mp4" }}
        viewMode="grid"
      />,
    );

    await vi.waitFor(() => {
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/cache/thumbs/extracted_1.jpg");
    });
  });

  it("preserves hover frame scrubbing sprite when custom thumbnail is active", async () => {
    const { GetCustomThumbnail, GetVideoPreview } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValueOnce(
      "/cache/yt_thumbs/custom_sprite.jpg",
    );
    vi.mocked(GetVideoPreview).mockResolvedValueOnce(
      "/cache/previews/sprite_1.jpg",
    );

    const { container } = render(
      <VideoPill
        video={{ ...localVideo, path: "/videos/game/sprite_test.mp4" }}
        viewMode="grid"
      />,
    );

    const card = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(card);

    // Hover triggers preview sprite loading and renders sprite div
    await vi.waitFor(() => {
      const spriteDiv = container.querySelector(
        'div[style*="background-image"]',
      );
      expect(spriteDiv).not.toBeNull();
      expect(spriteDiv?.getAttribute("style")).toContain(
        "/cache/previews/sprite_1.jpg",
      );
    });

    // Moving mouse across thumbnail container recalculates sprite background position
    const thumbArea = container.querySelector(
      ".relative.bg-black",
    ) as HTMLElement;
    expect(thumbArea).not.toBeNull();

    // Mock getBoundingClientRect for width 200
    vi.spyOn(thumbArea, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 112,
      bottom: 112,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.mouseMove(thumbArea, { clientX: 100 });
    const spriteDiv = container.querySelector(
      'div[style*="background-image"]',
    ) as HTMLElement;
    expect(spriteDiv.style.backgroundPosition).not.toBe("0% 0%");
  });

  it("updates instantly when notifyCustomThumbChanged is broadcasted", async () => {
    const { GetCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValueOnce("");

    const videoToUpdate = { ...localVideo, path: "/videos/game/notify_test.mp4" };
    render(<VideoPill video={videoToUpdate} viewMode="grid" />);

    const { notifyCustomThumbChanged } = await import(
      "../../../hooks/useThumbnailQueue"
    );
    notifyCustomThumbChanged(
      videoToUpdate.path,
      "/cache/yt_thumbs/updated_notify.jpg",
    );

    await vi.waitFor(() => {
      const img = screen.getByRole("img");
      expect(img.getAttribute("src")).toContain(
        "/cache/yt_thumbs/updated_notify.jpg?v=",
      );
    });
  });

  it("reverts back to extracted thumbnail when custom thumbnail is deleted (null notified)", async () => {
    const { GetCustomThumbnail, GetThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockResolvedValueOnce(
      "/cache/yt_thumbs/to_delete.jpg",
    );
    vi.mocked(GetThumbnail).mockResolvedValueOnce("/cache/thumbs/extracted_orig.jpg");

    const videoToDelete = { ...localVideo, path: "/videos/game/delete_test.mp4" };
    render(<VideoPill video={videoToDelete} viewMode="grid" />);

    await vi.waitFor(() => {
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/cache/yt_thumbs/to_delete.jpg");
    });

    const { notifyCustomThumbChanged } = await import(
      "../../../hooks/useThumbnailQueue"
    );
    notifyCustomThumbChanged(videoToDelete.path, null);

    await vi.waitFor(() => {
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/cache/thumbs/extracted_orig.jpg");
    });
  });

  it("does not call GetCustomThumbnail for YouTube videos", async () => {
    const { GetCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(GetCustomThumbnail).mockClear();

    render(<VideoPill video={mockVideo} viewMode="grid" />);

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", mockVideo.thumbnailUrl);
    expect(GetCustomThumbnail).not.toHaveBeenCalled();
  });

  it("falls back to youtubeId_episode thumbnail when localPath has no custom thumbnail", async () => {
    const { GetCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    const videoWithYtId: VideoFile = {
      ...localVideo,
      path: "/videos/game/bulk_thumb_video.mp4",
      youtubeId: "yt123456",
      episode: 3,
    };

    vi.mocked(GetCustomThumbnail).mockImplementation(async (key: string) => {
      if (key === videoWithYtId.path) return "";
      if (key === "yt123456_3") return "/cache/yt_thumbs/bulk_rendered.jpg";
      return "";
    });

    render(<VideoPill video={videoWithYtId} viewMode="grid" />);

    await vi.waitFor(() => {
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/cache/yt_thumbs/bulk_rendered.jpg");
    });
  });
});

describe("VideoPill Content Type Thumbnail Badge", () => {
  const clipVideo: VideoFile = {
    name: "clip-sample.mp4",
    path: "/videos/clip-sample.mp4",
    size: 5242880,
    modTime: 1787754600000,
    folder: "/videos",
    game: "Test Game",
    durationSecs: 45,
    contentType: "clip",
  };

  const vodVideo: VideoFile = {
    name: "vod-sample.mp4",
    path: "/videos/vod-sample.mp4",
    size: 524288000,
    modTime: 1787754600000,
    folder: "/videos",
    game: "Test Game",
    durationSecs: 3600,
    contentType: "vod",
  };

  it("does not render Clip or VOD badge on thumbnail in grid mode", () => {
    const { rerender } = render(
      <VideoPill video={clipVideo} viewMode="grid" />
    );
    expect(screen.queryByText(/^Clip$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^VOD$/i)).not.toBeInTheDocument();

    rerender(<VideoPill video={vodVideo} viewMode="grid" />);
    expect(screen.queryByText(/^Clip$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^VOD$/i)).not.toBeInTheDocument();
  });

  it("does not render Clip or VOD badge on thumbnail in list mode", () => {
    const { rerender } = render(
      <VideoPill video={clipVideo} viewMode="list" compact />
    );
    expect(screen.queryByText(/^Clip$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^VOD$/i)).not.toBeInTheDocument();

    rerender(<VideoPill video={vodVideo} viewMode="list" compact />);
    expect(screen.queryByText(/^Clip$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^VOD$/i)).not.toBeInTheDocument();
  });
});

describe("VideoPill Upload Queue Status Indicator", () => {
  const queueTestVideo: VideoFile = {
    name: "queue_sample.mp4",
    path: "/videos/queue_sample.mp4",
    size: 104857600,
    modTime: 1700000000,
    folder: "videos",
    game: "Test Game",
  };

  it("renders queued indicator in footer when isQueued is true on local video", () => {
    const { container } = render(
      <VideoPill video={queueTestVideo} isQueued={true} viewMode="grid" />,
    );

    const queuedBadge = screen.getByTitle("Pending in upload queue");
    expect(queuedBadge).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();

    const thumbContainer = container.querySelector(".relative.w-full");
    expect(thumbContainer?.textContent).not.toContain("Queued");
  });

  it("does not render queued indicator when video has youtubeId", () => {
    const uploadedVideo: VideoFile = {
      ...queueTestVideo,
      youtubeId: "yt-already-uploaded",
    };
    render(
      <VideoPill video={uploadedVideo} isQueued={true} viewMode="grid" />,
    );

    expect(
      screen.queryByTitle("Pending in upload queue"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
  });

  it("does not render queued indicator when uploadProgress is active", () => {
    render(
      <VideoPill
        video={queueTestVideo}
        isQueued={true}
        uploadProgress={45}
        viewMode="grid"
      />,
    );

    expect(
      screen.queryByTitle("Pending in upload queue"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
  });

  it("does not render queued indicator when isQueued is false or omitted", () => {
    const { rerender } = render(
      <VideoPill video={queueTestVideo} viewMode="grid" />,
    );
    expect(
      screen.queryByTitle("Pending in upload queue"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();

    rerender(
      <VideoPill video={queueTestVideo} isQueued={false} viewMode="grid" />,
    );
    expect(
      screen.queryByTitle("Pending in upload queue"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
  });

  it("re-renders VideoPill when isQueued prop changes", () => {
    const { rerender } = render(
      <VideoPill video={queueTestVideo} isQueued={false} viewMode="grid" />,
    );
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();

    rerender(
      <VideoPill video={queueTestVideo} isQueued={true} viewMode="grid" />,
    );
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });
});

