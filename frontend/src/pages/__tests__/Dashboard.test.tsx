import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "../Dashboard";
import { useAppStore } from "../../store/useAppStore";
import { GetStreamPort } from "../../../wailsjs/go/backend/App";

// Mock Wails backend App APIs
vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetStreamPort: vi.fn().mockResolvedValue(0),
  IsYouTubeAuthed: vi.fn().mockResolvedValue(false),
  SaveVideoMetadata: vi.fn().mockResolvedValue(undefined),
  SyncRecentVideos: vi.fn().mockResolvedValue(undefined),
  UploadToYouTube: vi.fn().mockResolvedValue(undefined),
  LoadConfig: vi
    .fn()
    .mockResolvedValue({ folders: ["/test"], game_profiles: {} }),
  GetVideosFromFolders: vi.fn().mockResolvedValue([]),
  AddFolder: vi.fn().mockResolvedValue(""),
  RemoveFolder: vi.fn().mockResolvedValue(undefined),
  SaveFolders: vi.fn().mockResolvedValue(undefined),
  GetUploadSessions: vi.fn().mockResolvedValue([]),
  GetQuotaStatus: vi.fn().mockResolvedValue(null),
  GetAPILogs: vi.fn().mockResolvedValue([]),
}));

// Mock runtime
const eventListeners: Record<string, Function[]> = {};

vi.mock("../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn((event: string, callback: Function) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
    return () => {
      eventListeners[event] = eventListeners[event].filter(
        (cb) => cb !== callback,
      );
    };
  }),
  EventsOff: vi.fn(),
}));

