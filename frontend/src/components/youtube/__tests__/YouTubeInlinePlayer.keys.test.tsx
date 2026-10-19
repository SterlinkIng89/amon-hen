import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import YouTubeInlinePlayer from "../YouTubeInlinePlayer";
import { YTVideo } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UpdateYouTubeVideoMetadata: vi.fn().mockResolvedValue(undefined),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  AddVideoToPlaylist: vi.fn().mockResolvedValue(undefined),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("pl-1"),
  LoadConfig: vi.fn().mockResolvedValue({
    tag_playlist_configs: {},
  }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue(""),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({}),
}));

describe("YouTubeInlinePlayer keyboard shortcuts and navigation", () => {
  const mockVideo: YTVideo = {
    id: "vid-yt-123",
    title: "Test YouTube Video",
    description: "Testing keyboard shortcuts",
    publishedAt: "2026-01-01T00:00:00Z",
    thumbnailUrl: "https://yt.com/thumb.jpg",
    viewCount: 100,
    likeCount: 10,
    duration: "10:00",
    privacy: "public",
  };

  let mockPlayerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPlayerInstance = {
      getCurrentTime: vi.fn().mockReturnValue(20),
      getDuration: vi.fn().mockReturnValue(600),
      seekTo: vi.fn(),
      getPlayerState: vi.fn().mockReturnValue(1), // Playing
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      mute: vi.fn(),
      unMute: vi.fn(),
      isMuted: vi.fn().mockReturnValue(false),
      destroy: vi.fn(),
    };

    (window as any).YT = {
      Player: vi.fn(function (_id: string, options: any) {
        return mockPlayerInstance;
      }),
      PlayerState: {
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
      },
    };
  });

  const setupPlayer = (props?: Partial<React.ComponentProps<typeof YouTubeInlinePlayer>>) => {
    const onPrev = vi.fn();
    const onNext = vi.fn();

    const utils = render(
      <YouTubeInlinePlayer
        video={mockVideo}
        onPrev={onPrev}
        onNext={onNext}
        {...props}
      />
    );

    return {
      ...utils,
      onPrev,
      onNext,
    };
  };

  it("seeks forward 5s on ArrowRight", () => {
    const { onNext } = setupPlayer();

    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(mockPlayerInstance.seekTo).toHaveBeenCalledWith(25, true);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("seeks backward 5s on ArrowLeft", () => {
    const { onPrev } = setupPlayer();

    fireEvent.keyDown(document, { key: "ArrowLeft" });

    expect(mockPlayerInstance.seekTo).toHaveBeenCalledWith(15, true);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("seeks 1s on Alt+ArrowRight and Alt+ArrowLeft", () => {
    setupPlayer();

    fireEvent.keyDown(document, { key: "ArrowRight", altKey: true });
    expect(mockPlayerInstance.seekTo).toHaveBeenCalledWith(21, true);

    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(mockPlayerInstance.seekTo).toHaveBeenCalledWith(19, true);
  });

  it("seeks 10s on J and L", () => {
    setupPlayer();

    fireEvent.keyDown(document, { key: "l" });
    expect(mockPlayerInstance.seekTo).toHaveBeenCalledWith(30, true);

    fireEvent.keyDown(document, { key: "j" });
    expect(mockPlayerInstance.seekTo).toHaveBeenCalledWith(10, true);
  });

  it("calls onNext on Shift+ArrowRight", () => {
    const { onNext } = setupPlayer();

    fireEvent.keyDown(document, { key: "ArrowRight", shiftKey: true });

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(mockPlayerInstance.seekTo).not.toHaveBeenCalled();
  });

  it("calls onPrev on Shift+ArrowLeft", () => {
    const { onPrev } = setupPlayer();

    fireEvent.keyDown(document, { key: "ArrowLeft", shiftKey: true });

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(mockPlayerInstance.seekTo).not.toHaveBeenCalled();
  });

  it("navigates with bracket keys [ and ]", () => {
    const { onPrev, onNext } = setupPlayer();

    fireEvent.keyDown(document, { key: "[" });
    expect(onPrev).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "]" });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("toggles play/pause on Spacebar", () => {
    setupPlayer();

    // Since playerState is 1 (PLAYING), it should pause
    fireEvent.keyDown(document, { key: " " });
    expect(mockPlayerInstance.pauseVideo).toHaveBeenCalledTimes(1);

    // If paused, it should play
    mockPlayerInstance.getPlayerState.mockReturnValue(2);
    fireEvent.keyDown(document, { key: " " });
    expect(mockPlayerInstance.playVideo).toHaveBeenCalledTimes(1);
  });

  it("toggles mute on M", () => {
    setupPlayer();

    // Currently not muted, should mute
    fireEvent.keyDown(document, { key: "m" });
    expect(mockPlayerInstance.mute).toHaveBeenCalledTimes(1);

    // If muted, should unMute
    mockPlayerInstance.isMuted.mockReturnValue(true);
    fireEvent.keyDown(document, { key: "m" });
    expect(mockPlayerInstance.unMute).toHaveBeenCalledTimes(1);
  });

  it("does not trigger keyboard shortcuts when typing in an input", () => {
    setupPlayer();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(mockPlayerInstance.seekTo).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("renders overlay buttons with Shift+Arrow tooltips and aria-labels", () => {
    const { getByTitle } = setupPlayer();

    expect(getByTitle("Previous (Shift+←)")).toBeInTheDocument();
    expect(getByTitle("Next (Shift+→)")).toBeInTheDocument();
  });
});
