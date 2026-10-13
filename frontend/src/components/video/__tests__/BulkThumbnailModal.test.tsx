import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BulkThumbnailModal } from "../BulkThumbnailModal";
import { VideoFile } from "../../../types";
import * as AppBindings from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetTagPlaylistConfig: vi.fn().mockResolvedValue(null),
  GetSteamGameAssets: vi.fn().mockResolvedValue(null),
  UpdateYouTubeThumbnail: vi.fn().mockResolvedValue(""),
}));

describe("BulkThumbnailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleVideos: VideoFile[] = [
    {
      name: "ep1.mp4",
      path: "/vids/ep1.mp4",
      size: 100,
      modTime: 100,
      folder: "/vids",
      game: "Control",
      episode: 1,
      youtubeId: "yt-1",
    },
    {
      name: "ep2.mp4",
      path: "/vids/ep2.mp4",
      size: 100,
      modTime: 100,
      folder: "/vids",
      game: "Control",
      episode: 2,
      youtubeId: "yt-2",
    },
  ];

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <BulkThumbnailModal
        isOpen={false}
        onClose={vi.fn()}
        tag="Control"
        videos={sampleVideos}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders modal header, estimated quota and responds to close", () => {
    const onClose = vi.fn();
    render(
      <BulkThumbnailModal
        isOpen={true}
        onClose={onClose}
        tag="Control"
        videos={sampleVideos}
      />
    );

    expect(screen.getByText(/Update YouTube Thumbnails/i)).toBeInTheDocument();
    expect(screen.getByText(/Control/i)).toBeInTheDocument();
    expect(screen.getByText(/100 units/i)).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "✕" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
