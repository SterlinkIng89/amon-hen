import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaylistCatalogPanel } from "../PlaylistCatalogPanel";
import * as AppBindings from "../../../../../wailsjs/go/backend/App";

vi.mock("../../../../../wailsjs/go/backend/App", () => ({
  ListCatalogPlaylists: vi.fn(),
  GetPlaylistCatalogDraft: vi.fn(),
  ApplyPlaylistCatalog: vi.fn(),
  GetSteamAppID: vi.fn(),
  GetTagPlaylistConfig: vi.fn(),
  SetTagThumbnailConfig: vi.fn(),
  SaveCustomThumbnail: vi.fn(),
  GetSteamGameAssets: vi.fn(),
  UpdateYouTubeThumbnail: vi.fn(),
  UpdateYouTubeThumbnailForEpisode: vi.fn(),
  GetCustomThumbnail: vi.fn(),
  GetAllGameTags: vi.fn(),
}));

vi.mock("../../../../utils/thumbnailRender", () => ({
  renderTagThumbnailDataUrl: vi.fn().mockReturnValue("data:image/jpeg;base64,renderedtemplate"),
}));

vi.mock("../../../../hooks/useThumbnailAssets", () => ({
  useThumbnailAssets: vi.fn().mockReturnValue({
    baseImage: {} as HTMLImageElement,
    logoImage: null,
    gameTitle: "Control",
    loadingAssets: false,
  }),
}));

