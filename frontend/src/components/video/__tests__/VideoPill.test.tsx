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
    const { rerender } = render(<VideoPill video={mockVideo} viewMode="grid" />);
    expect(screen.queryByText(/Duplicate/i)).not.toBeInTheDocument();

    rerender(<VideoPill video={mockVideo} duplicateCount={1} viewMode="grid" />);
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

