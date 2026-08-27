import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TagPlaylistModal from "../TagPlaylistModal";
import * as appBackend from "../../../../wailsjs/go/backend/App";
import { useAppStore } from "../../../store/useAppStore";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("pl-123"),
  SetTagPlaylist: vi.fn().mockResolvedValue(undefined),
}));

describe("TagPlaylistModal", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAppStore.setState({ defaultPlaylistPrivacy: "public" });
  });

  it("should create playlist with default 'public' privacy when no preference is stored", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(<TagPlaylistModal tag="Valorant" onClose={onClose} onSaved={onSaved} />);

    // Check that privacy option Public is selected by default
    const publicBtn = screen.getByRole("button", { name: /public/i });
    expect(publicBtn).toBeInTheDocument();

    const createBtn = screen.getByRole("button", { name: /create & link/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith("Valorant", "", "public");
      expect(appBackend.SetTagPlaylist).toHaveBeenCalledWith("Valorant", "pl-123");
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should allow changing privacy, persist it, and create playlist with updated privacy", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(<TagPlaylistModal tag="Overwatch" onClose={onClose} onSaved={onSaved} />);

    const unlistedBtn = screen.getByRole("button", { name: /unlisted/i });
    fireEvent.click(unlistedBtn);

    expect(useAppStore.getState().defaultPlaylistPrivacy).toBe("unlisted");

    const createBtn = screen.getByRole("button", { name: /create & link/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith("Overwatch", "", "unlisted");
      expect(appBackend.SetTagPlaylist).toHaveBeenCalledWith("Overwatch", "pl-123");
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should initialize privacy selector from stored preference across sessions", async () => {
    useAppStore.setState({ defaultPlaylistPrivacy: "private" });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(<TagPlaylistModal tag="Minecraft" onClose={onClose} onSaved={onSaved} />);

    const createBtn = screen.getByRole("button", { name: /create & link/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith("Minecraft", "", "private");
    });
  });
});
