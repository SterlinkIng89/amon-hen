import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import VideoGrid from "../VideoGrid";
import { VideoFile, VideoGroup } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  LoadConfig: vi.fn().mockResolvedValue({ game_profiles: {} }),
}));

vi.mock("../../../store/useAppStore", () => ({
  useAppStore: () => ({
    queue: [],
  }),
}));

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
    onClick?: (e: React.MouseEvent) => void;
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

describe("VideoGrid - Group Selection and Collapse", () => {
  const mockVideo1: VideoFile = {
    path: "/videos/2026-10-19/video1.mp4",
    name: "video1.mp4",
    size: 1048576,
    modTime: 1729350000,
    folder: "/videos",
    game: "TestGame",
  };

  const mockVideo2: VideoFile = {
    path: "/videos/2026-10-19/video2.mp4",
    name: "video2.mp4",
    size: 2097152,
    modTime: 1729353600,
    folder: "/videos",
    game: "TestGame",
  };

  const mockGroup: VideoGroup = {
    label: "October 19, 2026",
    dateKey: "2026-10-19",
    videos: [mockVideo1, mockVideo2],
  };

  const baseProps = {
    folders: ["/videos"],
    activeFolders: ["/videos"],
    groups: [mockGroup],
    allVideos: [mockVideo1, mockVideo2],
    sortedVideos: [mockVideo1, mockVideo2],
    sortMode: "date" as const,
    selectedPaths: [] as string[],
    onOpenVideo: vi.fn(),
    onSelectToggle: vi.fn(),
    onUploadTarget: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onSelectGroup with all video paths and true when group is unselected", async () => {
    const onSelectGroup = vi.fn();
    await act(async () => {
      render(<VideoGrid {...baseProps} onSelectGroup={onSelectGroup} />);
    });

    const selectButton = screen.getByLabelText(
      `Select all videos in ${mockGroup.label}`,
    );
    await act(async () => {
      fireEvent.click(selectButton);
    });

    expect(onSelectGroup).toHaveBeenCalledTimes(1);
    expect(onSelectGroup).toHaveBeenCalledWith(
      [mockVideo1.path, mockVideo2.path],
      true,
    );
  });

  it("calls onSelectGroup with all video paths and false when all videos in group are selected", async () => {
    const onSelectGroup = vi.fn();
    await act(async () => {
      render(
        <VideoGrid
          {...baseProps}
          selectedPaths={[mockVideo1.path, mockVideo2.path]}
          onSelectGroup={onSelectGroup}
        />,
      );
    });

    const selectButton = screen.getByLabelText(
      `Select all videos in ${mockGroup.label}`,
    );
    await act(async () => {
      fireEvent.click(selectButton);
    });

    expect(onSelectGroup).toHaveBeenCalledTimes(1);
    expect(onSelectGroup).toHaveBeenCalledWith(
      [mockVideo1.path, mockVideo2.path],
      false,
    );
  });

  it("renders indeterminate indicator and calls onSelectGroup with true when partially selected", async () => {
    const onSelectGroup = vi.fn();
    await act(async () => {
      render(
        <VideoGrid
          {...baseProps}
          selectedPaths={[mockVideo1.path]}
          onSelectGroup={onSelectGroup}
        />,
      );
    });

    const selectButton = screen.getByLabelText(
      `Select all videos in ${mockGroup.label}`,
    );
    expect(selectButton.querySelector("line")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(selectButton);
    });

    expect(onSelectGroup).toHaveBeenCalledTimes(1);
    expect(onSelectGroup).toHaveBeenCalledWith(
      [mockVideo1.path, mockVideo2.path],
      true,
    );
  });

  it("collapses and expands the group grid on chevron button click", async () => {
    await act(async () => {
      render(<VideoGrid {...baseProps} />);
    });

    expect(screen.getByTestId("video-pill-video1.mp4")).toBeInTheDocument();
    expect(screen.getByTestId("video-pill-video2.mp4")).toBeInTheDocument();

    const collapseButton = screen.getByLabelText(
      `Collapse ${mockGroup.label}`,
    );
    await act(async () => {
      fireEvent.click(collapseButton);
    });

    expect(screen.queryByTestId("video-pill-video1.mp4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("video-pill-video2.mp4")).not.toBeInTheDocument();
    expect(screen.getByText(mockGroup.label)).toBeInTheDocument();

    const expandButton = screen.getByLabelText(
      `Expand ${mockGroup.label}`,
    );
    await act(async () => {
      fireEvent.click(expandButton);
    });

    expect(screen.getByTestId("video-pill-video1.mp4")).toBeInTheDocument();
    expect(screen.getByTestId("video-pill-video2.mp4")).toBeInTheDocument();
  });

  it("renders grouped layout when groupMode is game even if sortMode is name", async () => {
    const gameGroup: VideoGroup = {
      label: "TestGame",
      dateKey: "game:TestGame",
      videos: [mockVideo1, mockVideo2],
    };

    await act(async () => {
      render(
        <VideoGrid
          {...baseProps}
          sortMode="name"
          groupMode="game"
          groups={[gameGroup]}
        />,
      );
    });

    expect(screen.getByText("TestGame")).toBeInTheDocument();
    expect(screen.getByTestId("video-pill-video1.mp4")).toBeInTheDocument();
  });

  it("renders flat layout when groupMode is none", async () => {
    await act(async () => {
      render(
        <VideoGrid
          {...baseProps}
          groupMode="none"
          groups={[]}
        />,
      );
    });

    expect(screen.queryByText(mockGroup.label)).not.toBeInTheDocument();
    expect(screen.getByTestId("video-pill-video1.mp4")).toBeInTheDocument();
    expect(screen.getByTestId("video-pill-video2.mp4")).toBeInTheDocument();
  });
});
