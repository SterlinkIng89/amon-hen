import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DevLogsPanel from "../DevLogsPanel";
import * as quotaHook from "../../../hooks/useQuotaStatus";
import { APILogEntry } from "../../../utils/devLogsUtils";

const mockGetAPILogs = vi.fn();
const mockGetQuotaUsedToday = vi.fn();

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetAPILogs: (limit: number) => mockGetAPILogs(limit),
  GetQuotaUsedToday: () => mockGetQuotaUsedToday(),
  GetQuotaStatus: vi.fn(),
}));

const nowSec = Math.floor(Date.now() / 1000);
const resetsAtFixed = nowSec + 7200; // 2 hours from now
const todayLogTs = nowSec - 600; // 10 minutes ago (Today)
const yesterdayLogTs = nowSec - 86400; // 24 hours ago (Yesterday)


const sampleLogs: APILogEntry[] = [
  {
    id: 1,
    ts: todayLogTs,
    operation: "videos.insert",
    resourceId: "vid-1",
    resourceTitle: "Epic Win Highlight",
    success: true,
    errorMsg: "",
    quotaCost: 1600,
    durationMs: 450,
  },
  {
    id: 2,
    ts: todayLogTs - 60,
    operation: "playlists.insert",
    resourceId: "pl-1",
    resourceTitle: "Season 1",
    success: true,
    errorMsg: "",
    quotaCost: 50,
    durationMs: 120,
  },
  {
    id: 3,
    ts: todayLogTs - 120,
    operation: "videos.list",
    resourceId: "vid-2",
    resourceTitle: "My Video Details",
    success: true,
    errorMsg: "",
    quotaCost: 1,
    durationMs: 80,
  },
  {
    id: 4,
    ts: todayLogTs - 180,
    operation: "videos.update",
    resourceId: "vid-3",
    resourceTitle: "Failed Title Update",
    success: false,
    errorMsg: "Quota exceeded for operation",
    quotaCost: 50,
    durationMs: 250,
  },
  {
    id: 10,
    ts: todayLogTs - 300,
    operation: "playlistItems.list",
    resourceId: "pl-sync-1",
    resourceTitle: "Sync Page 1",
    success: true,
    errorMsg: "",
    quotaCost: 1,
    durationMs: 90,
  },
  {
    id: 11,
    ts: todayLogTs - 302,
    operation: "playlistItems.list",
    resourceId: "pl-sync-2",
    resourceTitle: "Sync Page 2",
    success: true,
    errorMsg: "",
    quotaCost: 1,
    durationMs: 85,
  },
  {
    id: 12,
    ts: todayLogTs - 304,
    operation: "videos.list",
    resourceId: "vid-sync-3",
    resourceTitle: "Sync Video 3",
    success: true,
    errorMsg: "",
    quotaCost: 1,
    durationMs: 890,
  },
  {
    id: 13,
    ts: todayLogTs - 306,
    operation: "videos.list",
    resourceId: "vid-sync-4",
    resourceTitle: "Sync Video 4",
    success: true,
    errorMsg: "",
    quotaCost: 1,
    durationMs: 2100,
  },
  {
    id: 5,
    ts: yesterdayLogTs,
    operation: "videos.insert",
    resourceId: "vid-yesterday",
    resourceTitle: "Yesterday Stream",
    success: true,
    errorMsg: "",
    quotaCost: 1600,
    durationMs: 500,
  },
];

