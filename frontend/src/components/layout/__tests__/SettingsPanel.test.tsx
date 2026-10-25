import { render, screen, fireEvent } from "@testing-library/react";
import SettingsPanel from "../SettingsPanel";
import { describe, it, expect, vi } from "vitest";

// Mock Wails backend functions
vi.mock("../../../../wailsjs/go/backend/App", () => ({
  IsYouTubeAuthed: vi.fn().mockResolvedValue(true),
  GetYouTubeChannelInfo: vi.fn().mockResolvedValue({ id: "123", title: "Test", thumbnail: "" }),
  LoadConfig: vi.fn().mockResolvedValue({ tag_playlists: { "GameA": "PL_TEST" } }),
  GetAutoLaunch: vi.fn().mockResolvedValue(false),
  GetWatchFolderEnabled: vi.fn().mockResolvedValue(false),
  GetAllGameTags: vi.fn().mockResolvedValue(["GameA", "GameB"]),
  GetChannelPlaylists: vi.fn().mockResolvedValue([{ id: "PL_1", title: "Playlist 1" }]),
  SetTagPlaylist: vi.fn().mockResolvedValue(null),
  GetDefaultExportFolder: vi.fn().mockResolvedValue("/default/videos/amonhen"),
  SetDefaultExportFolder: vi.fn().mockResolvedValue(null),
  SelectExportFolder: vi.fn().mockResolvedValue("/custom/videos/folder"),
  GetSteamAppID: vi.fn().mockResolvedValue("123"),
  GetSteamGameAssets: vi.fn().mockResolvedValue({ heroUrl: "", headerUrl: "", posterUrl: "" }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn().mockReturnValue(vi.fn()),
  EventsOff: vi.fn(),
}));

describe("SettingsPanel", () => {
  it("does not render the legacy Tag Playlists section", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    expect(await screen.findByRole("tab", { name: /general/i })).toBeInTheDocument();
    expect(screen.queryByText("Tag Playlists")).not.toBeInTheDocument();
  });

  it("renders the Default Export Destination section", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    expect(await screen.findByText("Default Export Destination")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("e.g. C:\\Users\\...\\Videos\\AmonHen") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("/default/videos/amonhen");
  });

  it("renders Grid Card Density options and allows toggling density", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    expect(await screen.findByText("Grid Card Density")).toBeInTheDocument();
    const compactBtn = screen.getByRole("button", { name: "Compact" });
    const defaultBtn = screen.getByRole("button", { name: "Default" });
    const largeBtn = screen.getByRole("button", { name: "Large" });

    expect(compactBtn).toBeInTheDocument();
    expect(defaultBtn).toBeInTheDocument();
    expect(largeBtn).toBeInTheDocument();

    fireEvent.click(compactBtn);
  });
});
