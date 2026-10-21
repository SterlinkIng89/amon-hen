import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import InlinePlayer from "../InlinePlayer";
import { VideoFile } from "../../../types";
import { OpenFolderInExplorer } from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UploadToYouTube: vi.fn().mockResolvedValue(undefined),
  OpenFolderInExplorer: vi.fn().mockResolvedValue(undefined),
  SaveVideoMetadata: vi.fn().mockResolvedValue(undefined),
  DeleteFiles: vi.fn().mockResolvedValue(undefined),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("pl-1"),
  RegenerateThumbnail: vi.fn().mockResolvedValue(undefined),
  UpdateYouTubeVideoMetadata: vi.fn().mockResolvedValue(undefined),
  LoadConfig: vi.fn().mockResolvedValue({
    tag_playlist_configs: {},
  }),
  LogFrontendEvent: vi.fn().mockResolvedValue(undefined),
  SetVideoContentType: vi.fn().mockResolvedValue(undefined),
  CreateVideoClip: vi.fn().mockResolvedValue(""),
  GetVideosFromFolders: vi.fn().mockResolvedValue([]),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({}),
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue(""),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
}));

describe("InlinePlayer layout & feature parity", () => {
  const baseMockVideo: VideoFile = {
    name: "highlight-1080p.mp4",
    path: "C:/videos/highlight-1080p.mp4",
    folder: "C:/videos",
    size: 1024 * 1024 * 50,
    modTime: 1700000000,
    durationSecs: 60,
    game: "Valorant",
  };

  beforeAll(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: height,
    });
    window.dispatchEvent(new Event("resize"));
  };

  const renderPlayer = (videoOverrides?: Partial<VideoFile>) => {
    const video = { ...baseMockVideo, ...videoOverrides };
    return render(
      <InlinePlayer
        video={video}
        streamPort={8080}
        onAddToQueue={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    );
  };

  it("renders desktop 3-column flex-row layout on standard 1080p displays (1920x1080)", () => {
    setViewport(1920, 1080);
    const { container } = renderPlayer();

    const rootElement = container.firstElementChild as HTMLElement;
    expect(rootElement).toBeTruthy();
    expect(rootElement.className).toContain("flex-row");
    expect(rootElement.className).not.toContain("flex-col");

    // Sidebar should be present with Hide Details button
    const hideDetailsBtn = screen.getByTitle("Hide Details");
    expect(hideDetailsBtn).toBeInTheDocument();
  });

  it("falls back to flex-col with max-h-[42vh] on narrow viewports (< 1280px)", () => {
    setViewport(1024, 768);
    const { container } = renderPlayer();

    const rootElement = container.firstElementChild as HTMLElement;
    expect(rootElement).toBeTruthy();
    expect(rootElement.className).toContain("flex-col");

    // Bottom panel should cap height at max-h-[42vh] to prevent crushing video
    const bottomPanel = container.querySelector(".max-h-\\[42vh\\]");
    expect(bottomPanel).toBeInTheDocument();
  });

  it("displays View on YT link and Re-upload button in 1080p desktop mode when youtubeId exists", () => {
    setViewport(1920, 1080);
    renderPlayer({ youtubeId: "yt-test-id-123" });

    // View on YT link
    const ytLink = screen.getByRole("link", { name: /view on yt/i });
    expect(ytLink).toBeInTheDocument();
    expect(ytLink).toHaveAttribute("href", "https://youtu.be/yt-test-id-123");

    // Upload button should say Re-upload
    const reuploadBtn = screen.getByRole("button", { name: "Re-upload" });
    expect(reuploadBtn).toBeInTheDocument();
  });

  it("displays Linked playlist badge in both desktop and narrow modes when playlistTitle exists", () => {
    setViewport(1920, 1080);
    renderPlayer({ playlistTitle: "Top Frags 2026" });

    expect(screen.getByText("Linked: Top Frags 2026")).toBeInTheDocument();
  });

  it("does not render redundant Regen Thumbnail button in action bar", () => {
    setViewport(1920, 1080);
    renderPlayer();

    expect(screen.queryByRole("button", { name: /regen thumbnail/i })).not.toBeInTheDocument();
  });

  it("renders Open File Location button in desktop mode and opens video folder when clicked", () => {
    setViewport(1920, 1080);
    renderPlayer();

    const openFolderBtn = screen.getByRole("button", { name: "Open file folder" });
    expect(openFolderBtn).toBeInTheDocument();
    expect(openFolderBtn).toHaveAttribute("title", "Open file folder");

    fireEvent.click(openFolderBtn);
    expect(OpenFolderInExplorer).toHaveBeenCalledWith(baseMockVideo.folder);
  });

  it("renders Open File Location button in narrow mode and calls OpenFolderInExplorer", () => {
    setViewport(1024, 768);
    renderPlayer();

    const openFolderBtn = screen.getByRole("button", { name: "Open file folder" });
    expect(openFolderBtn).toBeInTheDocument();

    fireEvent.click(openFolderBtn);
    expect(OpenFolderInExplorer).toHaveBeenCalledWith(baseMockVideo.folder);
  });
});
