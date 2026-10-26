import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import VideoPill, { areVideoPillPropsEqual } from "../VideoPill";
import { YTVideo, VideoFile } from "../../../types";

// Mock Wails backend App calls
vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetThumbnail: vi.fn().mockResolvedValue(""),
  GetVideoPreview: vi.fn().mockResolvedValue(""),
  GetVideoDuration: vi.fn().mockResolvedValue(0),
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  BrowserOpenURL: vi.fn(),
  EventsOn: vi.fn(),
  EventsOff: vi.fn(),
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

describe("VideoPill Quick Actions (Show in Explorer, Quick Queue)", () => {
  const localVideo: VideoFile = {
    name: "Gameplay_01.mp4",
    path: "C:\\Videos\\Gameplay_01.mp4",
    size: 52428800,
    modTime: 1787754600000,
    folder: "C:\\Videos",
    game: "Valorant",
  };

  it("renders Show in Explorer button and fires onOpenInExplorer on click with stopped propagation", () => {
    const onOpenInExplorer = vi.fn();
    const onClick = vi.fn();

    render(
      <VideoPill
        video={localVideo}
        onOpenInExplorer={onOpenInExplorer}
        onClick={onClick}
        viewMode="grid"
      />,
    );

    const explorerBtn = screen.getByRole("button", {
      name: /show in explorer/i,
    });
    expect(explorerBtn).toBeInTheDocument();
    expect(explorerBtn).toHaveAttribute("title", "Show in Explorer");

    fireEvent.click(explorerBtn);

    expect(onOpenInExplorer).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders Quick Queue button and fires onQuickQueue on click with stopped propagation", () => {
    const onQuickQueue = vi.fn();
    const onClick = vi.fn();

    render(
      <VideoPill
        video={localVideo}
        onQuickQueue={onQuickQueue}
        onClick={onClick}
        viewMode="grid"
      />,
    );

    const queueBtn = screen.getByRole("button", {
      name: /add to upload queue/i,
    });
    expect(queueBtn).toBeInTheDocument();
    expect(queueBtn).toHaveAttribute("title", "Add to upload queue");

    fireEvent.click(queueBtn);

    expect(onQuickQueue).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not render Quick Queue button when video already has youtubeId", () => {
    const uploadedVideo: VideoFile = {
      ...localVideo,
      youtubeId: "yt-12345",
    };
    render(
      <VideoPill
        video={uploadedVideo}
        onQuickQueue={vi.fn()}
        viewMode="grid"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /add to upload queue/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render Quick Queue button when video is queued or uploading", () => {
    const { rerender } = render(
      <VideoPill
        video={localVideo}
        onQuickQueue={vi.fn()}
        isQueued={true}
        viewMode="grid"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /add to upload queue/i }),
    ).not.toBeInTheDocument();

    rerender(
      <VideoPill
        video={localVideo}
        onQuickQueue={vi.fn()}
        uploadProgress={50}
        viewMode="grid"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /add to upload queue/i }),
    ).not.toBeInTheDocument();
  });
});

describe("VideoPill Delete Tooltip & Label Discrimination", () => {
  const localVideo: VideoFile = {
    name: "Clip_01.mp4",
    path: "C:\\Videos\\Clip_01.mp4",
    size: 10485760,
    modTime: 1787754600000,
    folder: "C:\\Videos",
    game: "Valorant",
  };

  it("renders 'Delete local file' tooltip and aria-label for VideoFile", () => {
    render(
      <VideoPill
        video={localVideo}
        onDelete={vi.fn()}
        viewMode="grid"
      />,
    );

    const deleteBtn = screen.getByRole("button", {
      name: /delete local file/i,
    });
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn).toHaveAttribute("title", "Delete local file");
  });

  it("renders 'Delete video from YouTube' tooltip and aria-label for YTVideo", () => {
    render(
      <VideoPill
        video={mockVideo}
        onDelete={vi.fn()}
        viewMode="grid"
      />,
    );

    const deleteBtn = screen.getByRole("button", {
      name: /delete video from youtube/i,
    });
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn).toHaveAttribute("title", "Delete video from YouTube");
  });
});

