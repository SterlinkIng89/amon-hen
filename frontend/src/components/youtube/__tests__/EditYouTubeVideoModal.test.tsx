import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import EditYouTubeVideoModal from "../EditYouTubeVideoModal";
import { YTVideo, YTPlaylist } from "../../../types";

// Mock Wails backend App calls
vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UpdateYouTubeVideoMetadata: vi.fn().mockResolvedValue(undefined),
  AddVideoToPlaylist: vi.fn().mockResolvedValue(undefined),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("new-pl-123"),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue("C:\\thumbs\\new.png"),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue("https://example.com/new-thumb.jpg"),
  LoadConfig: vi.fn().mockResolvedValue({
    tag_playlist_configs: {},
    tag_playlists: {},
  }),
}));

// Mock YouTubeThumbnailPicker
vi.mock("../YouTubeThumbnailPicker", () => ({
  default: function DummyThumbnailPicker(props: any) {
    return (
      <div data-testid="mock-thumbnail-picker">
        <button
          type="button"
          onClick={() => props.onYouTubeUpdated?.("https://example.com/updated.jpg")}
        >
          Simulate Picker Update
        </button>
      </div>
    );
  },
}));

const mockVideo: YTVideo = {
  id: "test-vid-123",
  title: "Original Video Title",
  description: "Original Video Description",
  publishedAt: "2026-03-15T12:00:00Z",
  thumbnailUrl: "https://example.com/thumb.jpg",
  viewCount: 2500,
  likeCount: 180,
  duration: "PT15M30S",
  privacy: "unlisted",
  localFile: "",
};

const mockPlaylists: YTPlaylist[] = [
  {
    id: "pl-1",
    title: "Gameplay Highlights",
    description: "",
    thumbnailUrl: "",
    videoCount: 12,
    privacy: "public",
    publishedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "pl-2",
    title: "Tutorials & Guides",
    description: "",
    thumbnailUrl: "",
    videoCount: 5,
    privacy: "unlisted",
    publishedAt: "2026-01-01T00:00:00Z",
  },
];

describe("EditYouTubeVideoModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-fills form inputs with video title, description, and privacy", () => {
    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    expect(titleInput.value).toBe("Original Video Title");

    const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descInput.value).toBe("Original Video Description");

    const privacySelect = screen.getByLabelText(/privacy/i) as HTMLSelectElement;
    expect(privacySelect.value).toBe("unlisted");
  });

  it("saves updated metadata when clicking Save Changes", async () => {
    const { UpdateYouTubeVideoMetadata } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={handleClose}
        onSaved={handleSaved}
      />,
    );

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: "Updated Title" } });

    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: "Updated Description" } });

    const privacySelect = screen.getByLabelText(/privacy/i);
    fireEvent.change(privacySelect, { target: { value: "public" } });

    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(UpdateYouTubeVideoMetadata).toHaveBeenCalledWith(
        "test-vid-123",
        "Updated Title",
        "Updated Description",
        "public",
      );
      expect(handleSaved).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it("saves updated metadata when pressing Ctrl+S", async () => {
    const { UpdateYouTubeVideoMetadata } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={handleClose}
        onSaved={handleSaved}
      />,
    );

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(UpdateYouTubeVideoMetadata).toHaveBeenCalledWith(
        "test-vid-123",
        "Original Video Title",
        "Original Video Description",
        "unlisted",
      );
      expect(handleSaved).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it("saves updated metadata when pressing Ctrl+Enter", async () => {
    const { UpdateYouTubeVideoMetadata } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={handleClose}
        onSaved={handleSaved}
      />,
    );

    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(UpdateYouTubeVideoMetadata).toHaveBeenCalledWith(
        "test-vid-123",
        "Original Video Title",
        "Original Video Description",
        "unlisted",
      );
      expect(handleSaved).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it("closes modal on Escape key press", () => {
    const handleClose = vi.fn();

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={handleClose}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("closes modal on Cancel button click", () => {
    const handleClose = vi.fn();

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={handleClose}
        onSaved={vi.fn()}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("adds video to playlist when selecting a playlist", async () => {
    const { AddVideoToPlaylist } = await import(
      "../../../../wailsjs/go/backend/App"
    );

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const accordionBtn = screen.getByText("Playlist Assignment");
    fireEvent.click(accordionBtn);

    const playlistBtn = screen.getByText("Gameplay Highlights");
    fireEvent.click(playlistBtn);

    await waitFor(() => {
      expect(AddVideoToPlaylist).toHaveBeenCalledWith("pl-1", "test-vid-123");
    });
  });

  it("uploads custom thumbnail file and notifies onSaved", async () => {
    const { SelectCustomThumbnailImage, UpdateYouTubeThumbnail } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    const handleSaved = vi.fn();

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={vi.fn()}
        onSaved={handleSaved}
      />,
    );

    const uploadBtn = screen.getByRole("button", { name: /upload image file/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(SelectCustomThumbnailImage).toHaveBeenCalledTimes(1);
      expect(UpdateYouTubeThumbnail).toHaveBeenCalledWith(
        "test-vid-123",
        "C:\\thumbs\\new.png",
      );
      expect(handleSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("shows error banner if saving metadata fails", async () => {
    const { UpdateYouTubeVideoMetadata } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    vi.mocked(UpdateYouTubeVideoMetadata).mockRejectedValueOnce(
      new Error("YouTube API quota exceeded"),
    );

    render(
      <EditYouTubeVideoModal
        video={mockVideo}
        playlists={mockPlaylists}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/YouTube API quota exceeded/i),
      ).toBeInTheDocument();
    });
  });
});
