import { render, screen } from "@testing-library/react";
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
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn().mockReturnValue(vi.fn()),
  EventsOff: vi.fn(),
}));

describe("SettingsPanel", () => {
  it("renders the Tag Playlists section", async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    
    expect(await screen.findByText("Tag Playlists")).toBeInTheDocument();
    expect(await screen.findByText("-- Choose a tag to configure --")).toBeInTheDocument();
  });
});
