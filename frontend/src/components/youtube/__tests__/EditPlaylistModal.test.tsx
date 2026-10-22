import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import EditPlaylistModal from "../EditPlaylistModal";
import { YTPlaylist } from "../../../types";
import { UpdatePlaylistMetadata } from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UpdatePlaylistMetadata: vi.fn(),
}));

const mockPlaylist: YTPlaylist = {
  id: "pl-test-123",
  title: "Original Playlist Title",
  description: "Original description for playlist",
  thumbnailUrl: "https://example.com/thumb.jpg",
  videoCount: 15,
  privacy: "public",
  publishedAt: "2026-01-01T00:00:00Z",
};

describe("EditPlaylistModal", () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with initial playlist data pre-populated", () => {
    render(
      <EditPlaylistModal
        playlist={mockPlaylist}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByDisplayValue("Original Playlist Title")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Original description for playlist"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Public")).toBeInTheDocument();
  });

  it("submits updated metadata and triggers onSaved and onClose", async () => {
    vi.mocked(UpdatePlaylistMetadata).mockResolvedValueOnce(undefined);

    render(
      <EditPlaylistModal
        playlist={mockPlaylist}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const titleInput = screen.getByLabelText(/Title/i);
    const descInput = screen.getByLabelText(/Description/i);
    const privacySelect = screen.getByLabelText(/Privacy/i);

    fireEvent.change(titleInput, { target: { value: "   Updated Title   " } });
    fireEvent.change(descInput, { target: { value: "New Description" } });
    fireEvent.change(privacySelect, { target: { value: "unlisted" } });

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(UpdatePlaylistMetadata).toHaveBeenCalledWith(
        "pl-test-123",
        "Updated Title",
        "New Description",
        "unlisted",
      );
      expect(onSaved).toHaveBeenCalledWith({
        ...mockPlaylist,
        title: "Updated Title",
        description: "New Description",
        privacy: "unlisted",
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables save button when title is blank or whitespace", () => {
    render(
      <EditPlaylistModal
        playlist={mockPlaylist}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const titleInput = screen.getByLabelText(/Title/i);
    fireEvent.change(titleInput, { target: { value: "   " } });

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    expect(saveButton).toBeDisabled();
  });

  it("displays error message when UpdatePlaylistMetadata fails", async () => {
    vi.mocked(UpdatePlaylistMetadata).mockRejectedValueOnce(
      new Error("Error: YouTube quota exceeded"),
    );

    render(
      <EditPlaylistModal
        playlist={mockPlaylist}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("YouTube quota exceeded")).toBeInTheDocument();
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles keyboard shortcuts (Escape and Ctrl+S)", async () => {
    vi.mocked(UpdatePlaylistMetadata).mockResolvedValueOnce(undefined);

    render(
      <EditPlaylistModal
        playlist={mockPlaylist}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // Escape closes modal
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Ctrl+S triggers save
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => {
      expect(UpdatePlaylistMetadata).toHaveBeenCalledWith(
        "pl-test-123",
        "Original Playlist Title",
        "Original description for playlist",
        "public",
      );
    });
  });
});
