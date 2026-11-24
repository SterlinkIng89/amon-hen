import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ExportSyncModal from "../ExportSyncModal";
import { MatchedExportItem } from "../../../types";

const mockGetMatchedExports = vi.fn();
const mockApplyMatchedExports = vi.fn();
const mockDismissExportRecord = vi.fn();
const mockGetQuotaStatus = vi.fn();

const eventListeners = new Map<string, Array<(payload: unknown) => void>>();

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetMatchedExports: () => mockGetMatchedExports(),
  ApplyMatchedExports: (...args: unknown[]) => mockApplyMatchedExports(...args),
  DismissExportRecord: (...args: unknown[]) => mockDismissExportRecord(...args),
  GetQuotaStatus: () => mockGetQuotaStatus(),
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: (eventName: string, cb: (payload: unknown) => void) => {
    const existing = eventListeners.get(eventName) ?? [];
    eventListeners.set(eventName, [...existing, cb]);
    return () => {
      const current = eventListeners.get(eventName) ?? [];
      eventListeners.set(
        eventName,
        current.filter((fn) => fn !== cb),
      );
    };
  },
}));

function emitWailsEvent(eventName: string, payload: unknown) {
  const listeners = eventListeners.get(eventName) ?? [];
  for (const cb of listeners) {
    cb(payload);
  }
}

const mockItems: MatchedExportItem[] = [
  {
    exportId: "AH-7F3K9Q2M",
    sourcePath: "C:/Videos/lol-clip.mp4",
    exportedPath: "C:/Exports/AH-7F3K9Q2M - League of Legends.mp4",
    targetTitle: "League of Legends - 23/11/26 - Pentakill",
    description: "Clean pentakill",
    privacy: "public",
    gameTag: "League of Legends",
    playlistId: "PL-LOL",
    playlistTitle: "League Clips",
    episode: 1,
    contentType: "clip",
    tags: "lol,pentakill",
    status: "matched",
    youtubeId: "yt-vid-1",
    errorMsg: "",
    exportedAt: 1700000000,
    appliedAt: 0,
    youtubeTitle: "AH-7F3K9Q2M - League of Legends",
    youtubePrivacy: "private",
    thumbnailUrl: "",
    alreadyInPlaylist: false,
    estimatedQuota: 100,
  },
  {
    exportId: "AH-9B2M4K1P",
    sourcePath: "C:/Videos/ds-clip.mp4",
    exportedPath: "C:/Exports/AH-9B2M4K1P - Dark Souls.mp4",
    targetTitle: "Dark Souls - 23/11/26 - Boss Fight",
    description: "No hit",
    privacy: "unlisted",
    gameTag: "Dark Souls",
    playlistId: "PL-DS",
    playlistTitle: "Dark Souls",
    episode: 2,
    contentType: "clip",
    tags: "darksouls",
    status: "matched",
    youtubeId: "yt-vid-2",
    errorMsg: "",
    exportedAt: 1700000100,
    appliedAt: 0,
    youtubeTitle: "AH-9B2M4K1P - Dark Souls",
    youtubePrivacy: "private",
    thumbnailUrl: "",
    alreadyInPlaylist: true,
    estimatedQuota: 50,
  },
];

describe("ExportSyncModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventListeners.clear();
    mockGetMatchedExports.mockResolvedValue(mockItems);
    mockDismissExportRecord.mockResolvedValue(undefined);
    mockGetQuotaStatus.mockResolvedValue({
      used: 500,
      limit: 10000,
      remaining: 9500,
      resetsAt: Math.floor(Date.now() / 1000) + 3600,
    });
    mockApplyMatchedExports.mockResolvedValue({
      applied: ["AH-7F3K9Q2M", "AH-9B2M4K1P"],
      failed: {},
      skipped: [],
      cleanedUpPaths: [],
      stoppedOnQuota: false,
    });
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <ExportSyncModal open={false} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("loads matched exports, selects all by default, and calculates live quota", async () => {
    render(
      <ExportSyncModal open={true} onClose={vi.fn()} onChanged={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("League of Legends - 23/11/26 - Pentakill"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("AH-7F3K9Q2M - League of Legends"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Dark Souls - 23/11/26 - Boss Fight"),
    ).toBeInTheDocument();

    // 100 (metadata + playlist) + 50 (metadata only, already in playlist) = 150 units
    expect(screen.getByTestId("estimated-quota-value")).toHaveTextContent("150 units");
    expect(
      screen.getByRole("button", { name: "Apply to YouTube (2 videos)" }),
    ).toBeInTheDocument();

    // Unchecking "Also add to target playlists" drops quota to 100 units
    fireEvent.click(screen.getByLabelText("Also add to target playlists"));
    expect(screen.getByTestId("estimated-quota-value")).toHaveTextContent("100 units");

    // Unchecking first video drops quota to 50 units
    fireEvent.click(
      screen.getByLabelText("Select League of Legends - 23/11/26 - Pentakill"),
    );
    expect(screen.getByTestId("estimated-quota-value")).toHaveTextContent("50 units");
    expect(
      screen.getByRole("button", { name: "Apply to YouTube (1 video)" }),
    ).toBeInTheDocument();
  });

  it("passes includePlaylists and deleteExportedFiles flags when applying", async () => {
    const onChanged = vi.fn();
    render(
      <ExportSyncModal open={true} onClose={vi.fn()} onChanged={onChanged} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("League of Legends - 23/11/26 - Pentakill"),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByLabelText(/Delete temporary exported copy after applying/i),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Apply to YouTube (2 videos)" }),
    );

    await waitFor(() => {
      expect(mockApplyMatchedExports).toHaveBeenCalledWith(
        ["AH-7F3K9Q2M", "AH-9B2M4K1P"],
        true,
        true,
      );
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("dismisses a matched export record and notifies parent", async () => {
    const onChanged = vi.fn();
    render(
      <ExportSyncModal open={true} onClose={vi.fn()} onChanged={onChanged} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("League of Legends - 23/11/26 - Pentakill"),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss League of Legends - 23/11/26 - Pentakill",
      }),
    );

    await waitFor(() => {
      expect(mockDismissExportRecord).toHaveBeenCalledWith("AH-7F3K9Q2M");
    });

    expect(
      screen.queryByText("League of Legends - 23/11/26 - Pentakill"),
    ).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("displays progress updates and handles stoppedOnQuota gracefully", async () => {
    let resolveApply!: (value: unknown) => void;
    mockApplyMatchedExports.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );

    render(
      <ExportSyncModal open={true} onClose={vi.fn()} onChanged={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("League of Legends - 23/11/26 - Pentakill"),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Apply to YouTube (2 videos)" }),
    );

    act(() => {
      emitWailsEvent("export-sync:progress", {
        current: 1,
        total: 2,
        exportId: "AH-7F3K9Q2M",
        videoId: "yt-vid-1",
        title: "League of Legends - 23/11/26 - Pentakill",
        percentage: 50,
      });
    });

    expect(
      screen.getByText("Applying: League of Legends - 23/11/26 - Pentakill"),
    ).toBeInTheDocument();
    expect(screen.getByText("1/2 (50%)")).toBeInTheDocument();

    await act(async () => {
      resolveApply({
        applied: ["AH-7F3K9Q2M"],
        failed: { "AH-9B2M4K1P": "quotaExceeded" },
        skipped: [],
        cleanedUpPaths: [],
        stoppedOnQuota: true,
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText("Paused due to YouTube daily quota limit"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/video\(s\) updated successfully/i),
    ).toBeInTheDocument();
  });
});
