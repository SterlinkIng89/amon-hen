import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UploadDialog from "../UploadDialog";
import { VideoFile } from "../../../types";
import * as quotaHook from "../../../hooks/useQuotaStatus";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetOrCreatePlaylist: vi.fn(),
  LoadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../store/useAppStore", () => {
  const state = {
    steamGames: {},
    defaultPlaylistPrivacy: "unlisted",
  };
  const hook = Object.assign(vi.fn(() => state), {
    getState: vi.fn(() => state),
  });
  return { useAppStore: hook };
});

const mockVideo: VideoFile = {
  name: "test_clip.mp4",
  path: "/videos/test_clip.mp4",
  size: 1024 * 1024 * 50,
  modTime: Date.now(),
  folder: "/videos",
  game: "Elden Ring",
};

describe("UploadDialog Quota Check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders quota info when status has enough units", () => {
    vi.spyOn(quotaHook, "useQuotaStatus").mockReturnValue({
      status: {
        used: 1600,
        limit: 10000,
        remaining: 8400,
        resetsAt: Math.floor(Date.now() / 1000) + 3600 * 5,
      },
      msUntilReset: 3600 * 5 * 1000,
      refresh: vi.fn(),
    });

    render(
      <UploadDialog
        video={mockVideo}
        onClose={vi.fn()}
        onUploadNow={vi.fn()}
        onAddToQueue={vi.fn()}
      />
    );

    // Should indicate remaining uploads
    expect(screen.getByText(/This upload costs about/i)).toBeInTheDocument();
    expect(screen.getByText(/1,?600 units/i)).toBeInTheDocument();
    expect(screen.getByText(/8,?400 left/i)).toBeInTheDocument();
    expect(screen.getByText(/5 uploads/i)).toBeInTheDocument();
    // Default button text
    expect(screen.getByRole("button", { name: /upload now/i })).toBeInTheDocument();
    expect(screen.queryByText(/not enough quota/i)).not.toBeInTheDocument();
  });

  it("renders warning and 'Upload anyway' button when quota is insufficient", () => {
    vi.spyOn(quotaHook, "useQuotaStatus").mockReturnValue({
      status: {
        used: 9000,
        limit: 10000,
        remaining: 1000, // costs 1600, so not enough
        resetsAt: Math.floor(Date.now() / 1000) + 3600 * 2,
      },
      msUntilReset: 3600 * 2 * 1000,
      refresh: vi.fn(),
    });

    render(
      <UploadDialog
        video={mockVideo}
        onClose={vi.fn()}
        onUploadNow={vi.fn()}
        onAddToQueue={vi.fn()}
      />
    );

    expect(screen.getByText(/not enough quota/i)).toBeInTheDocument();
    expect(screen.getByText(/needs 1,?600, you have 1,?000/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload anyway/i })).toBeInTheDocument();
  });
});
