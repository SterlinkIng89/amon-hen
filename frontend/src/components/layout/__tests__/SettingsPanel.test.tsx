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
  it("renders the Tag Playlists section with searchable tag input and dropdown list", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    
    expect(await screen.findByText("Tag Playlists")).toBeInTheDocument();
    const tagInput = screen.getByPlaceholderText("Search or select game tag...");
    expect(tagInput).toBeInTheDocument();

    fireEvent.focus(tagInput);

    expect(await screen.findByText("GameA")).toBeInTheDocument();
    expect(await screen.findByText("GameB")).toBeInTheDocument();

    fireEvent.click(screen.getByText("GameA"));
    expect(tagInput).toHaveValue("GameA");
    expect(await screen.findByText("Associated YouTube Playlist")).toBeInTheDocument();
  });

  it("orders game tags in the combobox list from most recently used to oldest", async () => {
    localStorage.setItem("amon_hen_recent_tags", JSON.stringify(["GameRecent", "GameOld"]));
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const tagInput = await screen.findByPlaceholderText("Search or select game tag...");
    fireEvent.focus(tagInput);

    const gameRecent = await screen.findByText("GameRecent");
    const gameOld = await screen.findByText("GameOld");
    expect(gameRecent).toBeInTheDocument();
    expect(gameOld).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    const recentIndex = buttons.findIndex((b) => b.textContent?.includes("GameRecent"));
    const oldIndex = buttons.findIndex((b) => b.textContent?.includes("GameOld"));
    expect(recentIndex).toBeLessThan(oldIndex);
  });

  it("renders the Default Export Destination section", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    expect(await screen.findByText("Default Export Destination")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("e.g. C:\\Users\\...\\Videos\\AmonHen") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("/default/videos/amonhen");
  });
});
