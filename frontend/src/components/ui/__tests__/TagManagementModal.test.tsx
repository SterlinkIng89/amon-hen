import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TagManagementModal from "../TagManagementModal";
import * as appBackend from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetAllGameTags: vi.fn(),
  LoadConfig: vi.fn(),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("pl-new"),
  SetTagPlaylist: vi.fn().mockResolvedValue(undefined),
  SetTagPlaylistConfig: vi.fn().mockResolvedValue(undefined),
  SetTagThumbnailConfig: vi.fn().mockResolvedValue(undefined),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({}),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
}));

describe("TagManagementModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appBackend.GetAllGameTags).mockResolvedValue(["Valorant", "Elden Ring"]);
    vi.mocked(appBackend.LoadConfig).mockResolvedValue({
      tag_playlists: { Valorant: "pl-vod-val" },
      tag_playlist_configs: {
        Valorant: {
          vod_playlist_id: "pl-vod-val",
          clip_playlist_id: "pl-clip-val",
          thumbnail_config: {
            enabled: true,
            source_type: "steam",
            episode_position: "bottom-right",
            episode_format: "pad2",
          },
        },
      },
    } as any);
  });

  it("renders tag list with indicators and selects first tag by default", async () => {
    const onClose = vi.fn();
    render(<TagManagementModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Valorant")).toBeInTheDocument();
      expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    });

    // Badges for Valorant
    expect(screen.getByText("VOD")).toBeInTheDocument();
    expect(screen.getByText("Clip")).toBeInTheDocument();
    expect(screen.getByText("Thumb")).toBeInTheDocument();

    // Editor is populated for default tag
    await waitFor(() => {
      expect(screen.getByTestId("editor-tag-name")).toHaveTextContent('"Valorant"');
    });
  });

  it("filters tags with search bar", async () => {
    render(<TagManagementModal onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Valorant")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search tags");
    fireEvent.change(searchInput, { target: { value: "Elden" } });

    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    expect(screen.queryByText("Valorant")).not.toBeInTheDocument();
  });

  it("allows selecting a different tag", async () => {
    render(<TagManagementModal onClose={vi.fn()} />);

    const eldenItem = await screen.findByTestId("tag-item-Elden Ring");
    expect(eldenItem).toBeInTheDocument();

    fireEvent.click(eldenItem);

    await waitFor(() => {
      expect(screen.getByTestId("editor-tag-name")).toHaveTextContent('"Elden Ring"');
    });
  });

  it("closes modal on Escape key press", async () => {
    const onClose = vi.fn();
    render(<TagManagementModal onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes modal on close button click", async () => {
    const onClose = vi.fn();
    render(<TagManagementModal onClose={onClose} />);

    const closeBtn = screen.getByLabelText("Close modal");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
