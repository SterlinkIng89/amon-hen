import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DeleteVideoModal from "../DeleteVideoModal";
import { YTVideo } from "../../../types";
import * as appBackend from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  DeleteYouTubeVideo: vi.fn().mockResolvedValue(undefined),
  DeleteYouTubeVideos: vi.fn().mockResolvedValue([["vid-1", "vid-2"], []]),
}));

const mockSingleVideo: YTVideo = {
  id: "vid-single",
  title: "Amazing Match 1v5 Ace",
  description: "Epic clutch moment",
  publishedAt: "2026-02-15T12:00:00Z",
  thumbnailUrl: "https://example.com/single.jpg",
  viewCount: 1500,
  likeCount: 120,
  duration: "04:12",
  privacy: "public",
  localFile: "C:\\Videos\\ace.mp4",
};

const mockBulkVideos: YTVideo[] = [
  mockSingleVideo,
  {
    id: "vid-bulk-2",
    title: "Eco Round Strategy",
    description: "Guide on eco rounds",
    publishedAt: "2026-02-16T15:30:00Z",
    thumbnailUrl: "https://example.com/bulk2.jpg",
    viewCount: 340,
    likeCount: 45,
    duration: "10:00",
    privacy: "unlisted",
  },
];

describe("DeleteVideoModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("single mode: requires acknowledgement checkbox AND typing DELETE to enable confirm button", () => {
    const handleClose = vi.fn();
    const handleDeleted = vi.fn();

    render(
      <DeleteVideoModal
        videos={[mockSingleVideo]}
        onClose={handleClose}
        onDeleted={handleDeleted}
      />,
    );

    expect(screen.getByText("Amazing Match 1v5 Ace")).toBeInTheDocument();
    expect(screen.getByText(/vid-single/)).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: /^Delete Video$/i });
    expect(deleteBtn).toBeDisabled();

    // Check acknowledgement checkbox
    const ackCheckbox = screen.getByRole("checkbox", {
      name: /I understand this video will be permanently erased/i,
    });
    fireEvent.click(ackCheckbox);
    expect(deleteBtn).toBeDisabled();

    // Type incorrect text
    const textInput = screen.getByPlaceholderText('Type "DELETE" to confirm');
    fireEvent.change(textInput, { target: { value: "del" } });
    expect(deleteBtn).toBeDisabled();

    // Type DELETE
    fireEvent.change(textInput, { target: { value: "DELETE" } });
    expect(deleteBtn).not.toBeDisabled();
  });

  it("single mode: invokes DeleteYouTubeVideo with deleteLocalFile=false by default", async () => {
    const handleClose = vi.fn();
    const handleDeleted = vi.fn();

    render(
      <DeleteVideoModal
        videos={[mockSingleVideo]}
        onClose={handleClose}
        onDeleted={handleDeleted}
      />,
    );

    const ackCheckbox = screen.getByRole("checkbox", {
      name: /I understand this video will be permanently erased/i,
    });
    fireEvent.click(ackCheckbox);

    const textInput = screen.getByPlaceholderText('Type "DELETE" to confirm');
    fireEvent.change(textInput, { target: { value: "DELETE" } });

    const deleteBtn = screen.getByRole("button", { name: /^Delete Video$/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(appBackend.DeleteYouTubeVideo).toHaveBeenCalledWith(
        "vid-single",
        false,
      );
      expect(handleDeleted).toHaveBeenCalledWith(["vid-single"]);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("single mode: passes deleteLocalFile=true when local file checkbox is checked", async () => {
    const handleClose = vi.fn();
    const handleDeleted = vi.fn();

    render(
      <DeleteVideoModal
        videos={[mockSingleVideo]}
        onClose={handleClose}
        onDeleted={handleDeleted}
      />,
    );

    const localCheckbox = screen.getByRole("checkbox", {
      name: /Also delete local recording file from disk/i,
    });
    fireEvent.click(localCheckbox);

    const ackCheckbox = screen.getByRole("checkbox", {
      name: /I understand this video will be permanently erased/i,
    });
    fireEvent.click(ackCheckbox);

    const textInput = screen.getByPlaceholderText('Type "DELETE" to confirm');
    fireEvent.change(textInput, { target: { value: "DELETE" } });

    const deleteBtn = screen.getByRole("button", { name: /^Delete Video$/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(appBackend.DeleteYouTubeVideo).toHaveBeenCalledWith(
        "vid-single",
        true,
      );
    });
  });

  it("bulk mode: displays item count, lists all titles, and calls DeleteYouTubeVideos", async () => {
    const handleClose = vi.fn();
    const handleDeleted = vi.fn();

    render(
      <DeleteVideoModal
        videos={mockBulkVideos}
        onClose={handleClose}
        onDeleted={handleDeleted}
      />,
    );

    expect(screen.getByText("Delete 2 Videos from YouTube?")).toBeInTheDocument();
    expect(screen.getByText("Amazing Match 1v5 Ace")).toBeInTheDocument();
    expect(screen.getByText("Eco Round Strategy")).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: /Delete 2 Videos/i });
    expect(deleteBtn).toBeDisabled();

    // Type DELETE
    const textInput = screen.getByPlaceholderText('Type "DELETE" to confirm');
    fireEvent.change(textInput, { target: { value: "DELETE" } });
    expect(deleteBtn).not.toBeDisabled();

    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(appBackend.DeleteYouTubeVideos).toHaveBeenCalledWith(
        ["vid-single", "vid-bulk-2"],
        false,
      );
      expect(handleDeleted).toHaveBeenCalledWith(["vid-1", "vid-2"]);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("handles errors gracefully and displays error message", async () => {
    (appBackend.DeleteYouTubeVideo as any).mockRejectedValueOnce(
      new Error("Quota exceeded for YouTube API"),
    );

    render(
      <DeleteVideoModal
        videos={[mockSingleVideo]}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const ackCheckbox = screen.getByRole("checkbox", {
      name: /I understand this video will be permanently erased/i,
    });
    fireEvent.click(ackCheckbox);

    const textInput = screen.getByPlaceholderText('Type "DELETE" to confirm');
    fireEvent.change(textInput, { target: { value: "DELETE" } });

    const deleteBtn = screen.getByRole("button", { name: /^Delete Video$/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Quota exceeded for YouTube API/i),
      ).toBeInTheDocument();
    });
  });
});
