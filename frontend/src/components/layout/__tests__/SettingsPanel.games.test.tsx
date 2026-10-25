import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    game_profiles: {
      "Apex Legends": {
        type: "multiplayer",
        titleTemplate: "{game} - {gamemode} - {date}",
        modes: ["Ranked", "Trios"],
      },
      "Elden Ring": {
        type: "singleplayer",
        titleTemplate: "",
        modes: [],
      },
    },
    tag_playlists: {},
    steam_id: "",
    steam_api_key: "",
    title_separator: " - ",
  }),
  GetAutoLaunch: vi.fn().mockResolvedValue(false),
  GetWatchFolderEnabled: vi.fn().mockResolvedValue(false),
  GetAllGameTags: vi.fn().mockResolvedValue(["Apex Legends", "Elden Ring"]),
  GetChannelPlaylists: vi.fn().mockResolvedValue([]),
  GetDefaultExportFolder: vi.fn().mockResolvedValue(""),
  SaveGameProfile: vi.fn().mockResolvedValue(undefined),
  DeleteGameProfile: vi.fn().mockResolvedValue(undefined),
  OpenFolderInExplorer: vi.fn().mockResolvedValue(undefined),
  GetSteamAppID: vi.fn().mockResolvedValue(""),
  GetSteamGameAssets: vi.fn().mockResolvedValue({ heroUrl: "", headerUrl: "", posterUrl: "" }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn().mockReturnValue(() => {}),
  EventsOff: vi.fn(),
  BrowserOpenURL: vi.fn(),
}));

describe("SettingsPanel - Games & Titles Tab (#157)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Tag Studio launcher and triggers onOpenTagManagement", async () => {
    const onOpenTagManagement = vi.fn();
    render(<SettingsPanel open={true} onClose={() => {}} onOpenTagManagement={onOpenTagManagement} />);

    const gamesTab = await screen.findByRole("tab", { name: /games & titles/i });
    fireEvent.click(gamesTab);

    const launcherBtn = await screen.findByRole("button", { name: /open full tag & playlist studio/i });
    expect(launcherBtn).toBeInTheDocument();

    fireEvent.click(launcherBtn);
    expect(onOpenTagManagement).toHaveBeenCalled();
  });

  it("appends variable chips to title template in multiplayer profile form", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const gamesTab = await screen.findByRole("tab", { name: /games & titles/i });
    fireEvent.click(gamesTab);

    // Click "+ Add Profile"
    const addBtn = await screen.findByRole("button", { name: /\+ add profile/i });
    fireEvent.click(addBtn);

    // Template input
    const templateInput = screen.getByPlaceholderText(/e\.g\. \{event\}/i) as HTMLInputElement;
    expect(templateInput).toBeInTheDocument();

    // Click chip {game}
    const gameChip = screen.getByRole("button", { name: "{game}" });
    fireEvent.click(gameChip);
    expect(templateInput.value).toContain("{game}");

    // Click chip {event}
    const eventChip = screen.getByRole("button", { name: "{event}" });
    fireEvent.click(eventChip);
    expect(templateInput.value).toContain("{event}");
  });

  it("displays live preview when template is modified", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const gamesTab = await screen.findByRole("tab", { name: /games & titles/i });
    fireEvent.click(gamesTab);

    const addBtn = await screen.findByRole("button", { name: /\+ add profile/i });
    fireEvent.click(addBtn);

    expect(screen.getByText(/live title preview/i)).toBeInTheDocument();
  });

  it("renders profile cards with type badges and supports inline delete without window.confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<SettingsPanel open={true} onClose={() => {}} />);

    const gamesTab = await screen.findByRole("tab", { name: /games & titles/i });
    fireEvent.click(gamesTab);

    // Check profiles loaded
    expect(await screen.findByText("Apex Legends")).toBeInTheDocument();
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();

    // Badges
    expect(screen.getByText("Multiplayer")).toBeInTheDocument();
    expect(screen.getByText("Singleplayer")).toBeInTheDocument();

    // Find delete button for Apex Legends
    const deleteBtn = screen.getByLabelText("Delete profile for Apex Legends");
    fireEvent.click(deleteBtn);

    // Inline confirmation buttons should appear
    const confirmBtn = screen.getByRole("button", { name: /^confirm$/i });
    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    expect(confirmBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    // Click cancel first
    fireEvent.click(cancelBtn);
    expect(screen.queryByRole("button", { name: /^confirm$/i })).not.toBeInTheDocument();
    expect(appBackend.DeleteGameProfile).not.toHaveBeenCalled();

    // Click delete again and confirm
    fireEvent.click(deleteBtn);
    const confirmBtn2 = screen.getByRole("button", { name: /^confirm$/i });
    fireEvent.click(confirmBtn2);

    await waitFor(() => {
      expect(appBackend.DeleteGameProfile).toHaveBeenCalledWith("Apex Legends");
    });
    // Ensure window.confirm was NOT called
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
