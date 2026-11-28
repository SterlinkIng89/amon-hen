import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BulkActionBar from "../BulkActionBar";
import * as appBackend from "../../../../wailsjs/go/backend/App";
import { VideoFile, GameProfile } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  SetVideoGames: vi.fn().mockResolvedValue(undefined),
  DeleteFiles: vi.fn().mockResolvedValue(undefined),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  SetVideosPlaylist: vi.fn().mockResolvedValue(undefined),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("pl-123"),
  LoadConfig: vi.fn().mockResolvedValue({
    game_profiles: {},
    tag_playlists: {},
  }),
  SetVideosContentType: vi.fn().mockResolvedValue(undefined),
  GetDefaultExportFolder: vi.fn().mockResolvedValue("/default/export"),
  SetDefaultExportFolder: vi.fn().mockResolvedValue(undefined),
  SelectExportFolder: vi.fn().mockResolvedValue("/custom/export"),
  ExportVideos: vi.fn().mockResolvedValue({ successCount: 2, failedCount: 0, exportedPaths: [], errors: [] }),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue(null),
  GetTagPlaylistConfig: vi.fn().mockResolvedValue(null),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
  GetVideosFromFolders: vi.fn().mockResolvedValue([]),
}));

const mockVideos: VideoFile[] = [
  {
    name: "video1.mp4",
    path: "/path/video1.mp4",
    size: 1024,
    modTime: 123456,
    folder: "/path",
    game: "Valorant",
    contentType: "vod",
  },
  {
    name: "video2.mp4",
    path: "/path/video2.mp4",
    size: 2048,
    modTime: 123457,
    folder: "/path",
    game: "Valorant",
    contentType: "vod",
  },
];

