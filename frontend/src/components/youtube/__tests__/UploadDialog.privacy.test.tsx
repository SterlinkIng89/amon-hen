import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UploadDialog from "../UploadDialog";
import { VideoFile } from "../../../types";
import { useAppStore } from "../../../store/useAppStore";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetOrCreatePlaylist: vi.fn().mockResolvedValue("new-playlist-id"),
  LoadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../hooks/useQuotaStatus", () => ({
  useQuotaStatus: () => ({
    status: { used: 0, limit: 10000, remaining: 10000, resetsAt: 0 },
    msUntilReset: 0,
    refresh: vi.fn(),
  }),
}));

const mockVideoWithoutPrivacy: VideoFile = {
  name: "test_clip.mp4",
  path: "/videos/test_clip.mp4",
  size: 1024 * 1024 * 50,
  modTime: Date.now(),
  folder: "/videos",
  game: "Elden Ring",
};

describe("UploadDialog Privacy Isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      defaultPlaylistPrivacy: "unlisted",
      defaultVideoPrivacy: "unlisted",
    });
    vi.clearAllMocks();
  });

  it("initializes missing video privacy from defaultVideoPrivacy", () => {
    useAppStore.setState({ defaultVideoPrivacy: "private" });

    render(
      <UploadDialog
        video={mockVideoWithoutPrivacy}
        onClose={vi.fn()}
        onUploadNow={vi.fn()}
        onAddToQueue={vi.fn()}
      />
    );

    const privateBtn = screen.getByRole("button", { name: /private/i });
    expect(privateBtn).toHaveClass("bg-accent");
  });

  it("changing video privacy in UploadDialog does not mutate global defaultPlaylistPrivacy or defaultVideoPrivacy", () => {
    render(
      <UploadDialog
        video={mockVideoWithoutPrivacy}
        onClose={vi.fn()}
        onUploadNow={vi.fn()}
        onAddToQueue={vi.fn()}
      />
    );

    const publicBtn = screen.getByRole("button", { name: /public/i });
    fireEvent.click(publicBtn);

    expect(useAppStore.getState().defaultPlaylistPrivacy).toBe("unlisted");
    expect(useAppStore.getState().defaultVideoPrivacy).toBe("unlisted");
  });

  it("creating a playlist in UploadDialog does not mutate global defaultPlaylistPrivacy or defaultVideoPrivacy", async () => {
    render(
      <UploadDialog
        video={mockVideoWithoutPrivacy}
        onClose={vi.fn()}
        onUploadNow={vi.fn()}
        onAddToQueue={vi.fn()}
      />
    );

    const privateBtn = screen.getByRole("button", { name: /private/i });
    fireEvent.click(privateBtn);

    const toggleBtn = screen.getByRole("button", { name: /\+ get or create/i });
    fireEvent.click(toggleBtn);

    const titleInput = screen.getByPlaceholderText(/playlist name\.\.\./i);
    fireEvent.change(titleInput, { target: { value: "New Elden Ring VODs" } });

    const createBtn = screen.getByRole("button", { name: /^get or create$/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(useAppStore.getState().defaultPlaylistPrivacy).toBe("unlisted");
      expect(useAppStore.getState().defaultVideoPrivacy).toBe("unlisted");
    });
  });
});
