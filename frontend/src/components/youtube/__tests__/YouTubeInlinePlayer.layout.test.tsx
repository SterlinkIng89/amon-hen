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
    tag_playlist_configs: {},
  }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
  GetCustomThumbnail: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue(""),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({}),
}));

describe("YouTubeInlinePlayer layout and inspector", () => {
  const mockVideo: YTVideo = {
    id: "vid-yt-123",
    title: "Test YouTube Video",
    description: "Initial description",
    publishedAt: "2026-01-01T00:00:00Z",
    thumbnailUrl: "https://yt.com/thumb.jpg",
    viewCount: 1500,
    likeCount: 250,
    duration: "10:00",
    privacy: "public",
    monetizationStatus: "limited",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.innerWidth = 1920;
    window.innerHeight = 1080;
  });

  it("renders desktop flex-row layout with right inspector sidebar and direct form inputs", () => {
    window.innerWidth = 1920;
    const { container } = render(
      <YouTubeInlinePlayer video={mockVideo} onPrev={null} onNext={null} />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-row");

    // Inputs are directly interactive (no edit button)
    const titleInput = screen.getByDisplayValue("Test YouTube Video");
    expect(titleInput).toBeInTheDocument();
    const descInput = screen.getByDisplayValue("Initial description");
    expect(descInput).toBeInTheDocument();

    // VideoStatusBadge is rendered in header
    expect(screen.getByTestId("video-status-badge")).toBeInTheDocument();

    // Save Info button is disabled when not dirty
    const saveBtn = screen.getByRole("button", { name: /save info/i });
    expect(saveBtn).toBeDisabled();
  });

  it("enables Save Info when a field is modified (isDirty)", async () => {
    window.innerWidth = 1920;
    render(
      <YouTubeInlinePlayer video={mockVideo} onPrev={null} onNext={null} />
    );

    const titleInput = screen.getByDisplayValue("Test YouTube Video");
    fireEvent.change(titleInput, { target: { value: "Updated Video Title" } });

    const saveBtn = screen.getByRole("button", { name: /save info/i });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(appBackend.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith(
        "vid-yt-123",
        "Updated Video Title",
        "Initial description",
        "public"
      );
    });
  });

  it("collapses and expands inspector sidebar and persists state to localStorage", () => {
    window.innerWidth = 1920;
    render(
      <YouTubeInlinePlayer video={mockVideo} onPrev={null} onNext={null} />
    );

    const hideBtn = screen.getByRole("button", { name: "Hide Details" });
    fireEvent.click(hideBtn);

    expect(localStorage.getItem("yt_player_info_expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Hide Details" })).toBeNull();

    const showBtn = screen.getByRole("button", { name: "Show Details" });
    expect(showBtn).toBeInTheDocument();

    fireEvent.click(showBtn);
    expect(localStorage.getItem("yt_player_info_expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Hide Details" })).toBeInTheDocument();
  });

  it("renders flex-col layout on narrow viewports (< 1280px)", () => {
    window.innerWidth = 1024;
    const { container } = render(
      <YouTubeInlinePlayer video={mockVideo} onPrev={null} onNext={null} />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-col");
    expect(screen.getByDisplayValue("Test YouTube Video")).toBeInTheDocument();
  });
});