describe("PlaylistCatalogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AppBindings.GetSteamAppID).mockResolvedValue("" as any);
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

    // Template editor is open by default
    expect(screen.getByText(/Template Editor for "control"/i)).toBeInTheDocument();
    const hideBtn = screen.getByRole("button", { name: /hide editor/i });
    expect(hideBtn).toBeInTheDocument();

    // Toggle template editor to hide and show again
    fireEvent.click(hideBtn);
    expect(screen.queryByText(/Template Editor for "control"/i)).not.toBeInTheDocument();
    const customizeBtn = screen.getByRole("button", { name: /customize/i });
    fireEvent.click(customizeBtn);
    expect(screen.getByText(/Template Editor for "control"/i)).toBeInTheDocument();

    // Verify unified single interactive canvas (no duplicate preview canvas rendered in collapsible editor)
    const interactiveCanvases = screen.getAllByLabelText(/Thumbnail canvas preview with interactive elements/i);
    expect(interactiveCanvases.length).toBe(1);
    expect(screen.queryByText("Thumbnail Preview")).not.toBeInTheDocument();
  });

  it("renders and saves thumbnail template preview via SaveCustomThumbnail and updates playlist row on Save Template", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "Control Walkthrough", videoCount: 1, linked: true, tag: "control", hasCustomTemplate: false },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-1",
      title: "Control Walkthrough",
      videoCount: 1,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: true,
      hasCustomTemplate: false,
      videos: [
        { videoId: "yt-1", title: "Control - Ep 1", existingEpisode: 0, episode: 1, conflict: false },
      ],
    } as any);
    vi.mocked(AppBindings.SetTagThumbnailConfig).mockResolvedValue(undefined as any);
    vi.mocked(AppBindings.SaveCustomThumbnail).mockResolvedValue("/cache/yt_thumbs/tag_template_control.jpg");

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("Control Walkthrough");
    fireEvent.click(rowBtn);

    const saveTemplateBtn = await screen.findByRole("button", { name: /save template/i });
    fireEvent.click(saveTemplateBtn);

    await waitFor(() => {
      expect(AppBindings.SetTagThumbnailConfig).toHaveBeenCalledWith(
        "control",
        expect.anything()
      );
    });

    await waitFor(() => {
      expect(AppBindings.SaveCustomThumbnail).toHaveBeenCalledWith(
        "tag_template_control",
        "data:image/jpeg;base64,renderedtemplate"
      );
    });

    expect(await screen.findByText("Template saved!")).toBeInTheDocument();
  });

  it("displays sync from title button and synchronizes episodes on click", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "Control Walkthrough", videoCount: 2, linked: false, tag: "control" },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-1",
      title: "Control Walkthrough",
      videoCount: 2,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: false,
      videos: [
        {
          videoId: "yt-1",
          title: "Control - Episode 10 - End Game",
          existingEpisode: 1,
          episode: 1,
          titleEpisode: 10,
          source: "db",
          conflict: false,
        },
        {
          videoId: "yt-2",
          title: "Control - Episode 2 - Investigation",
          existingEpisode: 2,
          episode: 2,
          titleEpisode: 2,
          source: "title",
          conflict: false,
        },
      ],
    } as any);

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("Control Walkthrough");
    fireEvent.click(rowBtn);

    // Mismatched row should show Title: 10 and Use 10 button
    expect(await screen.findByText("Title: 10")).toBeInTheDocument();
    const useBtn = screen.getByRole("button", { name: /Use 10/i });
    expect(useBtn).toBeInTheDocument();

    // Toolbar shows Sync all from title (1)
    const syncAllBtn = screen.getByRole("button", { name: /Sync all from title/i });
    expect(syncAllBtn).toHaveTextContent("1");

    // Click Use 10 button
    fireEvent.click(useBtn);

    // Episode input should be updated to 10
    const inputs = screen.getAllByRole("spinbutton");
    expect((inputs[0] as HTMLInputElement).value).toBe("10");

    // Mismatch pill should now be gone
    expect(screen.queryByText("Title: 10")).not.toBeInTheDocument();
    expect(syncAllBtn).toBeDisabled();
  });

  it("displays Out of order badge and disables save when episodes violate chronology", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "Control Walkthrough", videoCount: 2, linked: false, tag: "control" },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-1",
      title: "Control Walkthrough",
      videoCount: 2,
      kind: "vod",
      tag: "control",
      tagConfidence: "high",
      linked: false,
      videos: [
        {
          videoId: "yt-1",
          title: "Control - Part 2",
          publishedAt: "2024-01-01T12:00:00Z",
          sortDate: "2024-01-01",
          existingEpisode: 2,
          episode: 2,
          position: 1,
        },
        {
          videoId: "yt-2",
          title: "Control - Part 1",
          publishedAt: "2024-01-02T12:00:00Z",
          sortDate: "2024-01-02",
          existingEpisode: 1,
          episode: 1,
          position: 2,
        },
      ],
    } as any);

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("Control Walkthrough");
    fireEvent.click(rowBtn);

    // Both videos violate chronological order (ep 2 before ep 1)
    expect(await screen.findAllByText("Out of order")).not.toHaveLength(0);

    // Save & link playlist button must be disabled due to chronology errors with explanatory feedback
    const saveBtn = screen.getByRole("button", { name: /save & link playlist/i });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText("Resolve chronological order violations to save")).toBeInTheDocument();
  });

  it("displays conflict banner with direct title sync action to resolve duplicates", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "P3R Playthrough", videoCount: 2, linked: false, tag: "p3r" },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-1",
      title: "P3R Playthrough",
      videoCount: 2,
      kind: "vod",
      tag: "p3r",
      tagConfidence: "high",
      linked: false,
      videos: [
        {
          videoId: "yt-1",
          title: "Persona 3 Reload - 20/07/26 - 2",
          publishedAt: "2026-07-20T12:00:00Z",
          titleEpisode: 2,
          existingEpisode: 31,
          episode: 31,
          position: 1,
        },
        {
          videoId: "yt-2",
          title: "Persona 3 Reload - 14/08/26 - 31",
          publishedAt: "2026-08-14T12:00:00Z",
          titleEpisode: 31,
          existingEpisode: 31,
          episode: 31,
          position: 2,
        },
      ],
    } as any);

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("P3R Playthrough");
    fireEvent.click(rowBtn);

    // Conflict banner is shown due to duplicate episode 31
    expect(
      await screen.findByText(/Please resolve duplicate or invalid episode numbers before saving to database/i)
    ).toBeInTheDocument();

    // Explanatory reason next to disabled save button
    expect(screen.getByText("Resolve duplicate or invalid episode numbers to save")).toBeInTheDocument();
    const saveBtn = screen.getByRole("button", { name: /save & link playlist/i });
    expect(saveBtn).toBeDisabled();

    // Resolution action via table toolbar button
    const syncAllBtn = screen.getByRole("button", { name: /Sync all from title/i });
    expect(syncAllBtn).toBeInTheDocument();
    expect(syncAllBtn).toHaveTextContent("1");

    // Clicking it applies title episode 2 to yt-1, eliminating duplicate 31
    fireEvent.click(syncAllBtn);

    await waitFor(() => {
      expect(
        screen.queryByText(/Please resolve duplicate or invalid episode numbers before saving to database/i)
      ).not.toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();
    });
  });

  it("opens DuplicateEpisodeDialog when clicking resolve and reorders episodes", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-p3r", title: "P3R", videoCount: 3, linked: false, tag: "p3r" },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-p3r",
      title: "P3R",
      videoCount: 3,
      kind: "vod",
      tag: "p3r",
      videos: [
        {
          videoId: "yt-26a",
          title: "Persona 3 Reload - 10/08/26 - 26",
          publishedAt: "2026-08-10T12:00:00Z",
          sortDate: "2026-08-10",
          episode: 26,
          position: 1,
        },
        {
          videoId: "yt-26b",
          title: "Persona 3 Reload - 11/08/26 - 26",
          publishedAt: "2026-08-11T12:00:00Z",
          sortDate: "2026-08-11",
          episode: 26,
          position: 2,
        },
        {
          videoId: "yt-27",
          title: "Persona 3 Reload - 12/08/26 - 27",
          publishedAt: "2026-08-12T12:00:00Z",
          sortDate: "2026-08-12",
          episode: 27,
          position: 3,
        },
      ],
    } as any);

    render(<PlaylistCatalogPanel />);

    const rowBtn = await screen.findByText("P3R");
    fireEvent.click(rowBtn);

    // Look for Resolve duplicates button in banner
    const resolveBannerBtn = await screen.findByRole("button", { name: /resolve duplicates/i });
    expect(resolveBannerBtn).toBeInTheDocument();

    fireEvent.click(resolveBannerBtn);

    // Dialog appears
    expect(await screen.findByText("Resolve duplicate episode 26")).toBeInTheDocument();

    // Confirm dialog
    const applyBtn = screen.getByRole("button", { name: /apply sequence/i });
    fireEvent.click(applyBtn);

    // Dialog closes and duplicate warning disappears
    await waitFor(() => {
      expect(screen.queryByText("Resolve duplicate episode 26")).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Please resolve duplicate or invalid episode numbers before saving to database/i)
      ).not.toBeInTheDocument();
    });
  });

  it("switches playlists during active batch thumbnail update without crashing", async () => {
    const pendingUpdates: Array<(val: string) => void> = [];
    vi.mocked(AppBindings.UpdateYouTubeThumbnailForEpisode).mockImplementation(() => {
      return new Promise<string>((resolve) => {
        pendingUpdates.push(resolve);
      });
    });
    vi.mocked(AppBindings.SaveCustomThumbnail).mockResolvedValue("/cache/yt_thumbs/thumb.jpg");
    vi.mocked(AppBindings.GetCustomThumbnail).mockResolvedValue("/cache/yt_thumbs/thumb.jpg");

    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-1", title: "Dead Space 1", videoCount: 2, linked: false, tag: "dead_space" },
      { playlistId: "pl-2", title: "Deadlock", videoCount: 1, linked: false, tag: "deadlock" },
    ] as any);

    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockImplementation(async (playlistId) => {
      if (playlistId === "pl-1") {
        return {
          playlistId: "pl-1",
          title: "Dead Space 1",
          videoCount: 2,
          kind: "vod",
          tag: "dead_space",
          tagConfidence: "high",
          linked: false,
          videos: [
            { videoId: "ds-1", title: "Dead Space - Ep 1", episode: 1, thumbnailUpdatedAt: 0 },
            { videoId: "ds-2", title: "Dead Space - Ep 2", episode: 2, thumbnailUpdatedAt: 0 },
          ],
        } as any;
      }
      return {
        playlistId: "pl-2",
        title: "Deadlock",
        videoCount: 1,
        kind: "vod",
        tag: "deadlock",
        tagConfidence: "high",
        linked: false,
        videos: [
          { videoId: "dl-1", title: "Deadlock - Ep 1", episode: 1, thumbnailUpdatedAt: 0 },
        ],
      } as any;
    });

    render(<PlaylistCatalogPanel />);

    // Select Playlist 1
    const pl1Btn = await screen.findByText("Dead Space 1");
    fireEvent.click(pl1Btn);

    // Click Update Unsynced for thumbnails
    const updateUnsyncedBtn = await screen.findByTitle(/Update thumbnails for/i);
    expect(updateUnsyncedBtn).toBeInTheDocument();
    fireEvent.click(updateUnsyncedBtn);

    // Cancel button should appear indicating batch is processing
    expect(await screen.findByRole("button", { name: /cancel/i })).toBeInTheDocument();

    // Now switch to Playlist 2 while batch is in progress
    const pl2Btn = screen.getByText("Deadlock");
    fireEvent.click(pl2Btn);

    // Deadlock videos should render safely without ErrorBoundary crash
    expect(await screen.findByText("Deadlock - Ep 1")).toBeInTheDocument();

    // Resolve in-flight update from previous playlist
    for (const resolve of pendingUpdates) {
      resolve("https://yt.com/done.jpg");
    }

    // Verify view is still intact and not crashed
    expect(screen.queryByText(/channel crashed/i)).not.toBeInTheDocument();
    expect(screen.getByText("Deadlock - Ep 1")).toBeInTheDocument();
  });

  it("renders YouTube Description Batch card when a playlist draft is selected", async () => {
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([
      { playlistId: "pl-desc", title: "Desc Test Playlist", videoCount: 1, linked: false, tag: "hades" },
    ] as any);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue({
      playlistId: "pl-desc",
      title: "Desc Test Playlist",
      videoCount: 1,
      kind: "vod",
      tag: "hades",
      tagConfidence: "high",
      linked: false,
      videos: [
        { videoId: "h-1", title: "Hades 1", episode: 1, description: "Hello description" },
      ],
    } as any);

    render(<PlaylistCatalogPanel />);

    const plBtn = await screen.findByText("Desc Test Playlist");
    fireEvent.click(plBtn);

    expect(await screen.findByText("YouTube Description Batch")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter description template to apply/i)).toBeInTheDocument();
  });
});
