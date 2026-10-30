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
  GetAllGameTags: vi.fn(),
}));

describe("PlaylistCatalogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AppBindings.GetTagPlaylistConfig).mockResolvedValue({} as any);
    vi.mocked(AppBindings.GetSteamGameAssets).mockResolvedValue(null as any);
    vi.mocked(AppBindings.GetAllGameTags).mockResolvedValue(["control", "alan_wake", "cyberpunk"]);
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

  it("selects a playlist and displays tag with datalist and episode table in studio layout", async () => {
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
    vi.mocked(AppBindings.ApplyPlaylistCatalog).mockResolvedValue(true as any);

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("Control Walkthrough");
    fireEvent.click(rowBtn);

    expect(await screen.findByDisplayValue("control")).toBeInTheDocument();
    expect(screen.getByText("Control - Ep 1")).toBeInTheDocument();
    expect(screen.getByText(/Thumbnail Studio/i)).toBeInTheDocument();

    // Verify autocomplete datalist contains known tags
    const datalist = document.getElementById("catalog-known-tags");
    expect(datalist).toBeInTheDocument();
    expect(datalist?.children.length).toBe(3);

    // Verify saving with updateLocal
    const saveBtn = screen.getByRole("button", { name: /save & link playlist/i });
    expect(saveBtn).toBeInTheDocument();
    fireEvent.click(saveBtn);

    expect(AppBindings.ApplyPlaylistCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistId: "pl-1",
        tag: "control",
        updateLocal: true,
      })
    );
  });

  it("updates previewed episode when selecting video thumbnail and toggles template editor", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "Control Series", videoCount: 2, linked: true, tag: "control" },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-1",
      title: "Control Series",
      videoCount: 2,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: true,
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
        {
          videoId: "yt-2",
          title: "Control - Ep 2",
          existingEpisode: 0,
          episode: 2,
          conflict: false,
        },
      ],
    } as any);

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("Control Series");
    fireEvent.click(rowBtn);

    expect(await screen.findByText("Control - Ep 1")).toBeInTheDocument();
    expect(screen.getByText("Control - Ep 2")).toBeInTheDocument();

    // Initially previewing Episode #1
    expect(screen.getByText(/Previewing Episode #1/i)).toBeInTheDocument();

    // Click Ep 2 thumbnail preview button to switch preview
    const previewButtons = screen.getAllByRole("button", { name: /preview .* in thumbnail studio/i });
    expect(previewButtons.length).toBe(2);
    fireEvent.click(previewButtons[1]);

    expect(screen.getByText(/Previewing Episode #2/i)).toBeInTheDocument();

    // Toggle template editor
    const customizeBtn = screen.getByRole("button", { name: /customize/i });
    fireEvent.click(customizeBtn);
    expect(screen.getByText(/Template Editor for "control"/i)).toBeInTheDocument();

    // Verify unified single interactive canvas (no duplicate preview canvas rendered in collapsible editor)
    const interactiveCanvases = screen.getAllByLabelText(/Thumbnail canvas preview with interactive elements/i);
    expect(interactiveCanvases.length).toBe(1);
    expect(screen.queryByText("Thumbnail Preview")).not.toBeInTheDocument();
  });
});

