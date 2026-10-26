import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlaylistEpisodeTable } from "../PlaylistEpisodeTable";
import { backend } from "../../../../../wailsjs/go/models";
import { BatchItem } from "../../../../types";

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

  it("invokes numbering tool callbacks", () => {
    const onAutoNumberByDate = vi.fn();
    const onAutoNumberByOrder = vi.fn();
    const onReverseEpisodes = vi.fn();

    render(
      <PlaylistEpisodeTable
        videos={sampleVideos}
        episodes={{ "yt-1": 1, "yt-2": 2 }}
        onEpisodeChange={vi.fn()}
        onAutoNumberByDate={onAutoNumberByDate}
        onAutoNumberByOrder={onAutoNumberByOrder}
        onReverseEpisodes={onReverseEpisodes}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /1..N by date/i }));
    expect(onAutoNumberByDate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /1..N by order/i }));
    expect(onAutoNumberByOrder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Reverse/i }));
    expect(onReverseEpisodes).toHaveBeenCalledTimes(1);
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

    const updateButtons = screen.getAllByRole("button", { name: /Update thumbnail for/i });
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
});
