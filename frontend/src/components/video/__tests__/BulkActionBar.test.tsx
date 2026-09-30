import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BulkActionBar from "../BulkActionBar";
import * as appBackend from "../../../../wailsjs/go/backend/App";
import { VideoFile } from "../../../types";

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
});