describe("VideoPill Privacy Indicator", () => {
  it("renders 'Private' indicator for private YTVideo", () => {
    const privateVideo: YTVideo = {
      ...mockVideo,
      privacy: "private",
    };

    render(<VideoPill video={privateVideo} viewMode="grid" />);

    const indicator = screen.getByTitle("Private video");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent("Private");
    expect(indicator).toHaveClass("text-amber-400", "font-semibold");
  });

  it("renders 'Unlisted' indicator for unlisted YTVideo", () => {
    const unlistedVideo: YTVideo = {
      ...mockVideo,
      privacy: "unlisted",
    };

    render(<VideoPill video={unlistedVideo} viewMode="grid" />);

    const indicator = screen.getByTitle("Unlisted video");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent("Unlisted");
    expect(indicator).toHaveClass("text-sky-400", "font-semibold");
  });

  it("does not render privacy indicator for public YTVideo", () => {
    const publicVideo: YTVideo = {
      ...mockVideo,
      privacy: "public",
    };

    render(<VideoPill video={publicVideo} viewMode="grid" />);

    expect(screen.queryByTitle("Private video")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Unlisted video")).not.toBeInTheDocument();
  });

  it("does not render privacy indicator for local VideoFile", () => {
    const localVideo: VideoFile = {
      name: "Clip_01.mp4",
      path: "C:\\Videos\\Clip_01.mp4",
      size: 10485760,
      modTime: 1787754600000,
      folder: "C:\\Videos",
      game: "Valorant",
    };

    render(<VideoPill video={localVideo} viewMode="grid" />);

    expect(screen.queryByTitle("Private video")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Unlisted video")).not.toBeInTheDocument();
  });
});

describe("VideoPill YouTube Quick Actions (Edit Metadata, Open in Browser)", () => {
  it("renders 'Edit video metadata' button when onEdit is provided for YTVideo and clicking it triggers onEdit without clicking card", async () => {
    const handleEdit = vi.fn();
    const handleCardClick = vi.fn();

    render(
      <VideoPill
        video={mockVideo}
        viewMode="grid"
        onEdit={handleEdit}
        onClick={handleCardClick}
      />,
    );

    const editBtn = screen.getByTitle("Edit video metadata");
    expect(editBtn).toBeInTheDocument();
    expect(editBtn).toHaveAttribute("aria-label", "Edit video metadata");

    fireEvent.click(editBtn);

    expect(handleEdit).toHaveBeenCalledTimes(1);
    expect(handleCardClick).not.toHaveBeenCalled();
  });

  it("does not render 'Edit video metadata' button when onEdit is not provided for YTVideo", () => {
    render(<VideoPill video={mockVideo} viewMode="grid" />);
    expect(screen.queryByTitle("Edit video metadata")).not.toBeInTheDocument();
  });

  it("renders 'Open on YouTube' button for YTVideo and clicking it calls BrowserOpenURL without clicking card", async () => {
    const { BrowserOpenURL } = await import(
      "../../../../wailsjs/runtime/runtime"
    );
    const handleCardClick = vi.fn();

    render(
      <VideoPill
        video={mockVideo}
        viewMode="grid"
        onClick={handleCardClick}
      />,
    );

    const openBtn = screen.getByTitle("Open on YouTube");
    expect(openBtn).toBeInTheDocument();
    expect(openBtn).toHaveAttribute("aria-label", "Open on YouTube");

    fireEvent.click(openBtn);

    expect(BrowserOpenURL).toHaveBeenCalledWith(
      `https://www.youtube.com/watch?v=${mockVideo.id}`,
    );
    expect(handleCardClick).not.toHaveBeenCalled();
  });

  it("does not render YouTube edit or open-on-youtube buttons for local VideoFile", () => {
    const localVideo: VideoFile = {
      name: "Clip_01.mp4",
      path: "C:\\Videos\\Clip_01.mp4",
      size: 10485760,
      modTime: 1787754600000,
      folder: "C:\\Videos",
      game: "Valorant",
    };

    render(
      <VideoPill
        video={localVideo}
        viewMode="grid"
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByTitle("Edit video metadata")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Open on YouTube")).not.toBeInTheDocument();
  });
});

describe("VideoPill YTVideo Memoization & areVideoPillPropsEqual", () => {
  it("returns false when thumbnailUrl changes on YTVideo", () => {
    const prevProps = { video: mockVideo, viewMode: "grid" as const };
    const nextProps = {
      video: { ...mockVideo, thumbnailUrl: "https://example.com/new_thumb.jpg" },
      viewMode: "grid" as const,
    };

    expect(areVideoPillPropsEqual(prevProps, nextProps)).toBe(false);
  });

  it("returns false when gameTag changes on YTVideo", () => {
    const prevProps = {
      video: { ...mockVideo, gameTag: "GameAlpha" },
      viewMode: "grid" as const,
    };
    const nextProps = {
      video: { ...mockVideo, gameTag: "GameBeta" },
      viewMode: "grid" as const,
    };

    expect(areVideoPillPropsEqual(prevProps, nextProps)).toBe(false);
  });

  it("returns false when episode changes on YTVideo", () => {
    const prevProps = {
      video: { ...mockVideo, episode: 1 },
      viewMode: "grid" as const,
    };
    const nextProps = {
      video: { ...mockVideo, episode: 2 },
      viewMode: "grid" as const,
    };

    expect(areVideoPillPropsEqual(prevProps, nextProps)).toBe(false);
  });

  it("returns true when YTVideo properties match", () => {
    const prevProps = {
      video: { ...mockVideo, gameTag: "GameTag", episode: 10 },
      viewMode: "grid" as const,
    };
    const nextProps = {
      video: { ...mockVideo, gameTag: "GameTag", episode: 10 },
      viewMode: "grid" as const,
    };

    expect(areVideoPillPropsEqual(prevProps, nextProps)).toBe(true);
  });

  it("re-renders when thumbnailUrl changes on YTVideo via rerender", async () => {
    const { rerender } = render(
      <VideoPill video={mockVideo} viewMode="grid" />,
    );

    const initialImg = await screen.findByRole("img");
    expect(initialImg).toHaveAttribute("src", mockVideo.thumbnailUrl);

    const updatedVideo: YTVideo = {
      ...mockVideo,
      thumbnailUrl: "https://example.com/updated_thumb.jpg",
    };

    rerender(<VideoPill video={updatedVideo} viewMode="grid" />);

    const updatedImg = screen.getByRole("img");
    expect(updatedImg).toHaveAttribute("src", "https://example.com/updated_thumb.jpg");
  });
});



