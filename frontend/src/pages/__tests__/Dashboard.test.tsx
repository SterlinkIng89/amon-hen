import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "../Dashboard";
import { useAppStore } from "../../store/useAppStore";

// Mock Wails backend App APIs
vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetStreamPort: vi.fn().mockResolvedValue(0),
  IsYouTubeAuthed: vi.fn().mockResolvedValue(false),
  SaveVideoMetadata: vi.fn().mockResolvedValue(undefined),
  SyncRecentVideos: vi.fn().mockResolvedValue(undefined),
  UploadToYouTube: vi.fn().mockResolvedValue(undefined),
  LoadConfig: vi.fn().mockResolvedValue({ folders: ["/test"], game_profiles: {} }),
  GetVideosFromFolders: vi.fn().mockResolvedValue([]),
  AddFolder: vi.fn().mockResolvedValue(""),
  RemoveFolder: vi.fn().mockResolvedValue(undefined),
  SaveFolders: vi.fn().mockResolvedValue(undefined),
}));

// Mock runtime
vi.mock("../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn(() => vi.fn()),
  EventsOff: vi.fn(),
}));

// Mock useVideoLibrary hook
vi.mock("../../hooks/useVideoLibrary", () => ({
  useVideoLibrary: () => ({
    videos: [
      { path: "/test/v1.mp4", name: "v1.mp4", size: 1024, modTime: 1000, folder: "/test" },
      { path: "/test/v2.mp4", name: "v2.mp4", size: 2048, modTime: 2000, folder: "/test" },
    ],
    folders: ["/test"],
    activeFolders: [],
    scanning: false,
    error: "",
    isDraggingOver: false,
    handleAddFolder: vi.fn(),
    handleRemoveFolder: vi.fn(),
    handleRescan: vi.fn(),
    toggleFolder: vi.fn(),
  }),
}));

// Mock components
vi.mock("../../components/layout/AppHeader", () => ({
  default: ({ onSetView }: { onSetView: (v: string) => void }) => (
    <header data-testid="app-header">
      <button onClick={() => onSetView("grid")}>Nav Grid</button>
      <button onClick={() => onSetView("channel")}>Nav Channel</button>
      <button onClick={() => onSetView("stats")}>Nav Stats</button>
      <button onClick={() => onSetView("steam")}>Nav Steam</button>
    </header>
  ),
}));

vi.mock("../../components/video/VideoGrid", () => ({
  default: ({ onOpenVideo }: { onOpenVideo: (idx: number, e: React.MouseEvent) => void }) => (
    <div data-testid="video-grid">
      <button
        data-testid="select-video-0"
        onClick={(e) => onOpenVideo(0, e)}
      >
        Select Video 0
      </button>
    </div>
  ),
}));

vi.mock("../../components/video/BulkActionBar", () => ({
  default: ({ selectedPaths }: { selectedPaths: string[] }) => (
    <div data-testid="bulk-action-bar">
      Bulk Action Bar ({selectedPaths.length})
    </div>
  ),
}));

vi.mock("../ChannelPage", () => ({
  default: () => <div data-testid="channel-page">Channel Page</div>,
}));

vi.mock("../StatsPage", () => ({
  default: () => <div data-testid="stats-page">Stats Page</div>,
}));

vi.mock("../SteamStats", () => ({
  default: () => <div data-testid="steam-page">Steam Page</div>,
}));

describe("Dashboard Bulk Selection Navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ view: "grid" });
  });

  it("should hide bulk action bar and clear selection when navigating away to any other tab", async () => {
    render(<Dashboard />);

    // Initially in grid view, bulk action bar should not be visible
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();

    // Select video 0 using ctrl+click
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-0"), { ctrlKey: true });
    });

    // Now bulk action bar should be visible in grid view
    expect(screen.getByTestId("bulk-action-bar")).toBeInTheDocument();
    expect(screen.getByText("Bulk Action Bar (1)")).toBeInTheDocument();

    // Navigate to Channel page
    act(() => {
      fireEvent.click(screen.getByText("Nav Channel"));
    });
    expect(screen.getByTestId("channel-page")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();

    // Navigate back to Grid page
    act(() => {
      fireEvent.click(screen.getByText("Nav Grid"));
    });
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();

    // Select again and navigate to Stats
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-0"), { ctrlKey: true });
    });
    expect(screen.getByTestId("bulk-action-bar")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText("Nav Stats"));
    });
    expect(screen.getByTestId("stats-page")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();

    // Select again and navigate to Steam
    act(() => {
      fireEvent.click(screen.getByText("Nav Grid"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-0"), { ctrlKey: true });
    });
    expect(screen.getByTestId("bulk-action-bar")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText("Nav Steam"));
    });
    expect(screen.getByTestId("steam-page")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();
  });
});

