import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TagPlaylistModal from "../TagPlaylistModal";
import * as appBackend from "../../../../wailsjs/go/backend/App";
import { useAppStore } from "../../../store/useAppStore";
import { backend } from "../../../../wailsjs/go/models";

const mockPlaylist = (id: string, title: string): backend.YTPlaylist => ({
  id,
  title,
  description: "",
  videoCount: 0,
  thumbnailUrl: "",
  publishedAt: "2026-01-01",
  privacy: "public",
  duplicateCount: 0,
});

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

    render(
      <TagPlaylistModal tag="Valorant" onClose={onClose} onSaved={onSaved} />,
    );

    // Check that privacy option Public is selected by default
    const publicBtn = screen.getByRole("button", { name: /public/i });
    expect(publicBtn).toBeInTheDocument();

    const createBtn = screen.getByRole("button", { name: /create & link/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith(
        "Valorant",
        "",
        "public",
      );
      expect(appBackend.SetTagPlaylist).toHaveBeenCalledWith(
        "Valorant",
        "pl-123",
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should allow changing privacy, persist it, and create playlist with updated privacy", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <TagPlaylistModal tag="Overwatch" onClose={onClose} onSaved={onSaved} />,
    );

    const unlistedBtn = screen.getByRole("button", { name: /unlisted/i });
    fireEvent.click(unlistedBtn);

    expect(useAppStore.getState().defaultPlaylistPrivacy).toBe("unlisted");

    const createBtn = screen.getByRole("button", { name: /create & link/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith(
        "Overwatch",
        "",
        "unlisted",
      );
      expect(appBackend.SetTagPlaylist).toHaveBeenCalledWith(
        "Overwatch",
        "pl-123",
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should initialize privacy selector from stored preference across sessions", async () => {
    useAppStore.setState({ defaultPlaylistPrivacy: "private" });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <TagPlaylistModal tag="Minecraft" onClose={onClose} onSaved={onSaved} />,
    );

    const createBtn = screen.getByRole("button", { name: /create & link/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith(
        "Minecraft",
        "",
        "private",
      );
    });
  });

  it("should sort playlists alphabetically A-Z in existing playlist select", async () => {
    vi.mocked(appBackend.GetChannelPlaylists).mockResolvedValue([
      mockPlaylist("pl-z", "Zelda Highlights"),
      mockPlaylist("pl-a", "Apex Legends"),
      mockPlaylist("pl-m", "Mario Kart"),
    ]);

    render(
      <TagPlaylistModal tag="Gaming" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const optionTexts = options.map((opt) => opt.textContent);
      expect(optionTexts).toEqual([
        "Select a playlist...",
        "Apex Legends",
        "Mario Kart",
        "Zelda Highlights",
      ]);
    });
  });

  it("should filter playlists in real-time as user types in the search input", async () => {
    vi.mocked(appBackend.GetChannelPlaylists).mockResolvedValue([
      mockPlaylist("pl-1", "Apex Legends"),
      mockPlaylist("pl-2", "Mario Kart"),
      mockPlaylist("pl-3", "Mario Party"),
      mockPlaylist("pl-4", "Zelda Highlights"),
    ]);

    render(
      <TagPlaylistModal tag="Mario" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Apex Legends")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search playlists");
    fireEvent.change(searchInput, { target: { value: "mario" } });

    const options = screen.getAllByRole("option").map((opt) => opt.textContent);
    expect(options).toEqual([
      "Select a playlist...",
      "Mario Kart",
      "Mario Party",
    ]);
    expect(screen.queryByText("Apex Legends")).not.toBeInTheDocument();
    expect(screen.queryByText("Zelda Highlights")).not.toBeInTheDocument();
  });

  it("should show empty state when search query matches no playlists and clear restores list", async () => {
    vi.mocked(appBackend.GetChannelPlaylists).mockResolvedValue([
      mockPlaylist("pl-1", "Apex Legends"),
    ]);

    render(
      <TagPlaylistModal tag="Test" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Apex Legends")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search playlists");
    fireEvent.change(searchInput, { target: { value: "Unknown Game" } });

    expect(screen.getByText("No playlists found...")).toBeInTheDocument();
    expect(screen.queryByText("Apex Legends")).not.toBeInTheDocument();

    const clearBtn = screen.getByLabelText("Clear playlist search");
    fireEvent.click(clearBtn);

    expect(screen.getByText("Apex Legends")).toBeInTheDocument();
  });

  it("should link selected existing playlist when user selects one and clicks link", async () => {
    vi.mocked(appBackend.GetChannelPlaylists).mockResolvedValue([
      mockPlaylist("pl-100", "Valorant Ranked"),
    ]);

    const onSaved = vi.fn();
    render(
      <TagPlaylistModal tag="Valorant" onClose={vi.fn()} onSaved={onSaved} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Valorant Ranked")).toBeInTheDocument();
    });

    const select = screen.getByLabelText("Select playlist");
    fireEvent.change(select, { target: { value: "pl-100" } });

    const linkBtn = screen.getByRole("button", { name: /link selected/i });
    expect(linkBtn).not.toBeDisabled();
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(appBackend.SetTagPlaylist).toHaveBeenCalledWith(
        "Valorant",
        "pl-100",
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });
});
