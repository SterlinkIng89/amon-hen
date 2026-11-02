import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlaylistEpisodeTable } from "../PlaylistEpisodeTable";
import { backend } from "../../../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../../../wailsjs/runtime/runtime";
import { BatchItem } from "../../../../types";

vi.mock("../../../../../wailsjs/runtime/runtime", () => ({
  BrowserOpenURL: vi.fn(),
}));

describe("PlaylistEpisodeTable", () => {
  const sampleVideos: backend.CatalogVideoDraft[] = [
    {
      videoId: "yt-1",
      title: "Control - Episode 1 - Welcome to the Oldest House",
      thumbnailUrl: "https://example.com/yt-1.jpg",
      existingEpisode: 0,
      episode: 1,
      source: "title",
      conflict: false,
      thumbnailUpdatedAt: 1700000000,
    } as backend.CatalogVideoDraft,
    {
      videoId: "yt-2",
      title: "Control - Episode 2 - Unknown Caller",
      thumbnailUrl: "https://example.com/yt-2.jpg",
      existingEpisode: 0,
      episode: 2,
      source: "db",
      conflict: false,
      localFile: "Control_Ep02.mp4",
      thumbnailUpdatedAt: 0,
    } as backend.CatalogVideoDraft,
  ];

  it("renders table with video titles, inferred episodes and inputs", () => {
    const onEpisodeChange = vi.fn();
    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={onEpisodeChange}
      />
    );

    expect(screen.getByText(/Welcome to the Oldest House/i)).toBeInTheDocument();
    expect(screen.getByText(/Unknown Caller/i)).toBeInTheDocument();

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);
    expect((inputs[0] as HTMLInputElement).value).toBe("1");
    expect((inputs[1] as HTMLInputElement).value).toBe("2");

    fireEvent.change(inputs[0], { target: { value: "3" } });
    expect(onEpisodeChange).toHaveBeenCalledWith("yt-1", 3);
  });

  it("shows duplicate conflict indicator when duplicate episodes are detected", () => {
    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 2, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
      />
    );

    const conflicts = screen.getAllByText(/Duplicate/i);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("renders thumbnail preview, source badge, local indicator and sync state", () => {
    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
      />
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getAllByText("Synced").length).toBeGreaterThan(0);
    expect(screen.getByText("Needs thumb")).toBeInTheDocument();
  });

  it("supports row selection, select unsynced, and clear selection", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
        selectedVideoIds={new Set(["yt-1"])}
        onSelectionChange={onSelectionChange}
      />
    );

    // Row checkbox
    const row2Checkbox = screen.getByLabelText(/Select Control - Episode 2/i);
    fireEvent.click(row2Checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["yt-1", "yt-2"]));

    // Select unsynced
    const selectUnsyncedBtn = screen.getByRole("button", { name: /Select unsynced/i });
    fireEvent.click(selectUnsyncedBtn);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["yt-2"]));

    // Clear selection
    rerender(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
        selectedVideoIds={new Set(["yt-1", "yt-2"])}
        onSelectionChange={onSelectionChange}
      />
    );
    const clearBtn = screen.getByRole("button", { name: /Clear/i });
    fireEvent.click(clearBtn);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
  });

  it("filters videos by status tab", () => {
    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Welcome to the Oldest House/i)).toBeInTheDocument();
    expect(screen.getByText(/Unknown Caller/i)).toBeInTheDocument();

    // Click Needs thumbnail filter
    fireEvent.click(screen.getByRole("button", { name: /Needs thumbnail/i }));
    expect(screen.queryByText(/Welcome to the Oldest House/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Unknown Caller/i)).toBeInTheDocument();

    // Click Synced filter
    fireEvent.click(screen.getByRole("button", { name: /^Synced/i }));
    expect(screen.getByText(/Welcome to the Oldest House/i)).toBeInTheDocument();
    expect(screen.queryByText(/Unknown Caller/i)).not.toBeInTheDocument();
  });

  it("invokes onSelectPreviewVideo and onUpdateSingleVideo", () => {
    const onSelectPreviewVideo = vi.fn();
    const onUpdateSingleVideo = vi.fn();

    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
        onSelectPreviewVideo={onSelectPreviewVideo}
        onUpdateSingleVideo={onUpdateSingleVideo}
      />
    );

    const previewButtons = screen.getAllByTitle(/Click to preview episode in thumbnail studio/i);
    expect(previewButtons).toHaveLength(2);
    fireEvent.click(previewButtons[0]);
    expect(onSelectPreviewVideo).toHaveBeenCalledWith("yt-1");

    const updateButtons = screen.getAllByRole("button", { name: /Upload thumbnail for/i });
    expect(updateButtons).toHaveLength(2);
    fireEvent.click(updateButtons[1]);
    expect(onUpdateSingleVideo).toHaveBeenCalledWith("yt-2");
  });

  it("renders live rendering and uploading status from batch items", () => {
    const batchItems: BatchItem[] = [
      { videoId: "yt-1", episode: 1, cacheKey: "c1", status: "rendering" },
      { videoId: "yt-2", episode: 2, cacheKey: "c2", status: "uploading" },
    ];

    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
        batchItems={batchItems}
      />
    );

    expect(screen.getByText("Rendering...")).toBeInTheDocument();
    expect(screen.getByText("Uploading...")).toBeInTheDocument();
  });

  it("renders Title pill and Use button for mismatched rows and triggers sync callback", () => {
    const mismatchedVideos: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-1",
        title: "Control - Episode 5 - Oldest House",
        thumbnailUrl: "https://example.com/yt-1.jpg",
        existingEpisode: 1,
        episode: 1,
        titleEpisode: 5,
        source: "db",
        conflict: false,
        mismatch: true,
      } as backend.CatalogVideoDraft,
      {
        videoId: "yt-2",
        title: "Control - Episode 2 - Unknown Caller",
        thumbnailUrl: "https://example.com/yt-2.jpg",
        existingEpisode: 2,
        episode: 2,
        titleEpisode: 2,
        source: "title",
        conflict: false,
        mismatch: false,
      } as backend.CatalogVideoDraft,
    ];

    const onSyncVideoFromTitle = vi.fn();
    const onEpisodeChange = vi.fn();

    const { rerender } = render(
      <PlaylistEpisodeTable
        videos={mismatchedVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={onEpisodeChange}
        onSyncVideoFromTitle={onSyncVideoFromTitle}
      />
    );

    expect(screen.getByText("Title: 5")).toBeInTheDocument();
    const useBtn = screen.getByRole("button", { name: /Use 5/i });
    expect(useBtn).toBeInTheDocument();

    fireEvent.click(useBtn);
    expect(onSyncVideoFromTitle).toHaveBeenCalledWith("yt-1");

    // When onSyncVideoFromTitle is omitted, fallback calls onEpisodeChange
    rerender(
      <PlaylistEpisodeTable
        videos={mismatchedVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={onEpisodeChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Use 5/i }));
    expect(onEpisodeChange).toHaveBeenCalledWith("yt-1", 5);
  });

  it("renders Sync all from title toolbar button with count and handles click and disabled states", () => {
    const mismatchedVideos: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-1",
        title: "Control - Episode 4",
        existingEpisode: 1,
        episode: 1,
        titleEpisode: 4,
      } as backend.CatalogVideoDraft,
      {
        videoId: "yt-2",
        title: "Control - Episode 8",
        existingEpisode: 2,
        episode: 2,
        titleEpisode: 8,
      } as backend.CatalogVideoDraft,
    ];

    const onSyncAllFromTitle = vi.fn();

    const { rerender } = render(
      <PlaylistEpisodeTable
        videos={mismatchedVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
        onSyncAllFromTitle={onSyncAllFromTitle}
      />
    );

    const syncAllBtn = screen.getByRole("button", { name: /Sync all from title/i });
    expect(syncAllBtn).toBeInTheDocument();
    expect(syncAllBtn).not.toBeDisabled();
    expect(syncAllBtn).toHaveTextContent("2");

    fireEvent.click(syncAllBtn);
    expect(onSyncAllFromTitle).toHaveBeenCalledTimes(1);

    // When episodes match title episodes, mismatchCount is 0 and button is disabled
    rerender(
      <PlaylistEpisodeTable
        videos={mismatchedVideos}
        episodes={{ "yt-1": 4, "yt-2": 8 }}
        onEpisodeChange={vi.fn()}
        onSyncAllFromTitle={onSyncAllFromTitle}
      />
    );
    expect(screen.getByRole("button", { name: /Sync all from title/i })).toBeDisabled();
  });

  it("filters videos by Mismatch tab", () => {
    const videos: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-1",
        title: "Control - Episode 3",
        existingEpisode: 1,
        episode: 1,
        titleEpisode: 3,
      } as backend.CatalogVideoDraft,
      {
        videoId: "yt-2",
        title: "Control - Episode 2",
        existingEpisode: 2,
        episode: 2,
        titleEpisode: 2,
      } as backend.CatalogVideoDraft,
    ];

    render(
      <PlaylistEpisodeTable
        videos={videos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
      />
    );

    expect(screen.getByText("Control - Episode 3")).toBeInTheDocument();
    expect(screen.getByText("Control - Episode 2")).toBeInTheDocument();

    const mismatchFilterBtn = screen.getByRole("button", { name: /Mismatch/i });
    expect(mismatchFilterBtn).toHaveTextContent("1");
    fireEvent.click(mismatchFilterBtn);

    expect(screen.getByText("Control - Episode 3")).toBeInTheDocument();
    expect(screen.queryByText("Control - Episode 2")).not.toBeInTheDocument();
  });

  it("displays Out of order badge on videos in chronologyIssueIds", () => {
    const videos: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-1",
        title: "Control - Episode 2",
        existingEpisode: 2,
        episode: 2,
      } as backend.CatalogVideoDraft,
      {
        videoId: "yt-2",
        title: "Control - Episode 1",
        existingEpisode: 1,
        episode: 1,
      } as backend.CatalogVideoDraft,
    ];

    render(
      <PlaylistEpisodeTable
        videos={videos}
        episodes={{ "yt-1": 2, "yt-2": 1 }}
        onEpisodeChange={vi.fn()}
        chronologyIssueIds={new Set(["yt-2"])}
      />
    );

    const outOfOrderBadges = screen.getAllByText("Out of order");
    expect(outOfOrderBadges).toHaveLength(1);
  });

  it("does not spuriously flag unassigned videos (0) as duplicate conflict", () => {
    const unassignedVideos: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-1",
        title: "Bonus Video 1",
        existingEpisode: 0,
        episode: 0,
      } as backend.CatalogVideoDraft,
      {
        videoId: "yt-2",
        title: "Bonus Video 2",
        existingEpisode: 0,
        episode: 0,
      } as backend.CatalogVideoDraft,
    ];

    render(
      <PlaylistEpisodeTable
        videos={unassignedVideos}
        episodes={{ "yt-1": 0, "yt-2": 0 }}
        onEpisodeChange={vi.fn()}
      />
    );

    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(screen.getAllByText("Invalid")).toHaveLength(2);
  });

  it("marks thumbnail as stale Needs thumb with tooltip when assigned episode differs from thumbnailEpisode", () => {
    const videoWithStaleThumb: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-1",
        title: "Control - Episode 1",
        thumbnailUrl: "https://example.com/yt-1.jpg",
        existingEpisode: 0,
        episode: 1,
        thumbnailUpdatedAt: 1700000000,
        thumbnailEpisode: 1,
      } as backend.CatalogVideoDraft,
    ];

    // Assigned episode is changed to 2 (differs from thumbnailEpisode 1)
    const { container } = render(
      <PlaylistEpisodeTable
        videos={videoWithStaleThumb}
        episodes={{ "yt-1": 2 }}
        onEpisodeChange={vi.fn()}
      />
    );

    const needsThumbBadge = screen.getByText("Needs thumb");
    expect(needsThumbBadge).toBeInTheDocument();
    expect(needsThumbBadge).toHaveAttribute(
      "title",
      "Thumbnail has old episode number (1)"
    );

    const tbody = container.querySelector("tbody");
    expect(tbody?.textContent).not.toContain("Synced");
  });

  it("gracefully falls back to No thumb placeholder when image onError triggers", () => {
    const videoWithBrokenThumb: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-broken",
        title: "Broken Thumbnail Video",
        thumbnailUrl: "https://example.com/broken.jpg",
        existingEpisode: 1,
        episode: 1,
      } as backend.CatalogVideoDraft,
    ];

    const { container } = render(
      <PlaylistEpisodeTable
        videos={videoWithBrokenThumb}
        episodes={{ "yt-broken": 1 }}
        onEpisodeChange={vi.fn()}
      />
    );

    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(screen.queryByText("No thumb")).not.toBeInTheDocument();

    fireEvent.error(img!);

    expect(screen.getByText("No thumb")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("detects low-resolution YouTube placeholder and displays Processing indicator instead of Synced", () => {
    const videoWithThumb: backend.CatalogVideoDraft[] = [
      {
        videoId: "yt-proc",
        title: "Processing Thumbnail Video",
        thumbnailUrl: "https://example.com/proc.jpg",
        existingEpisode: 1,
        episode: 1,
        thumbnailUpdatedAt: 1700000000,
        thumbnailEpisode: 1,
      } as backend.CatalogVideoDraft,
    ];

    const { container } = render(
      <PlaylistEpisodeTable
        videos={videoWithThumb}
        episodes={{ "yt-proc": 1 }}
        onEpisodeChange={vi.fn()}
      />
    );

    const tbody = container.querySelector("tbody");
    expect(tbody?.textContent).toContain("Synced");

    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();

    Object.defineProperty(img!, "naturalWidth", { value: 120, configurable: true });
    fireEvent.load(img!);

    // Once 120px placeholder is detected, shows Processing instead of Synced in tbody
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(tbody?.textContent).not.toContain("Synced");

    // When high-res thumbnail loads (e.g. naturalWidth 1280), reverts to Synced
    Object.defineProperty(img!, "naturalWidth", { value: 1280, configurable: true });
    fireEvent.load(img!);

    expect(tbody?.textContent).toContain("Synced");
    expect(screen.queryByText("Processing")).not.toBeInTheDocument();
  });

  it("sorts rows by episode column when clicking header without modifying episodes", () => {
    const multiVideos: backend.CatalogVideoDraft[] = [
      { videoId: "v-1", title: "Video One", position: 0, episode: 10 } as backend.CatalogVideoDraft,
      { videoId: "v-2", title: "Video Two", position: 1, episode: 2 } as backend.CatalogVideoDraft,
      { videoId: "v-3", title: "Video Three", position: 2, episode: 5 } as backend.CatalogVideoDraft,
    ];
    const onEpisodeChange = vi.fn();

    const { container } = render(
      <PlaylistEpisodeTable
        videos={multiVideos}
        episodes={{ "v-1": 10, "v-2": 2, "v-3": 5 }}
        onEpisodeChange={onEpisodeChange}
      />
    );

    const getRowTitles = () =>
      Array.from(container.querySelectorAll("tbody tr td:nth-child(2) div[title]")).map(
        (el) => el.textContent
      );

    // Default order is playlist position: v-1, v-2, v-3
    expect(getRowTitles()).toEqual(["Video One", "Video Two", "Video Three"]);

    // Find Episode header
    const episodeHeader = screen.getByRole("columnheader", { name: /episode/i });
    expect(episodeHeader).toHaveAttribute("aria-sort", "none");

    // Click 1: Ascending (2, 5, 10 -> Video Two, Video Three, Video One)
    fireEvent.click(episodeHeader);
    expect(episodeHeader).toHaveAttribute("aria-sort", "ascending");
    expect(getRowTitles()).toEqual(["Video Two", "Video Three", "Video One"]);
    expect(onEpisodeChange).not.toHaveBeenCalled();

    // Click 2: Descending (10, 5, 2 -> Video One, Video Three, Video Two)
    fireEvent.click(episodeHeader);
    expect(episodeHeader).toHaveAttribute("aria-sort", "descending");
    expect(getRowTitles()).toEqual(["Video One", "Video Three", "Video Two"]);
    expect(onEpisodeChange).not.toHaveBeenCalled();

    // Click 3: Back to default position
    fireEvent.click(episodeHeader);
    expect(episodeHeader).toHaveAttribute("aria-sort", "none");
    expect(getRowTitles()).toEqual(["Video One", "Video Two", "Video Three"]);
  });

  it("opens video on YouTube when clicking watch button", () => {
    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
      />
    );

    const watchBtn = screen.getByRole("button", {
      name: `Watch ${sampleVideos[0].title} on YouTube`,
    });
    expect(watchBtn).toBeInTheDocument();

    fireEvent.click(watchBtn);

    expect(BrowserOpenURL).toHaveBeenCalledWith(
      `https://www.youtube.com/watch?v=${sampleVideos[0].videoId}`
    );
  });
});

