import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LocalRecordingActivity from "../LocalRecordingActivity";
import {
  GetVideosFromFolders,
  LoadConfig,
  GetChannelVideosPaginated,
} from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn(() => vi.fn()),
}));

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetVideosFromFolders: vi.fn(),
  LoadConfig: vi.fn(),
  GetChannelVideosPaginated: vi.fn(),
  GetThumbnail: vi.fn(),
}));

describe("LocalRecordingActivity Day Inspector", () => {
  const mockFilters = {
    value: {
      dateFrom: "",
      dateTo: "",
      excludeWords: [] as string[],
    },
    onChange: vi.fn(),
  };

  const mockLocalVideos = [
    {
      name: "Elden Ring - 2026-10-15.mp4",
      path: "/videos/elden_ring.mp4",
      size: 1024,
      modTime: new Date("2026-10-15T10:00:00").getTime(),
      folder: "/videos",
      game: "Elden Ring",
      youtubeTitle: "Elden Ring - Boss Fight",
      durationSecs: 7200, // 2h
    },
  ];

  const mockYtVideos = [
    {
      id: "yt123",
      title: "Hades II - 2026-10-15",
      description: "Run 1",
      publishedAt: "2026-10-15T15:00:00Z",
      thumbnailUrl: "https://example.com/thumb.jpg",
      viewCount: 100,
      likeCount: 10,
      duration: "PT1H30M",
      privacy: "public",
      gameTag: "Hades II",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LoadConfig).mockResolvedValue({ folders: ["/videos"] } as never);
    vi.mocked(GetVideosFromFolders).mockResolvedValue(mockLocalVideos as never);
    vi.mocked(GetChannelVideosPaginated).mockResolvedValue({
      videos: mockYtVideos,
    } as never);
  });

  it("opens Day Inspector when clicking active date, renders sessions, and toggles closed", async () => {
    const onDateSelect = vi.fn();

    const { container } = render(
      <LocalRecordingActivity
        filters={mockFilters}
        onDateSelect={onDateSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Title date")).toBeInTheDocument();
    });

    const activeRects = container.querySelectorAll("rect.cursor-pointer");
    expect(activeRects.length).toBeGreaterThan(0);

    // Click the active day rect for 2026-10-15
    fireEvent.click(activeRects[0]);

    expect(onDateSelect).toHaveBeenCalledWith("2026-10-15");

    // Verify day inspector header & badge
    await waitFor(() => {
      expect(screen.getByText(/Thu, Oct 15, 2026/i)).toBeInTheDocument();
      expect(screen.getByText(/2 recordings · 3h 30m/i)).toBeInTheDocument();
    });

    // Verify session rows
    expect(screen.getByText("Elden Ring - Boss Fight")).toBeInTheDocument();
    expect(screen.getByText("Hades II - 2026-10-15")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getAllByText("YouTube").length).toBeGreaterThanOrEqual(2);

    // Click close button
    const closeBtn = screen.getByLabelText("Close day inspector");
    fireEvent.click(closeBtn);

    expect(onDateSelect).toHaveBeenCalledWith(null);

    // Inspector should now be closed
    await waitFor(() => {
      expect(screen.queryByLabelText("Close day inspector")).toBeNull();
    });
  });

  it("deduplicates local files that are already on YouTube when source is all", async () => {
    // Both local video and YT video represent the same upload
    vi.mocked(GetVideosFromFolders).mockResolvedValue([
      {
        name: "Hades II - 2026-10-15.mp4",
        path: "/videos/hades.mp4",
        size: 1024,
        modTime: new Date("2026-10-15T10:00:00").getTime(),
        folder: "/videos",
        game: "Hades II",
        youtubeTitle: "Hades II - 2026-10-15",
        youtubeId: "yt123",
        durationSecs: 5400,
      },
    ] as never);

    const { container } = render(
      <LocalRecordingActivity filters={mockFilters} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Title date")).toBeInTheDocument();
    });

    const activeRects = container.querySelectorAll("rect.cursor-pointer");
    expect(activeRects.length).toBeGreaterThan(0);

    fireEvent.click(activeRects[0]);

    // Should only have 1 recording in total (the YouTube one), not 2
    await waitFor(() => {
      expect(screen.getByText(/1 recording · 1h 30m/i)).toBeInTheDocument();
      expect(screen.queryByText("Local")).toBeNull();
    });
  });

  it("sorts day sessions by episode ascending when multiple episodes are present", async () => {
    vi.mocked(GetVideosFromFolders).mockResolvedValue([] as never);
    vi.mocked(GetChannelVideosPaginated).mockResolvedValue({
      videos: [
        {
          id: "yt-ep19",
          title: "Kingdom Come: Deliverance II - 2026-10-15 - 19",
          publishedAt: "2026-10-15T18:00:00Z",
          duration: "PT2H",
        },
        {
          id: "yt-ep16",
          title: "Kingdom Come: Deliverance II - 2026-10-15 - 16",
          publishedAt: "2026-10-15T12:00:00Z",
          duration: "PT2H",
        },
        {
          id: "yt-ep18",
          title: "Kingdom Come: Deliverance II - 2026-10-15 - 18",
          publishedAt: "2026-10-15T16:00:00Z",
          duration: "PT2H",
        },
      ],
    } as never);

    const { container } = render(
      <LocalRecordingActivity filters={mockFilters} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Title date")).toBeInTheDocument();
    });

    const activeRects = container.querySelectorAll("rect.cursor-pointer");
    fireEvent.click(activeRects[0]);

    await waitFor(() => {
      const titles = screen
        .getAllByText(/Kingdom Come: Deliverance II - 2026-10-15 -/i)
        .map((el) => el.textContent);
      expect(titles).toEqual([
        "Kingdom Come: Deliverance II - 2026-10-15 - 16",
        "Kingdom Come: Deliverance II - 2026-10-15 - 18",
        "Kingdom Come: Deliverance II - 2026-10-15 - 19",
      ]);
    });
  });
});
