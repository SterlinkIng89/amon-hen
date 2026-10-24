import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
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
  SaveCustomThumbnail: vi.fn().mockResolvedValue(""),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
}));

describe("InlinePlayer inspector controls and spacing (#140)", () => {
  const baseMockVideo: VideoFile = {
    name: "Control 2026-10-19.mp4",
    path: "C:/videos/Control 2026-10-19.mp4",
    folder: "C:/videos",
    size: 1024 * 1024 * 50,
    modTime: 1700000000,
    durationSecs: 120,
    game: "Control",
    episode: 30,
    youtubeTitle: "Control — 19/10/26 — 30",
  };

  beforeAll(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupPlayer = (props?: Partial<React.ComponentProps<typeof InlinePlayer>>) => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onAddToQueue = vi.fn();

    return render(
      <InlinePlayer
        video={baseMockVideo}
        streamPort={8080}
        onAddToQueue={onAddToQueue}
        onPrev={onPrev}
        onNext={onNext}
        {...props}
      />
    );
  };

  it("renders live YouTube Title character counter and updates when user edits title", () => {
    setupPlayer();

    const initialCounter = screen.getByText("23/100");
    expect(initialCounter).toBeInTheDocument();
    expect(initialCounter.className).toContain("text-text-muted");

    const titleInput = screen.getByDisplayValue("Control — 19/10/26 — 30");
    fireEvent.change(titleInput, { target: { value: "Control — 19/10/26 — 30 — Edited" } });

    const updatedCounter = screen.getByText("32/100");
    expect(updatedCounter).toBeInTheDocument();
    expect(updatedCounter.className).toContain("text-text-muted");

    const maxTitle = "A".repeat(100);
    fireEvent.change(titleInput, { target: { value: maxTitle } });
    const limitCounter = screen.getByText("100/100");
    expect(limitCounter).toBeInTheDocument();
    expect(limitCounter.className).toContain("text-accent");
    expect(limitCounter.className).toContain("font-medium");
  });

  it("increments episode number and auto-syncs YouTube Title suffix", () => {
    setupPlayer();

    const increaseBtn = screen.getByRole("button", { name: "Increase episode" });
    fireEvent.click(increaseBtn);

    const episodeInput = screen.getByDisplayValue("31") as HTMLInputElement;
    expect(episodeInput).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue("Control — 19/10/26 — 31") as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();
  });

  it("decrements episode number down to minimum 1 and disables at threshold", () => {
    const videoWithEp2: VideoFile = {
      ...baseMockVideo,
      episode: 2,
      youtubeTitle: "Control — 19/10/26 — 2",
    };
    setupPlayer({ video: videoWithEp2 });

    const decreaseBtn = screen.getByRole("button", { name: "Decrease episode" }) as HTMLButtonElement;
    expect(decreaseBtn).not.toBeDisabled();

    fireEvent.click(decreaseBtn);

    const episodeInput = screen.getByDisplayValue("1") as HTMLInputElement;
    expect(episodeInput).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue("Control — 19/10/26 — 1") as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();

    expect(decreaseBtn).toBeDisabled();
  });

  it("handles increment when episode is empty or zero", () => {
    const videoWithNoEp: VideoFile = {
      ...baseMockVideo,
      episode: 0,
      youtubeTitle: "Control — 19/10/26",
    };
    setupPlayer({ video: videoWithNoEp });

    const decreaseBtn = screen.getByRole("button", { name: "Decrease episode" }) as HTMLButtonElement;
    expect(decreaseBtn).toBeDisabled();

    const increaseBtn = screen.getByRole("button", { name: "Increase episode" });
    fireEvent.click(increaseBtn);

    const episodeInput = screen.getByDisplayValue("1") as HTMLInputElement;
    expect(episodeInput).toBeInTheDocument();
  });

  it("renders description textarea with compact default dimensions (rows 2, min-h-[68px])", () => {
    const { container } = setupPlayer();

    const desc = container.querySelector("textarea");
    expect(desc).not.toBeNull();
    expect(desc?.getAttribute("rows")).toBe("2");
    expect(desc?.className).toContain("min-h-[68px]");
    expect(desc?.className).toContain("resize-y");
  });
});