// Mock useVideoLibrary hook
vi.mock("../../hooks/useVideoLibrary", () => ({
  useVideoLibrary: () => ({
    videos: [
      {
        path: "/test/v1.mp4",
        name: "v1.mp4",
        size: 1024,
        modTime: 1000,
        folder: "/test",
      },
      {
        path: "/test/v2.mp4",
        name: "v2.mp4",
        size: 2048,
        modTime: 2000,
        folder: "/test",
      },
      {
        path: "/test/v3.mp4",
        name: "v3.mp4",
        size: 3072,
        modTime: 3000,
        folder: "/test",
      },
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
  default: ({
    onOpenVideo,
    onSelectToggle,
    selectedPaths,
  }: {
    onOpenVideo: (idx: number, e: React.MouseEvent) => void;
    onSelectToggle?: (idx: number) => void;
    selectedPaths?: string[];
  }) => (
    <div data-testid="video-grid">
      <div data-testid="selected-count">{selectedPaths?.length ?? 0}</div>
      <button data-testid="select-video-0" onClick={(e) => onOpenVideo(0, e)}>
        Select Video 0
      </button>
      <button data-testid="select-video-1" onClick={(e) => onOpenVideo(1, e)}>
        Select Video 1
      </button>
      <button data-testid="select-video-2" onClick={(e) => onOpenVideo(2, e)}>
        Select Video 2
      </button>
      <button data-testid="toggle-video-0" onClick={() => onSelectToggle?.(0)}>
        Toggle Video 0
      </button>
      <button data-testid="toggle-video-1" onClick={() => onSelectToggle?.(1)}>
        Toggle Video 1
      </button>
      <button data-testid="toggle-video-2" onClick={() => onSelectToggle?.(2)}>
        Toggle Video 2
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

vi.mock("../../components/video/PlayerView", () => ({
  default: () => <div data-testid="player-view">Player View</div>,
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

describe("Dashboard Stream Port & Player View State", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(GetStreamPort).mockReset();
  });

  it("should show stream loading or error state when view is player and streamPort is 0 instead of pitch black empty screen", async () => {
    vi.mocked(GetStreamPort).mockResolvedValue(0);
    useAppStore.setState({ view: "player", selectedIndex: 0 });

    await act(async () => {
      render(<Dashboard />);
    });

    const streamStatus = screen.queryByTestId("stream-status");
    expect(streamStatus).toBeInTheDocument();
    expect(screen.queryByTestId("player-view")).not.toBeInTheDocument();
  });

  it("should render PlayerView when streamPort resolves to a valid port", async () => {
    vi.mocked(GetStreamPort).mockResolvedValue(54321);
    useAppStore.setState({ view: "player", selectedIndex: 0 });

    await act(async () => {
      render(<Dashboard />);
    });

    expect(await screen.findByTestId("player-view")).toBeInTheDocument();
    expect(screen.queryByTestId("stream-status")).not.toBeInTheDocument();
  });

  it("should display error message and allow returning to library or retrying when stream error occurs", async () => {
    vi.mocked(GetStreamPort).mockResolvedValue(0);
    useAppStore.setState({ view: "player", selectedIndex: 0 });

    await act(async () => {
      render(<Dashboard />);
    });

    // Simulate stream:error event from backend
    await act(async () => {
      const callbacks = eventListeners["stream:error"] || [];
      callbacks.forEach((cb) => cb("Failed to bind stream server port"));
    });

    expect(screen.getByText("Unable to connect to stream server")).toBeInTheDocument();
    expect(screen.getByText("Failed to bind stream server port")).toBeInTheDocument();

    // Click "Back to library"
    const backBtn = screen.getByText("Back to library");
    await act(async () => {
      fireEvent.click(backBtn);
    });

    expect(useAppStore.getState().view).toBe("grid");
  });
});

describe("Dashboard Multi-Selection (#125)", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ view: "grid", selectedIndex: -1 });
  });

  it("ctrl-click toggles and shift-click selects contiguous range from the path anchor", async () => {
    render(<Dashboard />);

    // Ctrl+Click video 0 -> selected
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-0"), { ctrlKey: true });
    });
    expect(screen.getByText("Bulk Action Bar (1)")).toBeInTheDocument();

    // Shift+Click video 2 -> range 0, 1, 2 selected (total 3)
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-2"), { shiftKey: true });
    });
    expect(screen.getByText("Bulk Action Bar (3)")).toBeInTheDocument();
  });

  it("plain click in selection mode toggles item, keeps selection, and does not navigate to player", async () => {
    render(<Dashboard />);

    // Ctrl+Click video 0 -> selection mode active (1 item)
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-0"), { ctrlKey: true });
    });
    expect(screen.getByText("Bulk Action Bar (1)")).toBeInTheDocument();

    // Normal click on video 1 -> should add video 1 to selection (now 2), NOT open player
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-1"));
    });
    expect(useAppStore.getState().view).toBe("grid");
    expect(screen.getByText("Bulk Action Bar (2)")).toBeInTheDocument();

    // Normal click on video 1 again -> should deselect video 1 (now 1)
    act(() => {
      fireEvent.click(screen.getByTestId("select-video-1"));
    });
    expect(screen.getByText("Bulk Action Bar (1)")).toBeInTheDocument();
    expect(useAppStore.getState().view).toBe("grid");
  });

  it("plain click with no active selection opens the player", async () => {
    render(<Dashboard />);

    act(() => {
      fireEvent.click(screen.getByTestId("select-video-0"));
    });
    expect(useAppStore.getState().view).toBe("player");
    expect(useAppStore.getState().selectedIndex).toBe(0);
  });

  it("modifier clicks prevent default to avoid DOM text selection", async () => {
    render(<Dashboard />);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });
    const preventDefaultSpy = vi.spyOn(clickEvent, "preventDefault");

    act(() => {
      screen.getByTestId("select-video-0").dispatchEvent(clickEvent);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("onSelectToggle toggles selection for a video", async () => {
    render(<Dashboard />);

    act(() => {
      fireEvent.click(screen.getByTestId("toggle-video-0"));
    });

    expect(screen.getByText("Bulk Action Bar (1)")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId("toggle-video-0"));
    });

    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();
  });
});


