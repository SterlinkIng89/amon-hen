import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PlayerView from "../PlayerView";
import { VideoFile } from "../../../types";

// Mock Wails backend
vi.mock("../../../../wailsjs/go/backend/App", () => ({
  LoadConfig: vi.fn().mockResolvedValue({ game_profiles: {} }),
}));

// Mock VideoPill to inspect props passed to it
vi.mock("../VideoPill", () => ({
  default: ({
    video,
    selected,
    multiSelected,
    onClick,
  }: {
    video: VideoFile;
    selected: boolean;
    multiSelected: boolean;
    onClick: (e: React.MouseEvent) => void;
  }) => (
    <div
      data-testid={`video-pill-${video.name}`}
      data-selected={selected ? "true" : "false"}
      data-multiselected={multiSelected ? "true" : "false"}
      onClick={onClick}
    >
      <span>{video.name}</span>
    </div>
  ),
}));

// Mock InlinePlayer to inspect onPrev and onNext callbacks
vi.mock("../InlinePlayer", () => ({
  default: ({
    video,
    onPrev,
    onNext,
  }: {
    video: VideoFile;
    onPrev: (() => void) | null;
    onNext: (() => void) | null;
  }) => (
    <div data-testid="inline-player">
      <span data-testid="playing-video">{video.name}</span>
      {onPrev && (
        <button data-testid="btn-prev" onClick={onPrev}>
          Prev
        </button>
      )}
      {onNext && (
        <button data-testid="btn-next" onClick={onNext}>
          Next
        </button>
      )}
    </div>
  ),
}));

describe("PlayerView Component", () => {
  const allVideos: VideoFile[] = [
    {
      path: "/videos/global_0.mp4",
      name: "global_0.mp4",
      size: 100,
      modTime: 1000,
      folder: "/global",
      game: "",
    },
    {
      path: "/videos/outplayed_1.mp4",
      name: "outplayed_1.mp4",
      size: 200,
      modTime: 2000,
      folder: "/outplayed",
      game: "League of Legends",
    },
    {
      path: "/videos/global_2.mp4",
      name: "global_2.mp4",
      size: 300,
      modTime: 3000,
      folder: "/global",
      game: "",
    },
    {
      path: "/videos/outplayed_3.mp4",
      name: "outplayed_3.mp4",
      size: 400,
      modTime: 4000,
      folder: "/outplayed",
      game: "League of Legends",
    },
    {
      path: "/videos/outplayed_4.mp4",
      name: "outplayed_4.mp4",
      size: 500,
      modTime: 5000,
      folder: "/outplayed",
      game: "League of Legends",
    },
  ];

  // Filtered list (e.g. folder "/outplayed")
  const filteredVideos: VideoFile[] = [
    allVideos[1], // outplayed_1.mp4 (filtered index 0, allVideos index 1)
    allVideos[3], // outplayed_3.mp4 (filtered index 1, allVideos index 3)
    allVideos[4], // outplayed_4.mp4 (filtered index 2, allVideos index 4)
  ];

  const defaultProps = {
    sortedVideos: filteredVideos,
    allVideos: allVideos,
    selectedVideo: allVideos[3], // outplayed_3.mp4 is currently selected/playing
    selectedIndex: 3, // index in allVideos is 3
    streamPort: 9000,
    listRef: { current: null },
    listRoot: null,
    selectedPaths: [],
    onGoTo: vi.fn(),
    onVideoClick: vi.fn(),
    onUploadTarget: vi.fn(),
    onAddToQueue: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accurately highlights the active video matching selectedVideo path even when filtered index differs from selectedIndex", () => {
    render(<PlayerView {...defaultProps} />);

    // In filteredVideos:
    // idx 0: outplayed_1.mp4 -> should NOT be selected
    // idx 1: outplayed_3.mp4 -> MUST BE SELECTED (even though idx 1 != selectedIndex 3)
    // idx 2: outplayed_4.mp4 -> should NOT be selected

    const pill1 = screen.getByTestId("video-pill-outplayed_1.mp4");
    const pill3 = screen.getByTestId("video-pill-outplayed_3.mp4");
    const pill4 = screen.getByTestId("video-pill-outplayed_4.mp4");

    expect(pill1.getAttribute("data-selected")).toBe("false");
    expect(pill3.getAttribute("data-selected")).toBe("true");
    expect(pill4.getAttribute("data-selected")).toBe("false");
  });

  it("does not highlight any video if selectedVideo is not in the filtered list", () => {
    render(
      <PlayerView
        {...defaultProps}
        selectedVideo={allVideos[0]} // global_0.mp4 (not in filteredVideos)
        selectedIndex={0} // matches index 0 in filteredVideos if checked by index!
      />,
    );

    const pill1 = screen.getByTestId("video-pill-outplayed_1.mp4");
    const pill3 = screen.getByTestId("video-pill-outplayed_3.mp4");
    const pill4 = screen.getByTestId("video-pill-outplayed_4.mp4");

    expect(pill1.getAttribute("data-selected")).toBe("false");
    expect(pill3.getAttribute("data-selected")).toBe("false");
    expect(pill4.getAttribute("data-selected")).toBe("false");
  });

  it("does not highlight active video when multi-selection is active", () => {
    render(
      <PlayerView
        {...defaultProps}
        selectedPaths={["/videos/outplayed_1.mp4", "/videos/outplayed_4.mp4"]}
      />,
    );

    const pill3 = screen.getByTestId("video-pill-outplayed_3.mp4");
    expect(pill3.getAttribute("data-selected")).toBe("false");
  });

  it("calls onGoTo with the correct allVideos index when navigating Next and Prev in filtered list", () => {
    const onGoTo = vi.fn();
    render(
      <PlayerView
        {...defaultProps}
        selectedVideo={filteredVideos[1]} // outplayed_3.mp4 (allVideos index 3)
        onGoTo={onGoTo}
      />,
    );

    // Prev should go to filteredVideos[0] which is outplayed_1.mp4 (allVideos index 1)
    const prevBtn = screen.getByTestId("btn-prev");
    fireEvent.click(prevBtn);
    expect(onGoTo).toHaveBeenCalledWith(1);

    // Next should go to filteredVideos[2] which is outplayed_4.mp4 (allVideos index 4)
    const nextBtn = screen.getByTestId("btn-next");
    fireEvent.click(nextBtn);
    expect(onGoTo).toHaveBeenCalledWith(4);
  });

  it("calls onVideoClick with the sidebar index when a video pill is clicked", () => {
    const onVideoClick = vi.fn();
    render(<PlayerView {...defaultProps} onVideoClick={onVideoClick} />);

    const pill4 = screen.getByTestId("video-pill-outplayed_4.mp4");
    fireEvent.click(pill4);

    expect(onVideoClick).toHaveBeenCalledWith(2, expect.anything());
  });
});