describe("BulkActionBar ContentType routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders content type select with current common type", async () => {
    render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Content type override") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("vod");
  });

  it("calls SetVideosContentType with clip when Force Clip is selected", async () => {
    const onRescanOnly = vi.fn();
    render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={onRescanOnly}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Content type override");
    fireEvent.change(select, { target: { value: "clip" } });

    await waitFor(() => {
      expect(appBackend.SetVideosContentType).toHaveBeenCalledWith(
        ["/path/video1.mp4", "/path/video2.mp4"],
        "clip",
      );
      expect(onRescanOnly).toHaveBeenCalled();
    });
  });

  it("calls SetVideosContentType with empty string when Auto is selected", async () => {
    const onRescanOnly = vi.fn();
    render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={onRescanOnly}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Content type override");
    fireEvent.change(select, { target: { value: "auto" } });

    await waitFor(() => {
      expect(appBackend.SetVideosContentType).toHaveBeenCalledWith(
        ["/path/video1.mp4", "/path/video2.mp4"],
        "",
      );
      expect(onRescanOnly).toHaveBeenCalled();
    });
  });

  it("opens ExportModal when clicking the Export button", async () => {
    render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const exportBtn = screen.getByRole("button", { name: "Export 2" });
    expect(exportBtn).toBeInTheDocument();

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Export Videos")).toBeInTheDocument();
    });
  });

  it("renders Thumbnails button and opens BulkThumbnailModal when videos share a tag and have youtubeIds", async () => {
    const ytVideos: VideoFile[] = [
      {
        ...mockVideos[0],
        youtubeId: "yt-1",
        game: "Control",
        episode: 1,
      },
      {
        ...mockVideos[1],
        youtubeId: "yt-2",
        game: "Control",
        episode: 2,
      },
    ];

    render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={ytVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const thumbBtn = screen.getByRole("button", { name: /Thumbnails \(2\)/i });
    expect(thumbBtn).toBeInTheDocument();

    fireEvent.click(thumbBtn);

    await waitFor(() => {
      expect(screen.getByText("Update YouTube Thumbnails")).toBeInTheDocument();
      expect(screen.getByText(/Control/i)).toBeInTheDocument();
    });
  });

  it("calls generateAndSaveTagThumbnail for each selected path on save", async () => {
    const tagThumb = await import("../../../utils/generateTagThumbnail");
    const spy = vi
      .spyOn(tagThumb, "generateAndSaveTagThumbnail")
      .mockResolvedValue("/cache/yt_thumbs/mock.jpg");

    render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const tagInput = screen.getByPlaceholderText("Game Tag");
    fireEvent.change(tagInput, { target: { value: "Valorant" } });

    const applyBtn = screen.getByRole("button", { name: "Apply" });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          videoPath: "/path/video1.mp4",
          tag: "Valorant",
        }),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          videoPath: "/path/video2.mp4",
          tag: "Valorant",
        }),
      );
    });
  });

  it("calls generateAndSaveTagThumbnail with updated episode numbers returned from rescan", async () => {
    const tagThumb = await import("../../../utils/generateTagThumbnail");
    const spy = vi
      .spyOn(tagThumb, "generateAndSaveTagThumbnail")
      .mockResolvedValue("/cache/yt_thumbs/mock.jpg");

    const onRescanOnly = vi.fn().mockResolvedValue([
      { ...mockVideos[0], path: "/path/video1.mp4", episode: 14, youtubeTitle: "CONTROL - 14" },
    ]);

    render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4"]}
        selectedVideos={mockVideos.slice(0, 1)}
        onClearSelection={vi.fn()}
        onRescanOnly={onRescanOnly}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const tagInput = screen.getByPlaceholderText("Game Tag");
    fireEvent.change(tagInput, { target: { value: "Valorant" } });

    const applyBtn = screen.getByRole("button", { name: "Apply" });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          videoPath: "/path/video1.mp4",
          tag: "Valorant",
          episodeNumber: 14,
        }),
      );
    });
  });

  it("immediately uses passed gameProfiles and titleSeparator in ExportModal before LoadConfig resolves", async () => {
    vi.mocked(appBackend.LoadConfig).mockImplementation(
      () => new Promise(() => {}),
    );

    const gameProfiles: Record<string, GameProfile> = {
      "League of Legends": {
        type: "multiplayer",
        titleTemplate: "{champion} - {event} - {gamemode} - {date}",
      },
    };

    const lolClip: VideoFile = {
      name: "lol_clip.mp4",
      path: "/path/lol_clip.mp4",
      size: 4096,
      modTime: new Date(2026, 10, 22, 12, 0, 0).getTime(),
      folder: "/path",
      game: "League of Legends",
      contentType: "clip",
      event: "Flop",
      gameMode: "Summoner's Rift",
      customVars: { champion: "Neeko" },
    };

    render(
      <BulkActionBar
        selectedPaths={["/path/lol_clip.mp4"]}
        selectedVideos={[lolClip]}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
        gameProfiles={gameProfiles}
        titleSeparator=" — "
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export 1" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(
      screen.getByText("AH\u2013XXXXXXXX \u2013 League of Legends.mp4"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "YouTube title: Neeko - Flop - Summoner's Rift - 22/11/26",
      ),
    ).toBeInTheDocument();
  });

  it("preserves typed Game Tag input when re-rendered with a new selectedVideos array reference for the same paths", async () => {
    const untaggedVideos: VideoFile[] = [
      { ...mockVideos[0], game: "" },
      { ...mockVideos[1], game: "" },
    ];

    const { rerender } = render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={untaggedVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const tagInput = screen.getByPlaceholderText("Game Tag") as HTMLInputElement;
    fireEvent.change(tagInput, { target: { value: "Elden Ring" } });
    expect(tagInput.value).toBe("Elden Ring");

    rerender(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={untaggedVideos.map((v) => ({ ...v }))}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    expect((screen.getByPlaceholderText("Game Tag") as HTMLInputElement).value).toBe(
      "Elden Ring",
    );
  });

  it("preserves edited Game Tag input for profile-tagged videos when selectedVideos reference changes", async () => {
    const gameProfiles: Record<string, GameProfile> = {
      Valorant: {
        type: "multiplayer",
        titleTemplate: "{game} - {date}",
      },
    };

    const { rerender } = render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
        gameProfiles={gameProfiles}
      />,
    );

    const tagInput = screen.getByPlaceholderText("Game Tag") as HTMLInputElement;
    expect(tagInput.value).toBe("Valorant");

    fireEvent.change(tagInput, { target: { value: "Valorant Custom" } });
    expect(tagInput.value).toBe("Valorant Custom");

    rerender(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos.map((v) => ({ ...v }))}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
        gameProfiles={gameProfiles}
      />,
    );

    expect((screen.getByPlaceholderText("Game Tag") as HTMLInputElement).value).toBe(
      "Valorant Custom",
    );
  });

  it("preserves contentTypeOverride when re-rendered with a new selectedVideos array reference for the same paths", async () => {
    vi.mocked(appBackend.SetVideosContentType).mockImplementation(
      () => new Promise(() => {}),
    );

    const { rerender } = render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Content type override") as HTMLSelectElement;
    expect(select.value).toBe("vod");

    fireEvent.change(select, { target: { value: "clip" } });
    expect(select.value).toBe("clip");

    rerender(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos.map((v) => ({ ...v }))}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
      />,
    );

    expect(
      (screen.getByLabelText("Content type override") as HTMLSelectElement).value,
    ).toBe("clip");
  });

  it("resets and auto-detects game tag, profile, and contentType when selectedPaths change", async () => {
    const gameProfiles: Record<string, GameProfile> = {
      Valorant: {
        type: "multiplayer",
        titleTemplate: "{game} - {date}",
      },
      Control: {
        type: "singleplayer",
        titleTemplate: "{game} - {episode}",
      },
    };

    const controlClip: VideoFile = {
      name: "control1.mp4",
      path: "/path/control1.mp4",
      size: 2048,
      modTime: 123458,
      folder: "/path",
      game: "Control",
      contentType: "clip",
    };

    const { rerender } = render(
      <BulkActionBar
        selectedPaths={["/path/video1.mp4", "/path/video2.mp4"]}
        selectedVideos={mockVideos}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
        gameProfiles={gameProfiles}
      />,
    );

    expect((screen.getByPlaceholderText("Game Tag") as HTMLInputElement).value).toBe(
      "Valorant",
    );
    expect(
      (screen.getByLabelText("Content type override") as HTMLSelectElement).value,
    ).toBe("vod");

    rerender(
      <BulkActionBar
        selectedPaths={["/path/control1.mp4"]}
        selectedVideos={[controlClip]}
        onClearSelection={vi.fn()}
        onRescanOnly={vi.fn()}
        onTagsSaved={vi.fn()}
        onFilesDeleted={vi.fn()}
        onAddToQueue={vi.fn()}
        gameProfiles={gameProfiles}
      />,
    );

    expect((screen.getByPlaceholderText("Game Tag") as HTMLInputElement).value).toBe(
      "Control",
    );
    expect(
      (screen.getByLabelText("Content type override") as HTMLSelectElement).value,
    ).toBe("clip");
  });
});
