import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import YouTubeInlinePlayer from "../YouTubeInlinePlayer";
import { YTVideo } from "../../../types";
import {
  UpdateYouTubeVideoMetadata,
  UpdateYouTubeVideoGameMeta,
  LoadConfig,
} from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UpdateYouTubeVideoMetadata: vi.fn().mockResolvedValue(undefined),
  UpdateYouTubeVideoGameMeta: vi.fn().mockResolvedValue(undefined),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  AddVideoToPlaylist: vi.fn().mockResolvedValue(undefined),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("pl-1"),
  LoadConfig: vi.fn().mockResolvedValue({
    tag_playlist_configs: {},
    game_profiles: {
      Valorant: { type: "multiplayer", modes: ["Competitive", "Unrated"] },
      Overwatch: { type: "multiplayer", modes: ["Quick Play"] },
    },
  }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue(""),
  DeleteCustomThumbnail: vi.fn().mockResolvedValue(undefined),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({}),
}));

vi.mock("../YouTubeThumbnailPicker", () => ({
  default: (props: any) => (
    <div data-testid="yt-thumbnail-picker" data-gametag={props.gameTag} data-episode={props.episodeNumber}>
      ThumbnailPickerMock
    </div>
  ),
}));

describe("YouTubeInlinePlayer Game Profile, TagInput, Episode Stepper and Title Counter", () => {
  const baseVideo: YTVideo = {
    id: "vid-yt-123",
    title: "Control — 19/10/26 — 30",
    description: "Initial description",
    publishedAt: "2026-10-19T10:00:00Z",
    thumbnailUrl: "https://yt.com/thumb.jpg",
    viewCount: 1500,
    likeCount: 50,
    duration: "25:00",
    privacy: "public",
    gameTag: "Control",
    episode: 30,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).YT = {
      Player: vi.fn(function (_id: string, _options: any) {
        return {
          getCurrentTime: vi.fn().mockReturnValue(0),
          getDuration: vi.fn().mockReturnValue(100),
          seekTo: vi.fn(),
          getPlayerState: vi.fn().mockReturnValue(1),
          playVideo: vi.fn(),
          pauseVideo: vi.fn(),
          mute: vi.fn(),
          unMute: vi.fn(),
          isMuted: vi.fn().mockReturnValue(false),
          destroy: vi.fn(),
        };
      }),
      PlayerState: {
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        BUFFERING: 3,
        CUED: 5,
      },
    };
  });

  it("renders Game Profile, TagInput, Episode stepper and character counter", async () => {
    render(
      <YouTubeInlinePlayer
        video={baseVideo}
        onPrev={null}
        onNext={null}
      />
    );

    // Game Profile select with Singleplayer and loaded profiles
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /game profile/i })).toBeInTheDocument();
    });
    const profileSelect = screen.getByRole("combobox", { name: /game profile/i }) as HTMLSelectElement;
    expect(profileSelect.value).toBe(""); // Singleplayer

    // Game Tag input
    const tagInput = screen.getByPlaceholderText(/e\.g\. Hollow Knight/i) as HTMLInputElement;
    expect(tagInput.value).toBe("Control");

    // Episode input and stepper buttons
    const decBtn = screen.getByRole("button", { name: /decrease episode/i });
    const incBtn = screen.getByRole("button", { name: /increase episode/i });
    expect(decBtn).toBeInTheDocument();
    expect(incBtn).toBeInTheDocument();

    const episodeInput = screen.getByPlaceholderText("—") as HTMLInputElement;
    expect(episodeInput.value).toBe("30");

    // Live character counter
    expect(screen.getByText(`${baseVideo.title.length}/100`)).toBeInTheDocument();
  });

  it("increments episode and surgically updates title suffix from — 30 to — 31", async () => {
    render(
      <YouTubeInlinePlayer
        video={baseVideo}
        onPrev={null}
        onNext={null}
      />
    );

    const incBtn = screen.getByRole("button", { name: /increase episode/i });
    fireEvent.click(incBtn);

    const episodeInput = screen.getByPlaceholderText("—") as HTMLInputElement;
    expect(episodeInput.value).toBe("31");

    const titleInput = screen.getByDisplayValue("Control — 19/10/26 — 31");
    expect(titleInput).toBeInTheDocument();
  });

  it("appends episode suffix when stepping an untagged title without episode (Option A)", async () => {
    const videoNoEp: YTVideo = {
      ...baseVideo,
      title: "Control First Impressions",
      episode: undefined,
      gameTag: "",
    };

    render(
      <YouTubeInlinePlayer
        video={videoNoEp}
        onPrev={null}
        onNext={null}
      />
    );

    const incBtn = screen.getByRole("button", { name: /increase episode/i });
    fireEvent.click(incBtn);

    const episodeInput = screen.getByPlaceholderText("—") as HTMLInputElement;
    expect(episodeInput.value).toBe("1");

    const titleInput = screen.getByDisplayValue("Control First Impressions — 1");
    expect(titleInput).toBeInTheDocument();
  });

  it("synchronizes Episode # when user types '— N' into YouTube Title", async () => {
    render(
      <YouTubeInlinePlayer
        video={baseVideo}
        onPrev={null}
        onNext={null}
      />
    );

    const titleInput = screen.getByDisplayValue(baseVideo.title) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Control — 19/10/26 — 45" } });

    const episodeInput = screen.getByPlaceholderText("—") as HTMLInputElement;
    expect(episodeInput.value).toBe("45");
  });

  it("calls UpdateYouTubeVideoMetadata and UpdateYouTubeVideoGameMeta on Save Info", async () => {
    const onUpdate = vi.fn();
    render(
      <YouTubeInlinePlayer
        video={baseVideo}
        onPrev={null}
        onNext={null}
        onUpdate={onUpdate}
      />
    );

    const incBtn = screen.getByRole("button", { name: /increase episode/i });
    fireEvent.click(incBtn);

    const saveBtn = screen.getByRole("button", { name: /save info/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(UpdateYouTubeVideoMetadata).toHaveBeenCalledWith(
        "vid-yt-123",
        "Control — 19/10/26 — 31",
        "Initial description",
        "public"
      );
      expect(UpdateYouTubeVideoGameMeta).toHaveBeenCalledWith(
        "vid-yt-123",
        "Control",
        31
      );
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("updates YouTubeThumbnailPicker props when tag or episode changes", async () => {
    render(
      <YouTubeInlinePlayer
        video={baseVideo}
        onPrev={null}
        onNext={null}
      />
    );

    const picker = screen.getByTestId("yt-thumbnail-picker");
    expect(picker.getAttribute("data-gametag")).toBe("Control");
    expect(picker.getAttribute("data-episode")).toBe("30");

    const incBtn = screen.getByRole("button", { name: /increase episode/i });
    fireEvent.click(incBtn);

    expect(picker.getAttribute("data-episode")).toBe("31");
  });
});
