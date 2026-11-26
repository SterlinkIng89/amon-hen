import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePlaylistNormalizer,
  type BatchSyncProgress,
  type NormalizerRow,
  type UsePlaylistNormalizerReturn,
} from "../../../../hooks/usePlaylistNormalizer";
import type { GameProfile, YTVideo } from "../../../../types";
import { PlaylistNormalizerTable } from "../PlaylistNormalizerTable";

vi.mock("../../../../hooks/usePlaylistNormalizer", () => ({
  usePlaylistNormalizer: vi.fn(),
}));

vi.mock("../../../../hooks/useRecentFieldValues", () => ({
  useRecentFieldValues: () => ({
    getRecentValues: () => [],
    addRecentValue: vi.fn(),
    removeRecentValue: vi.fn(),
  }),
}));

const gameProfiles: Record<string, GameProfile> = {
  "Helldivers 2": {
    type: "multiplayer",
    titleTemplate: "{squad} - {event} - {gamemode} - {date}",
    modes: ["Automaton", "Terminid"],
  },
  "Elden Ring": {
    type: "singleplayer",
    titleTemplate: "{game} - {date} - {episode}",
  },
};

function makeVideo(id: string, title: string): YTVideo {
  return {
    id,
    title,
    description: "",
    publishedAt: "2025-05-10T12:00:00Z",
    thumbnailUrl: `https://example.com/${id}.jpg`,
    viewCount: 0,
    likeCount: 0,
    duration: "10:00",
    privacy: "public",
  };
}

const sampleRows: NormalizerRow[] = [
  {
    video: makeVideo("v1", "Raw clip 1"),
    fields: {
      event: "Malevelon Creek",
      gameMode: "Automaton",
      date: "10/05/25",
      dateSource: "manual",
      episode: "",
      customVars: { squad: "Alpha" },
    },
    proposedTitle: "Alpha - Malevelon Creek - Automaton - 10/05/25",
    missingFields: [],
    status: "ready",
    isDirty: true,
    isSyncing: false,
  },
  {
    video: makeVideo("v2", "Unparsed clip"),
    fields: {
      event: "",
      gameMode: "",
      date: "11/05/25",
      dateSource: "published",
      episode: "",
      customVars: {},
    },
    proposedTitle: "11/05/25",
    missingFields: ["squad", "event", "gamemode"],
    status: "needs_review",
    isDirty: false,
    isSyncing: false,
  },
  {
    video: makeVideo("v3", "Bravo - Super Earth - Terminid - 12/05/25"),
    fields: {
      event: "Super Earth",
      gameMode: "Terminid",
      date: "12/05/25",
      dateSource: "title",
      episode: "",
      customVars: { squad: "Bravo" },
    },
    proposedTitle: "Bravo - Super Earth - Terminid - 12/05/25",
    missingFields: [],
    status: "already_normalized",
    isDirty: false,
    isSyncing: false,
  },
  {
    video: makeVideo("v4", "Charlie - Creek Defense - Automaton - 13/05/25"),
    fields: {
      event: "Creek Defense",
      gameMode: "Automaton",
      date: "13/05/25",
      dateSource: "manual",
      episode: "",
      customVars: { squad: "Charlie" },
    },
    proposedTitle: "Charlie - Creek Defense - Automaton - 13/05/25",
    missingFields: [],
    status: "synced",
    isDirty: false,
    isSyncing: false,
  },
];

const idleProgress: BatchSyncProgress = {
  running: false,
  current: 0,
  total: 0,
  successCount: 0,
  failCount: 0,
};

