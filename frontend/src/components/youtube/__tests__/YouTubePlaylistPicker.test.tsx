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
      { id: "pl-1", title: "Control Walkthrough", videoCount: 5 },
      { id: "pl-2", title: "Hades Runs", videoCount: 12 },
    ]);
    (AddVideoToPlaylist as any).mockResolvedValue(undefined);
    (GetOrCreatePlaylist as any).mockResolvedValue("pl-new-id");
  });

  it("renders Add to Playlist button and opens popover on click", async () => {
    render(<YouTubePlaylistPicker videoId="vid-1" />);

    const openBtn = screen.getByRole("button", { name: /add to playlist/i });
    expect(openBtn).toBeInTheDocument();

    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByText("Control Walkthrough")).toBeInTheDocument();
      expect(screen.getByText("Hades Runs")).toBeInTheDocument();
    });
  });

  it("adds video to existing playlist when clicked", async () => {
    const onAdded = vi.fn();
    render(<YouTubePlaylistPicker videoId="vid-1" onPlaylistAdded={onAdded} />);

    fireEvent.click(screen.getByRole("button", { name: /add to playlist/i }));

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
    render(<YouTubePlaylistPicker videoId="vid-1" onPlaylistAdded={onAdded} />);

    fireEvent.click(screen.getByRole("button", { name: /add to playlist/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /\+ new/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /\+ new/i }));

    const input = screen.getByPlaceholderText(/playlist name\.\.\./i);
    fireEvent.change(input, { target: { value: "Alan Wake 2" } });

    const createBtn = screen.getByRole("button", { name: /create & add/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(GetOrCreatePlaylist).toHaveBeenCalledWith("Alan Wake 2", "", "unlisted");
      expect(AddVideoToPlaylist).toHaveBeenCalledWith("pl-new-id", "vid-1");
      expect(onAdded).toHaveBeenCalled();
    });
  });
});
