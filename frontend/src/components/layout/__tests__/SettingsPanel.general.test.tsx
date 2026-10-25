import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsPanel from "../SettingsPanel";
import { useAppStore } from "../../../store/useAppStore";
import * as appBackend from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  IsYouTubeAuthed: vi.fn().mockResolvedValue(false),
  GetYouTubeChannelInfo: vi.fn().mockResolvedValue(null),
  LoadConfig: vi.fn().mockResolvedValue({
    folders: ["/test"],
    game_profiles: {},
    tag_playlists: {},
    title_separator: " - ",
  }),
  GetAutoLaunch: vi.fn().mockResolvedValue(false),
  SetAutoLaunch: vi.fn().mockResolvedValue(null),
  GetWatchFolderEnabled: vi.fn().mockResolvedValue(false),
  SetWatchFolderEnabled: vi.fn().mockResolvedValue(null),
  GetAllGameTags: vi.fn().mockResolvedValue([]),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetDefaultExportFolder: vi.fn().mockResolvedValue("/export/folder"),
  SetDefaultExportFolder: vi.fn().mockResolvedValue(null),
  SelectExportFolder: vi.fn().mockResolvedValue("/new/export/folder"),
  OpenFolderInExplorer: vi.fn().mockResolvedValue(null),
  SaveGameProfile: vi.fn().mockResolvedValue(null),
  DeleteGameProfile: vi.fn().mockResolvedValue(null),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({ heroUrl: "", headerUrl: "", posterUrl: "" }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn().mockReturnValue(() => {}),
  EventsOff: vi.fn(),
  BrowserOpenURL: vi.fn(),
}));

describe("SettingsPanel - General Tab (#155)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAppStore.setState({
      defaultVideoPrivacy: "unlisted",
      defaultPlaylistPrivacy: "unlisted",
    });
  });

  it("renders 3 tabs (General, Accounts, Games & Titles) and switches views", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const generalTab = await screen.findByRole("tab", { name: /general/i });
    const accountsTab = screen.getByRole("tab", { name: /accounts/i });
    const gamesTab = screen.getByRole("tab", { name: /games/i });

    expect(generalTab).toBeInTheDocument();
    expect(accountsTab).toBeInTheDocument();
    expect(gamesTab).toBeInTheDocument();

    // In General tab, Default Privacy should be visible
    expect(screen.getByText("Default Video Privacy")).toBeInTheDocument();

    // Switch to Accounts tab
    fireEvent.click(accountsTab);
    expect(screen.queryByText("Default Video Privacy")).not.toBeInTheDocument();

    // Switch to Games & Titles tab
    fireEvent.click(gamesTab);
    expect(screen.queryByText("Default Video Privacy")).not.toBeInTheDocument();
  });

  it("updates default video and playlist privacy via segmented controls", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    await screen.findByText("Default Video Privacy");

    // Click Private under Default Video Privacy
    const videoPrivateBtn = screen.getByTestId("video-privacy-private");
    fireEvent.click(videoPrivateBtn);
    expect(useAppStore.getState().defaultVideoPrivacy).toBe("private");

    // Click Public under Default Playlist Privacy
    const playlistPublicBtn = screen.getByTestId("playlist-privacy-public");
    fireEvent.click(playlistPublicBtn);
    expect(useAppStore.getState().defaultPlaylistPrivacy).toBe("public");
  });

  it("renders export folder and calls OpenFolderInExplorer on Open Folder click", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const openFolderBtn = await screen.findByRole("button", { name: /open folder/i });
    fireEvent.click(openFolderBtn);

    expect(appBackend.OpenFolderInExplorer).toHaveBeenCalledWith("/export/folder");
  });

  it("does not render the legacy Tag Playlists section", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    await screen.findByRole("tab", { name: /general/i });
    expect(screen.queryByText("Tag Playlists")).not.toBeInTheDocument();
  });
});
