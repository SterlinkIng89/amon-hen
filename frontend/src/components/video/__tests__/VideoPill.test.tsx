import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import VideoPill from "../VideoPill";
import { YTVideo } from "../../../types";

// Mock Wails backend App calls
vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetThumbnail: vi.fn().mockResolvedValue(""),
  GetVideoPreview: vi.fn().mockResolvedValue(""),
  GetVideoDuration: vi.fn().mockResolvedValue(0),
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
