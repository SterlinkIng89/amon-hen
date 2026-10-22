import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import YouTubePlaylistPicker from "../YouTubePlaylistPicker";
import {
  GetChannelPlaylists,
  AddVideoToPlaylist,
  GetOrCreatePlaylist,
} from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetChannelPlaylists: vi.fn(),
  AddVideoToPlaylist: vi.fn(),
  GetOrCreatePlaylist: vi.fn(),
}));

describe("YouTubePlaylistPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (GetChannelPlaylists as any).mockResolvedValue([
      {
        id: "pl-1",
        title: "Control Walkthrough",
        description: "",
        videoCount: 5,
        thumbnailUrl: "",
        publishedAt: "2026-01-01T00:00:00Z",
        privacy: "public",
        duplicateCount: 0,
      },
      {
        id: "pl-2",
        title: "Hades Runs",
        description: "",
        videoCount: 12,
        thumbnailUrl: "",
        publishedAt: "2026-01-01T00:00:00Z",
        privacy: "public",
        duplicateCount: 0,
      },
    ]);
    (AddVideoToPlaylist as any).mockResolvedValue(undefined);
    (GetOrCreatePlaylist as any).mockResolvedValue("pl-new-id");
  });

  it("renders searchable combobox and displays playlists on focus", async () => {
    render(<YouTubePlaylistPicker videoId="vid-1" playlistTitle="Control Series" />);

    expect(screen.getByText(/linked: control series/i)).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/select playlist/i);
    expect(input).toBeInTheDocument();

    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("Control Walkthrough")).toBeInTheDocument();
      expect(screen.getByText("Hades Runs")).toBeInTheDocument();
    });
  });

  it("adds video to existing playlist when option is clicked", async () => {
    const onAdded = vi.fn();
    render(<YouTubePlaylistPicker videoId="vid-1" onPlaylistAdded={onAdded} />);

    const input = await screen.findByPlaceholderText(/select playlist/i);
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("Control Walkthrough")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Control Walkthrough"));

    await waitFor(() => {
      expect(AddVideoToPlaylist).toHaveBeenCalledWith("pl-1", "vid-1");
      expect(onAdded).toHaveBeenCalled();
    });
  });

  it("creates new playlist and adds video", async () => {
    const onAdded = vi.fn();
    render(
      <YouTubePlaylistPicker
        videoId="vid-1"
        defaultPrivacy="unlisted"
        onPlaylistAdded={onAdded}
      />
    );

    const newBtn = screen.getByRole("button", { name: /new playlist/i });
    fireEvent.click(newBtn);

    const input = screen.getByPlaceholderText(/playlist name/i);
    fireEvent.change(input, { target: { value: "Alan Wake 2" } });

    const createBtn = screen.getByRole("button", { name: "Create" });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(GetOrCreatePlaylist).toHaveBeenCalledWith("Alan Wake 2", "", "unlisted");
      expect(AddVideoToPlaylist).toHaveBeenCalledWith("pl-new-id", "vid-1");
      expect(onAdded).toHaveBeenCalled();
    });
  });
});
