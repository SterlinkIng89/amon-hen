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
  SetTagPlaylistConfig: vi.fn().mockResolvedValue(undefined),
  SetTagThumbnailConfig: vi.fn().mockResolvedValue(undefined),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({}),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
  SaveCustomThumbnail: vi.fn().mockResolvedValue("C:/cache/thumbs/custom.jpg"),
  SetYouTubePlaylistThumbnail: vi.fn().mockResolvedValue("/cache/yt_thumbs/custom.jpg?v=1"),
  LoadConfig: vi.fn().mockResolvedValue({
    tag_playlists: {},
    tag_playlist_configs: {},
  }),
}));

describe("TagPlaylistModal", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,123");
  });

  it("should create playlist with default 'public' privacy when no preference is stored", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <TagPlaylistModal tag="Valorant" onClose={onClose} onSaved={onSaved} />,
    );

    // Check that privacy option Public is selected by default
    const publicBtns = screen.getAllByRole("button", { name: /public/i });
    expect(publicBtns[0]).toBeInTheDocument();

    const createBtns = screen.getAllByRole("button", { name: /create & link/i });
    fireEvent.click(createBtns[0]);

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

    const unlistedBtns = screen.getAllByRole("button", { name: /unlisted/i });
    fireEvent.click(unlistedBtns[0]);

    expect(useAppStore.getState().defaultPlaylistPrivacy).toBe("unlisted");

    const createBtns = screen.getAllByRole("button", { name: /create & link/i });
    fireEvent.click(createBtns[0]);

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

  it("should initialize visibility selectors to public and reset to public on tag switch even if store had different privacy", async () => {
    useAppStore.setState({ defaultPlaylistPrivacy: "unlisted" });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    const { rerender } = render(
      <TagPlaylistModal tag="Minecraft" onClose={onClose} onSaved={onSaved} />,
    );

    const createBtns = screen.getAllByRole("button", { name: /create & link/i });
    fireEvent.click(createBtns[0]);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith(
        "Minecraft",
        "",
        "public",
      );
    });

    // Manually switch privacy to private
    const privateBtns = screen.getAllByRole("button", { name: /private/i });
    fireEvent.click(privateBtns[0]);

    // Rerender with a new tag
    rerender(
      <TagPlaylistModal tag="Terraria" onClose={onClose} onSaved={onSaved} />,
    );

    const newCreateBtns = screen.getAllByRole("button", { name: /create & link/i });
    fireEvent.click(newCreateBtns[0]);

    await waitFor(() => {
      expect(appBackend.GetOrCreatePlaylist).toHaveBeenCalledWith(
        "Terraria",
        "",
        "public",
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
      const vodSelect = screen.getByLabelText("Select playlist");
      const options = Array.from(vodSelect.querySelectorAll("option"));
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

    const vodSelect = await screen.findByLabelText("Select playlist");
    await waitFor(() => {
      expect(vodSelect.textContent).toContain("Apex Legends");
    });

    const searchInput = screen.getByLabelText("Search playlists");
    fireEvent.change(searchInput, { target: { value: "mario" } });

    const options = Array.from(vodSelect.querySelectorAll("option")).map((opt) => opt.textContent);
    expect(options).toEqual([
      "Select a playlist...",
      "Mario Kart",
      "Mario Party",
    ]);
    expect(vodSelect.textContent).not.toContain("Apex Legends");
    expect(vodSelect.textContent).not.toContain("Zelda Highlights");
  });

  it("should show empty state when search query matches no playlists and clear restores list", async () => {
    vi.mocked(appBackend.GetChannelPlaylists).mockResolvedValue([
      mockPlaylist("pl-1", "Apex Legends"),
    ]);

    render(
      <TagPlaylistModal tag="Test" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    const vodSelect = await screen.findByLabelText("Select playlist");
    await waitFor(() => {
      expect(vodSelect.textContent).toContain("Apex Legends");
    });

    const searchInput = screen.getByLabelText("Search playlists");
    fireEvent.change(searchInput, { target: { value: "Unknown Game" } });

    expect(vodSelect.textContent).toContain("No playlists found...");
    expect(vodSelect.textContent).not.toContain("Apex Legends");

    const clearBtn = screen.getByLabelText("Clear playlist search");
    fireEvent.click(clearBtn);

    expect(vodSelect.textContent).toContain("Apex Legends");
  });

  it("should link selected existing playlist when user selects one and clicks link", async () => {
    vi.mocked(appBackend.GetChannelPlaylists).mockResolvedValue([
      mockPlaylist("pl-100", "Valorant Ranked"),
    ]);

    const onSaved = vi.fn();
    render(
      <TagPlaylistModal tag="Valorant" onClose={vi.fn()} onSaved={onSaved} />,
    );

    const select = await screen.findByLabelText("Select playlist");
    await waitFor(() => {
      expect(select.textContent).toContain("Valorant Ranked");
    });

    fireEvent.change(select, { target: { value: "pl-100" } });

    const linkBtn = screen.getByRole("button", { name: /link selected/i });
    expect(linkBtn).not.toBeDisabled();
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(appBackend.SetTagPlaylist).toHaveBeenCalledWith(
        "Valorant",
        "pl-100",
      );
      expect(appBackend.SetTagPlaylistConfig).toHaveBeenCalledWith(
        "Valorant",
        "pl-100",
        "",
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should link selected existing playlist to clip playlist", async () => {
    vi.mocked(appBackend.GetChannelPlaylists).mockResolvedValue([
      mockPlaylist("pl-clip-1", "Valorant Clips"),
    ]);

    const onSaved = vi.fn();
    render(
      <TagPlaylistModal tag="Valorant" onClose={vi.fn()} onSaved={onSaved} />,
    );

    const select = await screen.findByLabelText("Select clip playlist");
    await waitFor(() => {
      expect(select.textContent).toContain("Valorant Clips");
    });

    fireEvent.change(select, { target: { value: "pl-clip-1" } });

    const linkBtn = screen.getByRole("button", { name: /link clip/i });
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(appBackend.SetTagPlaylistConfig).toHaveBeenCalledWith(
        "Valorant",
        "",
        "pl-clip-1",
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should handle skip by saving 'none' for both vod and clip playlist configs", async () => {
    const onSaved = vi.fn();
    render(
      <TagPlaylistModal tag="Valorant" onClose={vi.fn()} onSaved={onSaved} />,
    );

    const skipBtn = screen.getByRole("button", {
      name: /no playlist for "valorant" — don't ask again/i,
    });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(appBackend.SetTagPlaylistConfig).toHaveBeenCalledWith(
        "Valorant",
        "none",
        "none",
      );
      expect(appBackend.SetTagPlaylist).toHaveBeenCalledWith("Valorant", "none");
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should save thumbnail template config in the unified view", async () => {
    const onSaved = vi.fn();
    render(
      <TagPlaylistModal tag="Valorant" onClose={vi.fn()} onSaved={onSaved} />
    );

    expect(screen.getByText(/automate youtube thumbnail for this tag/i)).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /save thumbnail template/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should generate and upload cover thumbnail when creating playlist with cover option enabled", async () => {
    vi.mocked(appBackend.LoadConfig).mockResolvedValue({
      tag_playlists: {},
      tag_playlist_configs: {
        Valorant: {
          vod_playlist_id: "",
          clip_playlist_id: "",
          thumbnail_config: {
            enabled: true,
            source_type: "steam",
            episode_position: "bottom-right",
            episode_format: "pad2",
          },
        },
      },
    } as unknown as backend.Config);

    const onSaved = vi.fn();
    render(
      <TagPlaylistModal tag="Valorant" onClose={vi.fn()} onSaved={onSaved} />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/apply cover artwork automatically to vod playlist/i)).toBeInTheDocument();
    });

    const createBtns = screen.getAllByRole("button", { name: /create & link/i });
    fireEvent.click(createBtns[0]);

    await waitFor(() => {
      expect(appBackend.SetYouTubePlaylistThumbnail).toHaveBeenCalledWith(
        "pl-123",
        expect.any(String)
      );
    });
  });
});


