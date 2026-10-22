import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UploadedCleanupModal from "../UploadedCleanupModal";
import * as appBackend from "../../../../wailsjs/go/backend/App";
import { VideoFile } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  DeleteFiles: vi.fn().mockResolvedValue(undefined),
}));

const mockUploadedVideos: VideoFile[] = [
  {
    name: "video1.mp4",
    path: "/recordings/video1.mp4",
    size: 1024 * 1024 * 500, // 500 MB
    modTime: 1700000000,
    folder: "/recordings",
    game: "Valorant",
    youtubeId: "yt_vid_1",
    youtubeTitle: "Uploaded Video 1",
  },
  {
    name: "video2.mp4",
    path: "/recordings/video2.mp4",
    size: 1024 * 1024 * 700, // 700 MB
    modTime: 1700000100,
    folder: "/recordings",
    game: "Valorant",
    youtubeId: "yt_vid_2",
    youtubeTitle: "Uploaded Video 2",
  },
  {
    name: "unuploaded.mp4",
    path: "/recordings/unuploaded.mp4",
    size: 1024 * 1024 * 300, // 300 MB
    modTime: 1700000200,
    folder: "/recordings",
    game: "Valorant",
  },
];

describe("UploadedCleanupModal", () => {
  const onClose = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when open is false", () => {
    const { container } = render(
      <UploadedCleanupModal
        open={false}
        uploadedVideos={mockUploadedVideos}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not render when there are no uploaded videos with a youtubeId", () => {
    const { container } = render(
      <UploadedCleanupModal
        open={true}
        uploadedVideos={[mockUploadedVideos[2]]}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders only videos with youtubeId and preselects all by default", () => {
    render(
      <UploadedCleanupModal
        open={true}
        uploadedVideos={mockUploadedVideos}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    // Modal title & headers
    expect(screen.getByText("Clean Up Uploaded Recordings")).toBeInTheDocument();
    expect(screen.getByText("Uploaded Video 1")).toBeInTheDocument();
    expect(screen.getByText("Uploaded Video 2")).toBeInTheDocument();
    expect(screen.queryByText("unuploaded.mp4")).not.toBeInTheDocument();

    // Checkboxes for the 2 uploaded videos should be checked
    const checkboxes = screen.getAllByRole("checkbox");
    // Master checkbox + 2 item checkboxes = 3
    expect(checkboxes.length).toBe(3);
    checkboxes.forEach((cb) => {
      expect(cb).toBeChecked();
    });

    // Button should show total count and size (500MB + 700MB = 1200MB / ~1.17 GB)
    expect(
      screen.getByRole("button", { name: /Delete 2 Videos/i }),
    ).toBeInTheDocument();
  });

  it("toggles all checkboxes with master checkbox", () => {
    render(
      <UploadedCleanupModal
        open={true}
        uploadedVideos={mockUploadedVideos}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    const masterCheckbox = screen.getByLabelText(/select all/i);
    expect(masterCheckbox).toBeChecked();

    // Uncheck master
    fireEvent.click(masterCheckbox);
    expect(masterCheckbox).not.toBeChecked();

    const deleteBtn = screen.getByRole("button", { name: /Delete 0 Videos/i });
    expect(deleteBtn).toBeDisabled();

    // Re-check master
    fireEvent.click(masterCheckbox);
    expect(masterCheckbox).toBeChecked();
    expect(
      screen.getByRole("button", { name: /Delete 2 Videos/i }),
    ).not.toBeDisabled();
  });

  it("updates selection and recoverable size when unchecking a single video", () => {
    render(
      <UploadedCleanupModal
        open={true}
        uploadedVideos={mockUploadedVideos}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    // Uncheck first video
    const firstItemCheckbox = screen.getByLabelText("Select Uploaded Video 1");
    fireEvent.click(firstItemCheckbox);
    expect(firstItemCheckbox).not.toBeChecked();

    // Master checkbox should not be checked
    const masterCheckbox = screen.getByLabelText(/select all/i);
    expect(masterCheckbox).not.toBeChecked();

    // Button should now indicate 1 video
    expect(
      screen.getByRole("button", { name: /Delete 1 Video/i }),
    ).toBeInTheDocument();
  });

  it("calls DeleteFiles with selected file paths and triggers onDeleted", async () => {
    render(
      <UploadedCleanupModal
        open={true}
        uploadedVideos={mockUploadedVideos}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    // Uncheck first video so only second video is selected
    const firstItemCheckbox = screen.getByLabelText("Select Uploaded Video 1");
    fireEvent.click(firstItemCheckbox);

    const deleteBtn = screen.getByRole("button", { name: /Delete 1 Video/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(appBackend.DeleteFiles).toHaveBeenCalledTimes(1);
      expect(appBackend.DeleteFiles).toHaveBeenCalledWith([
        "/recordings/video2.mp4",
      ]);
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("handles deletion errors without crashing and shows error message", async () => {
    vi.mocked(appBackend.DeleteFiles).mockRejectedValueOnce(
      new Error("Disk permission denied"),
    );

    render(
      <UploadedCleanupModal
        open={true}
        uploadedVideos={mockUploadedVideos}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: /Delete 2 Videos/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Disk permission denied/i)).toBeInTheDocument();
      expect(onDeleted).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("closes modal without deleting when clicking Keep Files / Later", () => {
    render(
      <UploadedCleanupModal
        open={true}
        uploadedVideos={mockUploadedVideos}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    const keepBtn = screen.getByRole("button", { name: /Keep Files \/ Later/i });
    fireEvent.click(keepBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(appBackend.DeleteFiles).not.toHaveBeenCalled();
  });
});