describe("DevLogsPanel - KPI Strip, Scope Toggle & Filters (#160)", () => {
  const refreshQuotaMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAPILogs.mockResolvedValue(sampleLogs);
    mockGetQuotaUsedToday.mockResolvedValue(1650);

    vi.spyOn(quotaHook, "useQuotaStatus").mockReturnValue({
      status: {
        used: 1650,
        limit: 10000,
        remaining: 8350,
        resetsAt: resetsAtFixed,
      },
      msUntilReset: 3600 * 1000 * 2, // 2 hours
      refresh: refreshQuotaMock,
    });
  });

  it("does not render when open is false", () => {
    const { container } = render(<DevLogsPanel open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 3 KPI cards with quota used, upload capacity, and reset countdown", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    // Wait for logs to load
    await waitFor(() => {
      expect(mockGetAPILogs).toHaveBeenCalledWith(200);
    });

    // 1. Quota used card
    expect(screen.getByText(/Quota Used Today/i)).toBeInTheDocument();
    expect(screen.getByText(/1,?650/i)).toBeInTheDocument();
    expect(screen.getByText(/10,?000/i)).toBeInTheDocument();

    // 2. Remaining capacity card with ~N uploads left (8350 / 1600 = 5 uploads)
    expect(screen.getByText(/Remaining Capacity/i)).toBeInTheDocument();
    expect(screen.getByText(/8,?350 units left/i)).toBeInTheDocument();
    expect(screen.getByText(/~5 video uploads/i)).toBeInTheDocument();

    // 3. Daily reset countdown card
    expect(screen.getByText(/Daily Reset/i)).toBeInTheDocument();
    expect(screen.getByText(/Resets in 2h 0m/i)).toBeInTheDocument();
  });

  it("toggles between Today and Last 200 calls scope", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument();
    });

    // Default scope is "today": yesterdayLogTs should be excluded from table and operation pills
    expect(screen.queryByText("Yesterday Stream")).not.toBeInTheDocument();

    // Click "Last 200 calls" scope button
    const allScopeBtn = screen.getByRole("button", { name: /Last 200 calls/i });
    fireEvent.click(allScopeBtn);

    // Now yesterday's log should be visible
    expect(screen.getByText("Yesterday Stream")).toBeInTheDocument();

    // Click "Today" scope button to return
    const todayScopeBtn = screen.getByRole("button", { name: /^Today$/i });
    fireEvent.click(todayScopeBtn);

    expect(screen.queryByText("Yesterday Stream")).not.toBeInTheDocument();
  });

  it("filters logs when clicking operation summary pills as toggle buttons", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument();
    });

    // Find pill for videos.insert
    const videosInsertPill = screen.getByRole("button", { name: /videos\.insert/i });
    expect(videosInsertPill).toHaveAttribute("aria-pressed", "false");

    // Click to filter by videos.insert
    fireEvent.click(videosInsertPill);
    expect(videosInsertPill).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument();
    expect(screen.queryByText("Season 1")).not.toBeInTheDocument(); // playlists.insert hidden
    expect(screen.queryByText("My Video Details")).not.toBeInTheDocument(); // videos.list hidden

    // Click again to unfilter
    fireEvent.click(videosInsertPill);
    expect(videosInsertPill).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Season 1")).toBeInTheDocument();
  });

  it("filters logs by cost-tier tabs and search input", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument();
    });

    // Writes tab (cost >= 50)
    const writesTab = screen.getByRole("button", { name: /Writes/i });
    fireEvent.click(writesTab);

    expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument(); // 1600
    expect(screen.getByText("Season 1")).toBeInTheDocument(); // 50
    expect(screen.queryByText("My Video Details")).not.toBeInTheDocument(); // 1 unit read excluded

    // Reads tab (0 < cost < 50)
    const readsTab = screen.getByRole("button", { name: /Reads/i });
    fireEvent.click(readsTab);

    expect(screen.queryByText("Epic Win Highlight")).not.toBeInTheDocument();
    expect(screen.getByText("My Video Details")).toBeInTheDocument();

    // Errors tab (failed requests)
    const errorsTab = screen.getByRole("button", { name: /Errors/i });
    fireEvent.click(errorsTab);

    expect(screen.getByText("Failed Title Update")).toBeInTheDocument();
    expect(screen.queryByText("Epic Win Highlight")).not.toBeInTheDocument();

    // Reset to All tab
    const allTab = screen.getByRole("button", { name: /^All/i });
    fireEvent.click(allTab);

    // Search query input
    const searchInput = screen.getByPlaceholderText(/Filter by operation, title, ID, or error/i);
    fireEvent.change(searchInput, { target: { value: "Season 1" } });

    expect(screen.getByText("Season 1")).toBeInTheDocument();
    expect(screen.queryByText("Epic Win Highlight")).not.toBeInTheDocument();
  });

  it("closes modal on Escape key press", async () => {
    const handleClose = vi.fn();
    render(<DevLogsPanel open={true} onClose={handleClose} />);

    await waitFor(() => {
      expect(screen.getByText("YouTube API Dev Logs")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe("DevLogsPanel - Log Table Burst Grouping, Date Dividers, & Error Inspector (#161)", () => {
  const refreshQuotaMock = vi.fn();
  const writeTextMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAPILogs.mockResolvedValue(sampleLogs);

    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock.mockResolvedValue(undefined),
      },
    });

    vi.spyOn(quotaHook, "useQuotaStatus").mockReturnValue({
      status: {
        used: 1650,
        limit: 10000,
        remaining: 8350,
        resetsAt: resetsAtFixed,
      },
      msUntilReset: 3600 * 1000 * 2,
      refresh: refreshQuotaMock,
    });
  });

  it("collapses 3+ consecutive 1-unit read calls into an expandable sync burst row", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument();
    });

    // Group bursts toggle is active by default; individual sync calls should be collapsed
    expect(screen.getByText(/Sync burst \(4 calls\)/i)).toBeInTheDocument();
    expect(screen.queryByText("Sync Page 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync Video 3")).not.toBeInTheDocument();

    // Click on the burst row to expand it
    const burstRow = screen.getByText(/Sync burst \(4 calls\)/i);
    fireEvent.click(burstRow);

    // Now individual items are visible
    expect(screen.getByText("Sync Page 1")).toBeInTheDocument();
    expect(screen.getByText("Sync Page 2")).toBeInTheDocument();
    expect(screen.getByText("Sync Video 3")).toBeInTheDocument();
    expect(screen.getByText("Sync Video 4")).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(burstRow);
    expect(screen.queryByText("Sync Page 1")).not.toBeInTheDocument();

    // Click "Group bursts" toggle button to disable burst grouping
    const groupBurstsBtn = screen.getByRole("button", { name: /Group bursts/i });
    fireEvent.click(groupBurstsBtn);

    // When disabled, all rows render individually
    expect(screen.getByText("Sync Page 1")).toBeInTheDocument();
    expect(screen.getByText("Sync Video 4")).toBeInTheDocument();
    expect(screen.queryByText(/Sync burst \(4 calls\)/i)).not.toBeInTheDocument();
  });

  it("renders date divider rows when items cross day boundaries", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument();
    });

    // Switch to Last 200 calls scope to see multi-day items
    const allScopeBtn = screen.getByRole("button", { name: /Last 200 calls/i });
    fireEvent.click(allScopeBtn);

    // Expect date dividers for Today and Yesterday
    expect(screen.getByText(/Today - /i)).toBeInTheDocument();
    expect(screen.getByText(/Yesterday - /i)).toBeInTheDocument();
  });

  it("highlights slow latency values with amber and orange colors", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Epic Win Highlight")).toBeInTheDocument();
    });

    // Expand burst to inspect duration cells
    const burstRow = screen.getByText(/Sync burst \(4 calls\)/i);
    fireEvent.click(burstRow);

    const highLatencyCell = screen.getByText("2100ms");
    expect(highLatencyCell).toBeInTheDocument();
    // Orange for >= 2000ms
    expect(highLatencyCell).toHaveStyle({ color: "#f97316" });

    const mediumLatencyCell = screen.getByText("890ms");
    expect(mediumLatencyCell).toBeInTheDocument();
    // Amber for >= 800ms
    expect(mediumLatencyCell).toHaveStyle({ color: "#eab308" });
  });

  it("expands full error message and copies error text on failed row click", async () => {
    render(<DevLogsPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Failed Title Update")).toBeInTheDocument();
    });

    // Error row is not expanded initially
    expect(screen.queryByRole("button", { name: /Copy Error/i })).not.toBeInTheDocument();

    // Click the failed row (or the ERR cell)
    const failedRow = screen.getByText("Failed Title Update").closest("tr")!;
    fireEvent.click(failedRow);

    // Now error container and Copy Error button should be visible
    expect(screen.getByText("Quota exceeded for operation")).toBeInTheDocument();
    const copyBtn = screen.getByRole("button", { name: /Copy Error/i });
    expect(copyBtn).toBeInTheDocument();

    // Click copy
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith("Quota exceeded for operation");
  });
});

