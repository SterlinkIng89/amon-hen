import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import StatsBar from "../StatsBar";
import { VideoFile } from "../../../types";

const mockVideos: VideoFile[] = [
  {
    name: "video1.mp4",
    path: "/path/video1.mp4",
    size: 1024 * 1024 * 500, // 500 MB
    modTime: 1700000000,
    folder: "/path",
    game: "",
    youtubeId: "yt1",
  },
  {
    name: "video2.mp4",
    path: "/path/video2.mp4",
    size: 1024 * 1024 * 200, // 200 MB
    modTime: 1700000100,
    folder: "/path",
    game: "",
  },
];

describe("StatsBar", () => {
  it("renders null if videos array is empty", () => {
    const { container } = render(<StatsBar videos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders video count, total disk size and uploaded progress", () => {
    render(<StatsBar videos={mockVideos} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("videos")).toBeInTheDocument();
    expect(screen.getByText("700.00 MB")).toBeInTheDocument();
    expect(screen.getByText("on disk")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBe(2);
    expect(screen.getByText("/ 2 uploaded")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders cleanup button when onOpenCleanup is provided and uploadedCount > 0", () => {
    const onOpenCleanup = vi.fn();
    render(<StatsBar videos={mockVideos} onOpenCleanup={onOpenCleanup} />);

    const cleanupBtn = screen.getByRole("button", {
      name: /Clean up \(Free 500\.00 MB\)/i,
    });
    expect(cleanupBtn).toBeInTheDocument();

    fireEvent.click(cleanupBtn);
    expect(onOpenCleanup).toHaveBeenCalledTimes(1);
  });

  it("does not render cleanup button if there are no uploaded videos", () => {
    const unuploadedVideos: VideoFile[] = [
      {
        name: "unup.mp4",
        path: "/path/unup.mp4",
        size: 1024 * 1024 * 100,
        modTime: 1700000000,
        folder: "/path",
        game: "",
      },
    ];
    const onOpenCleanup = vi.fn();
    render(<StatsBar videos={unuploadedVideos} onOpenCleanup={onOpenCleanup} />);

    expect(
      screen.queryByRole("button", { name: /Clean up/i }),
    ).not.toBeInTheDocument();
  });
});
