import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import InlinePlayer from "../InlinePlayer";
import { VideoFile } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UploadToYouTube: vi.fn().mockResolvedValue(undefined),
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
  SaveCustomThumbnail: vi
    .fn()
    .mockResolvedValue("C:/cache/yt_thumbs/test.jpg"),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../utils/captureVideoFrame", () => ({
  captureVideoFrameDataUrl: vi
    .fn()
    .mockReturnValue("data:image/jpeg;base64,mockframe"),
}));

describe("InlinePlayer keyboard shortcuts", () => {
  const mockVideo: VideoFile = {
    name: "test-clip.mp4",
    path: "C:/videos/test-clip.mp4",
    folder: "C:/videos",
    size: 1024 * 1024 * 50,
    modTime: 1700000000,
    durationSecs: 120,
    game: "Hades",
  };

  beforeAll(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const setupPlayer = (props?: Partial<React.ComponentProps<typeof InlinePlayer>>) => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onAddToQueue = vi.fn();

    const utils = render(
      <InlinePlayer
        video={mockVideo}
        streamPort={8080}
        onAddToQueue={onAddToQueue}
        onPrev={onPrev}
        onNext={onNext}
        {...props}
      />
    );

    const videoEl = utils.container.querySelector("video") as HTMLVideoElement;
    if (videoEl) {
      let currentTime = 10;
      let playbackRate = 1;
      Object.defineProperty(videoEl, "currentTime", {
        get: () => currentTime,
        set: (v) => {
          currentTime = v;
        },
        configurable: true,
      });
      Object.defineProperty(videoEl, "duration", {
        get: () => 120,
        configurable: true,
      });
      Object.defineProperty(videoEl, "playbackRate", {
        get: () => playbackRate,
        set: (v) => {
          playbackRate = v;
        },
        configurable: true,
      });
    }

    return {
      ...utils,
      videoEl,
      onPrev,
      onNext,
      onAddToQueue,
    };
  };

  it("seeks forward 5s on ArrowRight without triggering onNext", () => {
    const { videoEl, onNext } = setupPlayer();
    expect(videoEl.currentTime).toBe(10);

    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(videoEl.currentTime).toBe(15);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("seeks backward 5s on ArrowLeft without triggering onPrev", () => {
    const { videoEl, onPrev } = setupPlayer();
    expect(videoEl.currentTime).toBe(10);

    fireEvent.keyDown(document, { key: "ArrowLeft" });

    expect(videoEl.currentTime).toBe(5);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("clamps seek at 0 when rewinding past the start", () => {
    const { videoEl } = setupPlayer();
    videoEl.currentTime = 3;

    fireEvent.keyDown(document, { key: "ArrowLeft" });

    expect(videoEl.currentTime).toBe(0);
  });

  it("performs fine 1s seek on Alt+ArrowRight", () => {
    const { videoEl } = setupPlayer();
    expect(videoEl.currentTime).toBe(10);

    fireEvent.keyDown(document, { key: "ArrowRight", altKey: true });

    expect(videoEl.currentTime).toBe(11);
  });

  it("calls onNext and does not seek when Shift+ArrowRight is pressed", () => {
    const { videoEl, onNext } = setupPlayer();
    expect(videoEl.currentTime).toBe(10);

    fireEvent.keyDown(document, { key: "ArrowRight", shiftKey: true });

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(videoEl.currentTime).toBe(10);
  });

  it("calls onPrev and does not seek when Shift+ArrowLeft is pressed", () => {
    const { videoEl, onPrev } = setupPlayer();
    expect(videoEl.currentTime).toBe(10);

    fireEvent.keyDown(document, { key: "ArrowLeft", shiftKey: true });

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(videoEl.currentTime).toBe(10);
  });

  it("navigates videos with bracket keys [ and ]", () => {
    const { onPrev, onNext } = setupPlayer();

    fireEvent.keyDown(document, { key: "[" });
    expect(onPrev).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "]" });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("does not trigger player shortcuts when an input is focused", () => {
    const { videoEl, onNext } = setupPlayer();

    // Focus an input field
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(videoEl.currentTime).toBe(10);
    expect(onNext).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("renders keyboard shortcuts help button and toggles tooltip on hover", () => {
    const { getByTitle, queryByRole } = setupPlayer();

    const helpBtn = getByTitle("Keyboard shortcuts");
    expect(helpBtn).toBeInTheDocument();
    expect(queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(helpBtn.parentElement!);
    expect(queryByRole("tooltip")).toBeInTheDocument();
    expect(queryByRole("tooltip")?.textContent).toContain("Seek");
    expect(queryByRole("tooltip")?.textContent).toContain("Fine seek");
    expect(queryByRole("tooltip")?.textContent).toContain("Playback speed");

    fireEvent.mouseLeave(helpBtn.parentElement!);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("increases playback speed on > shortcut and persists to localStorage", () => {
    const { videoEl } = setupPlayer();
    expect(videoEl.playbackRate).toBe(1);

    fireEvent.keyDown(document, { key: ">" });

    expect(videoEl.playbackRate).toBe(1.25);
    expect(localStorage.getItem("player_playback_rate")).toBe("1.25");
  });

  it("decreases playback speed on < shortcut and persists to localStorage", () => {
    const { videoEl } = setupPlayer();
    expect(videoEl.playbackRate).toBe(1);

    fireEvent.keyDown(document, { key: "<" });

    expect(videoEl.playbackRate).toBe(0.5);
    expect(localStorage.getItem("player_playback_rate")).toBe("0.5");
  });

  it("cycles playback speed and updates video when speed button is clicked", () => {
    const { getByLabelText, videoEl } = setupPlayer();

    const speedBtn = getByLabelText("Playback speed");
    expect(speedBtn).toBeInTheDocument();
    expect(speedBtn.textContent).toContain("1x");

    fireEvent.click(speedBtn);

    expect(videoEl.playbackRate).toBe(1.25);
    expect(speedBtn.textContent).toContain("1.25x");
    expect(localStorage.getItem("player_playback_rate")).toBe("1.25");
  });

  it("captures current video frame as thumbnail when clicking capture frame button", async () => {
    const { getByRole, findByText } = setupPlayer();

    const captureBtn = getByRole("button", {
      name: "Capture frame as thumbnail",
    });
    expect(captureBtn).toBeInTheDocument();

    const { SaveCustomThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    fireEvent.click(captureBtn);

    expect(SaveCustomThumbnail).toHaveBeenCalledWith(
      "C:/videos/test-clip.mp4",
      "data:image/jpeg;base64,mockframe",
    );

    expect(await findByText("Frame captured as thumbnail")).toBeInTheDocument();
  });
});