function makeHookReturn(
  overrides: Partial<UsePlaylistNormalizerReturn> = {},
): UsePlaylistNormalizerReturn {
  return {
    rows: sampleRows,
    isLoading: false,
    error: "",
    selectedGameTag: "Helldivers 2",
    setSelectedGameTag: vi.fn(),
    updateRowField: vi.fn(),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    saveAllDirtyDrafts: vi.fn().mockResolvedValue(1),
    syncSingleVideo: vi.fn().mockResolvedValue(true),
    syncBatch: vi.fn().mockResolvedValue(undefined),
    cancelBatchSync: vi.fn(),
    batchProgress: idleProgress,
    estimateQuotaCost: (count: number) => Math.max(0, count) * 50,
    reload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("PlaylistNormalizerTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePlaylistNormalizer).mockReturnValue(makeHookReturn());
  });

  it("renders loading skeleton when isLoading is true", () => {
    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({ isLoading: true, rows: [] }),
    );

    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Loading playlist normalizer")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("renders error banner and retries on click", () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({ error: "Network failure", rows: [], reload }),
    );

    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Network failure");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("renders rows with inline editable fields and live proposed title preview", () => {
    const updateRowField = vi.fn();
    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({ updateRowField }),
    );

    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    expect(screen.getByText("Raw clip 1")).toBeInTheDocument();
    expect(
      screen.getByText("Alpha - Malevelon Creek - Automaton - 10/05/25"),
    ).toBeInTheDocument();

    const squadInputs = screen.getAllByPlaceholderText("squad");
    fireEvent.change(squadInputs[0], { target: { value: "Delta" } });
    expect(updateRowField).toHaveBeenCalledWith("v1", {
      customVar: { key: "squad", value: "Delta" },
    });

    const eventInputs = screen.getAllByPlaceholderText("Event");
    fireEvent.change(eventInputs[0], { target: { value: "New Operation" } });
    expect(updateRowField).toHaveBeenCalledWith("v1", {
      event: "New Operation",
    });
  });

  it("filters rows via status pills and displays accurate counts", () => {
    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId(/normalizer-row-/)).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: /Needs review/i }));
    expect(screen.getAllByTestId(/normalizer-row-/)).toHaveLength(1);
    expect(screen.getByText("Unparsed clip")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Ready/i }));
    expect(screen.getAllByTestId(/normalizer-row-/)).toHaveLength(1);
    expect(screen.getByText("Raw clip 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Already normalized/i }));
    expect(screen.getAllByTestId(/normalizer-row-/)).toHaveLength(1);
    expect(
      screen.getAllByText("Bravo - Super Earth - Terminid - 12/05/25").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^Synced/i }));
    expect(screen.getAllByTestId(/normalizer-row-/)).toHaveLength(1);
    expect(
      screen.getAllByText("Charlie - Creek Defense - Automaton - 13/05/25")
        .length,
    ).toBeGreaterThan(0);
  });

  it("displays quota indicator as count * 50 units for syncable videos", () => {
    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    expect(screen.getByTestId("quota-indicator")).toHaveTextContent(
      "1 video · 50 quota units",
    );
  });

  it("calls onWatchVideo with video and selectedGameTag when Watch is clicked", () => {
    const onWatchVideo = vi.fn();

    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={onWatchVideo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Watch Raw clip 1" }));
    expect(onWatchVideo).toHaveBeenCalledWith(sampleRows[0].video, "Helldivers 2");
  });

  it("invokes saveAllDirtyDrafts, saveDraft, and syncSingleVideo with proper disabled states", async () => {
    const saveAllDirtyDrafts = vi.fn().mockResolvedValue(1);
    const saveDraft = vi.fn().mockResolvedValue(undefined);
    const syncSingleVideo = vi.fn().mockResolvedValue(true);

    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({ saveAllDirtyDrafts, saveDraft, syncSingleVideo }),
    );

    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    const saveAllBtn = screen.getByRole("button", { name: /Save All Drafts/i });
    expect(saveAllBtn).toHaveTextContent("1");
    await act(async () => {
      fireEvent.click(saveAllBtn);
    });
    await waitFor(() => {
      expect(saveAllDirtyDrafts).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Save draft for Raw clip 1" }));
    expect(saveDraft).toHaveBeenCalledWith("v1");

    expect(
      screen.getByRole("button", { name: "Save draft for Unparsed clip" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Sync Raw clip 1" }));
    expect(syncSingleVideo).toHaveBeenCalledWith("v1");

    expect(
      screen.getByRole("button", {
        name: "Sync Bravo - Super Earth - Terminid - 12/05/25",
      }),
    ).toBeDisabled();
  });

  it("invokes syncBatch for visible ready rows and supports Cancel while running", () => {
    const syncBatch = vi.fn().mockResolvedValue(undefined);
    const cancelBatchSync = vi.fn();

    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({ syncBatch, cancelBatchSync }),
    );

    const { rerender } = render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sync Ready/i }));
    expect(syncBatch).toHaveBeenCalledWith(["v1"]);

    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({
        syncBatch,
        cancelBatchSync,
        batchProgress: {
          running: true,
          current: 1,
          total: 2,
          successCount: 1,
          failCount: 0,
        },
      }),
    );

    rerender(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    expect(screen.getByText(/Syncing titles \(1\/2\)/i)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelBatchSync).toHaveBeenCalledTimes(1);
  });

  it("displays inline syncError on a row when present", () => {
    const rowsWithError: NormalizerRow[] = [
      { ...sampleRows[0], syncError: "Quota exceeded" },
    ];
    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({ rows: rowsWithError }),
    );

    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Quota exceeded");
  });

  it("changes selected profile via profile selector", () => {
    const setSelectedGameTag = vi.fn();
    vi.mocked(usePlaylistNormalizer).mockReturnValue(
      makeHookReturn({ setSelectedGameTag }),
    );

    render(
      <PlaylistNormalizerTable
        playlistId="pl-1"
        defaultGameTag="Helldivers 2"
        gameProfiles={gameProfiles}
        onWatchVideo={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Profile"), {
      target: { value: "Elden Ring" },
    });
    expect(setSelectedGameTag).toHaveBeenCalledWith("Elden Ring");
  });
});
