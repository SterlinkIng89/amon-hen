import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaylistCatalogPanel } from "../PlaylistCatalogPanel";
import { useAppStore } from "../../../../store/useAppStore";
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
  LoadConfig: vi.fn(),
  GetPlaylistVideos: vi.fn(),
  GetTitleNormalizationDrafts: vi.fn(),
  SaveTitleNormalizationDraftsBatch: vi.fn(),
  MarkTitleNormalizationDraftSynced: vi.fn(),
  UpdateYouTubeVideoMetadata: vi.fn(),
  UpdateYouTubeVideoGameMeta: vi.fn(),
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

const MOCK_PLAYLIST = {
  playlistId: "pl-1",
  title: "Control Walkthrough",
  videoCount: 2,
  linked: true,
  tag: "control",
};

const MOCK_DRAFT = {
  playlistId: "pl-1",
  title: "Control Walkthrough",
  videoCount: 2,
  kind: "vod",
  tag: "control",
  tagConfidence: "high",
  linked: true,
  steamAppId: "870780",
  needsSync: false,
  videos: [
    {
      videoId: "yt-1",
      title: "Control - Ep 1",
      existingEpisode: 1,
      episode: 1,
      conflict: false,
    },
  ],
};

const MOCK_YT_VIDEOS = [
  {
    id: "yt-1",
    title: "Control - Gameplay Part 1",
    description: "",
    publishedAt: "2026-01-10T12:00:00Z",
    thumbnailUrl: "https://example.com/1.jpg",
    duration: "10:00",
    viewCount: 100,
    likeCount: 10,
    privacyStatus: "public",
    gameTag: "control",
  },
];

describe("PlaylistCatalogPanel - Normalize Titles integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.getState().clearBatchJobs();
    vi.mocked(AppBindings.ListCatalogPlaylists).mockResolvedValue([MOCK_PLAYLIST] as never);
    vi.mocked(AppBindings.GetPlaylistCatalogDraft).mockResolvedValue(MOCK_DRAFT as never);
    vi.mocked(AppBindings.GetSteamAppID).mockResolvedValue("870780" as never);
    vi.mocked(AppBindings.GetTagPlaylistConfig).mockResolvedValue({} as never);
    vi.mocked(AppBindings.GetSteamGameAssets).mockResolvedValue(null as never);
    vi.mocked(AppBindings.GetAllGameTags).mockResolvedValue(["control"] as never);
    vi.mocked(AppBindings.LoadConfig).mockResolvedValue({
      game_profiles: {
        control: {
          tag: "control",
          title_template: "{game} - {event} - Ep {episode}",
          default_event: "Main Story",
        },
      },
      recent_field_values: {
        event: ["Main Story"],
      },
    } as never);
    vi.mocked(AppBindings.GetPlaylistVideos).mockResolvedValue(MOCK_YT_VIDEOS as never);
    vi.mocked(AppBindings.GetTitleNormalizationDrafts).mockResolvedValue([] as never);
  });

  it("renders mode toggle when a playlist is selected and switches to Normalize Titles", async () => {
    render(<PlaylistCatalogPanel />);

    fireEvent.click(await screen.findByText("Control Walkthrough"));
    await screen.findByDisplayValue("control");

    const episodesTab = screen.getByRole("button", { name: /episodes & thumbnails/i });
    const normalizeTab = screen.getByRole("button", { name: /normalize titles/i });

    expect(episodesTab).toBeInTheDocument();
    expect(normalizeTab).toBeInTheDocument();

    // Flat UI styling checks: no uppercase, no drop-shadow, no glow
    expect(normalizeTab.className).not.toMatch(/uppercase|drop-shadow|shadow-\[0_0_/);

    fireEvent.click(normalizeTab);

    // PlaylistNormalizerTable should mount and load videos for pl-1 with tag "control"
    expect(await screen.findByText("Control - Gameplay Part 1")).toBeInTheDocument();
    expect(AppBindings.GetPlaylistVideos).toHaveBeenCalledWith("pl-1");
  });

  it("invokes onOpenVideoInPlayer when clicking Watch on a normalizer row", async () => {
    const onOpenVideoInPlayer = vi.fn();
    render(<PlaylistCatalogPanel onOpenVideoInPlayer={onOpenVideoInPlayer} />);

    fireEvent.click(await screen.findByText("Control Walkthrough"));
    await screen.findByDisplayValue("control");

    fireEvent.click(screen.getByRole("button", { name: /normalize titles/i }));
    await screen.findByText("Control - Gameplay Part 1");

    const watchBtn = screen.getByRole("button", { name: /watch/i });
    fireEvent.click(watchBtn);

    expect(onOpenVideoInPlayer).toHaveBeenCalledWith(
      "pl-1",
      expect.objectContaining({ id: "yt-1", title: "Control - Gameplay Part 1" }),
      "control",
    );
  });

  it("reloads normalizer drafts when refreshTrigger increments", async () => {
    const { rerender } = render(<PlaylistCatalogPanel refreshTrigger={0} />);

    fireEvent.click(await screen.findByText("Control Walkthrough"));
    await screen.findByDisplayValue("control");

    fireEvent.click(screen.getByRole("button", { name: /normalize titles/i }));
    await screen.findByText("Control - Gameplay Part 1");

    const initialCalls = vi.mocked(AppBindings.GetTitleNormalizationDrafts).mock.calls.length;

    rerender(<PlaylistCatalogPanel refreshTrigger={1} />);

    await waitFor(() => {
      expect(vi.mocked(AppBindings.GetTitleNormalizationDrafts).mock.calls.length).toBeGreaterThan(
        initialCalls,
      );
    });
  });
});
