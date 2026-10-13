import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaylistCatalogPanel } from "../PlaylistCatalogPanel";
import * as AppBindings from "../../../../../wailsjs/go/backend/App";

vi.mock("../../../../../wailsjs/go/backend/App", () => ({
  ListCatalogPlaylists: vi.fn(),
  GetPlaylistCatalogDraft: vi.fn(),
  ApplyPlaylistCatalog: vi.fn(),
  GetSteamAppID: vi.fn(),
  GetTagPlaylistConfig: vi.fn(),
  GetSteamGameAssets: vi.fn(),
  UpdateYouTubeThumbnail: vi.fn(),
}));

describe("PlaylistCatalogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AppBindings.GetTagPlaylistConfig).mockResolvedValue({} as any);
    vi.mocked(AppBindings.GetSteamGameAssets).mockResolvedValue(null as any);
  });

  it("renders playlists list and empty selection state initially", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "Control Walkthrough", videoCount: 5, linked: false, tag: "" },
      { playlistId: "pl-2", title: "Alan Wake Playthrough", videoCount: 3, linked: true, tag: "alan_wake" },
    ] as any);

    render(<PlaylistCatalogPanel />);

    expect(await screen.findByText("Control Walkthrough")).toBeInTheDocument();
    expect(screen.getByText("Alan Wake Playthrough")).toBeInTheDocument();
    expect(screen.getByText(/Select a playlist to map game tag and episodes/i)).toBeInTheDocument();
  });

  it("selects a playlist and displays tag and episode table", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "Control Walkthrough", videoCount: 1, linked: false, tag: "" },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-1",
      title: "Control Walkthrough",
      videoCount: 1,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: false,
      steamAppId: "870780",
      needsSync: true,
      videos: [
        {
          videoId: "yt-1",
          title: "Control - Ep 1",
          existingEpisode: 0,
          episode: 1,
          conflict: false,
        },
      ],
    } as any);
    vi.mocked(AppBindings.GetSteamAppID).mockResolvedValue("870780");

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("Control Walkthrough");
    fireEvent.click(rowBtn);

    expect(await screen.findByDisplayValue("control")).toBeInTheDocument();
    expect(screen.getByText("Control - Ep 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save & link playlist/i })).toBeInTheDocument();
  });
});
