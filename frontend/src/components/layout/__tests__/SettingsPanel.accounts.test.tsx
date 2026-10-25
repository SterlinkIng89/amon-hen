import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsPanel from "../SettingsPanel";
import * as appBackend from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  IsYouTubeAuthed: vi.fn().mockResolvedValue(true),
  GetYouTubeChannelInfo: vi.fn().mockResolvedValue({
    id: "channel-123",
    title: "Test Channel",
    thumbnail: "https://example.com/thumb.png",
  }),
  LoadConfig: vi.fn().mockResolvedValue({
    folders: ["/test"],
    game_profiles: {},
    tag_playlists: {},
    steam_id: "7656119",
    steam_api_key: "STEAM_TEST_KEY",
  }),
  GetAutoLaunch: vi.fn().mockResolvedValue(false),
  GetWatchFolderEnabled: vi.fn().mockResolvedValue(false),
  GetAllGameTags: vi.fn().mockResolvedValue([]),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetDefaultExportFolder: vi.fn().mockResolvedValue(""),
  SyncChannelData: vi.fn().mockResolvedValue(undefined),
  InvalidateYouTubeClient: vi.fn().mockResolvedValue(undefined),
  SyncSteamData: vi.fn().mockResolvedValue(undefined),
  DisconnectSteam: vi.fn().mockResolvedValue(undefined),
  GetCacheDir: vi.fn().mockResolvedValue("/mock/cache/dir"),
  ImportYouTubeJSON: vi.fn().mockResolvedValue(undefined),
  OpenFolderInExplorer: vi.fn().mockResolvedValue(undefined),
  StartYouTubeAuth: vi.fn().mockResolvedValue(undefined),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({ heroUrl: "", headerUrl: "", posterUrl: "" }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn().mockReturnValue(() => {}),
  EventsOff: vi.fn(),
  BrowserOpenURL: vi.fn(),
}));

describe("SettingsPanel - Accounts Tab (#156)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collapses Steam key when connected, allows editing and toggling visibility", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    // Switch to Accounts tab
    const accountsTab = await screen.findByRole("tab", { name: /accounts/i });
    fireEvent.click(accountsTab);

    // Connected Steam card should be visible, but key input hidden
    expect(await screen.findByText("Steam Connected")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Steam Web API Key")).not.toBeInTheDocument();

    // Click Edit API Key
    const editBtn = screen.getByRole("button", { name: /edit api key/i });
    fireEvent.click(editBtn);

    // API Key input should appear with type="password"
    const keyInput = screen.getByPlaceholderText("Steam Web API Key") as HTMLInputElement;
    expect(keyInput).toBeInTheDocument();
    expect(keyInput.type).toBe("password");

    // Toggle visibility
    const toggleBtn = screen.getByLabelText("Toggle API key visibility");
    fireEvent.click(toggleBtn);
    expect(keyInput.type).toBe("text");
  });

  it("triggers Sync and Disconnect actions on YouTube card", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const accountsTab = await screen.findByRole("tab", { name: /accounts/i });
    fireEvent.click(accountsTab);

    // Wait for channel title
    expect(await screen.findByText("Test Channel")).toBeInTheDocument();

    // Click Sync
    const syncBtn = screen.getByRole("button", { name: /^sync$/i });
    fireEvent.click(syncBtn);
    expect(appBackend.SyncChannelData).toHaveBeenCalled();

    // Click Disconnect
    const disconnectBtn = screen.getByRole("button", { name: /^disconnect$/i });
    fireEvent.click(disconnectBtn);
    expect(appBackend.InvalidateYouTubeClient).toHaveBeenCalled();
  });

  it("triggers Steam sync and disconnect actions", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const accountsTab = await screen.findByRole("tab", { name: /accounts/i });
    fireEvent.click(accountsTab);

    expect(await screen.findByText("Steam Connected")).toBeInTheDocument();

    const steamSyncBtn = screen.getByRole("button", { name: /sync steam/i });
    fireEvent.click(steamSyncBtn);
    expect(appBackend.SyncSteamData).toHaveBeenCalled();

    const steamDisconnectBtn = screen.getByRole("button", { name: /disconnect steam/i });
    fireEvent.click(steamDisconnectBtn);
    expect(appBackend.DisconnectSteam).toHaveBeenCalled();
  });

  it("renders System & Diagnostics card and triggers its actions", async () => {
    const onOpenDevLogs = vi.fn();
    render(<SettingsPanel open={true} onClose={() => {}} onOpenDevLogs={onOpenDevLogs} />);

    const accountsTab = await screen.findByRole("tab", { name: /accounts/i });
    fireEvent.click(accountsTab);

    expect(await screen.findByText("System & Diagnostics")).toBeInTheDocument();

    // Open Cache Folder
    const openCacheBtn = screen.getByRole("button", { name: /open cache folder/i });
    fireEvent.click(openCacheBtn);
    await vi.waitFor(() => {
      expect(appBackend.GetCacheDir).toHaveBeenCalled();
      expect(appBackend.OpenFolderInExplorer).toHaveBeenCalledWith("/mock/cache/dir");
    });

    // Import YouTube JSON
    const importBtn = screen.getByRole("button", { name: /import youtube json/i });
    fireEvent.click(importBtn);
    expect(appBackend.ImportYouTubeJSON).toHaveBeenCalled();

    // API Quota & Logs
    const devLogsBtn = screen.getByRole("button", { name: /api quota & logs/i });
    fireEvent.click(devLogsBtn);
    expect(onOpenDevLogs).toHaveBeenCalled();
  });
});
