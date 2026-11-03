import { render, screen, fireEvent } from "@testing-library/react";
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

const mockVideoWithoutDescription: VideoFile = {
  name: "test_clip.mp4",
  path: "/videos/test_clip.mp4",
  size: 1024 * 1024 * 50,
  modTime: Date.now(),
  folder: "/videos",
  game: "Elden Ring",
};

describe("UploadDialog Description Prefill (#209)", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      defaultVideoDescription: "",
      defaultPlaylistPrivacy: "unlisted",
      defaultVideoPrivacy: "unlisted",
    });
    vi.clearAllMocks();
  });

  it("prefills description from defaultVideoDescription when video description is empty", () => {
    useAppStore.setState({
      defaultVideoDescription: "Gameplay ultrawide 3440x1440p\nPC Specs: RTX 4090",
    });

    render(
      <UploadDialog
        video={mockVideoWithoutDescription}
        onClose={vi.fn()}
        onUploadNow={vi.fn()}
        onAddToQueue={vi.fn()}
      />
    );

    const descInput = screen.getByPlaceholderText("Optional description...") as HTMLTextAreaElement;
    expect(descInput.value).toBe("Gameplay ultrawide 3440x1440p\nPC Specs: RTX 4090");
  });

  it("preserves existing video description without overwriting with defaultVideoDescription", () => {
    useAppStore.setState({
      defaultVideoDescription: "Gameplay ultrawide 3440x1440p\nPC Specs: RTX 4090",
    });

    const videoWithCustomDesc: VideoFile = {
      ...mockVideoWithoutDescription,
      description: "My custom manual description for this specific episode",
    };

    render(
      <UploadDialog
        video={videoWithCustomDesc}
        onClose={vi.fn()}
        onUploadNow={vi.fn()}
        onAddToQueue={vi.fn()}
      />
    );

    const descInput = screen.getByPlaceholderText("Optional description...") as HTMLTextAreaElement;
    expect(descInput.value).toBe("My custom manual description for this specific episode");
  });

  it("submits prefilled default description when uploading", () => {
    useAppStore.setState({
      defaultVideoDescription: "Gameplay ultrawide 3440x1440p",
    });

    const onUploadNow = vi.fn();

    render(
      <UploadDialog
        video={mockVideoWithoutDescription}
        onClose={vi.fn()}
        onUploadNow={onUploadNow}
        onAddToQueue={vi.fn()}
      />
    );

    const uploadNowBtn = screen.getByRole("button", { name: /upload now/i });
    fireEvent.click(uploadNowBtn);

    expect(onUploadNow).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Gameplay ultrawide 3440x1440p",
      })
    );
  });
});
