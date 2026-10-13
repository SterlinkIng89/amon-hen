import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlaylistEpisodeTable } from "../PlaylistEpisodeTable";
import { backend } from "../../../../../wailsjs/go/models";

describe("PlaylistEpisodeTable", () => {
  const sampleVideos: backend.CatalogVideoDraft[] = [
    {
      videoId: "yt-1",
      title: "Control - Episode 1 - Welcome to the Oldest House",
      existingEpisode: 0,
      episode: 1,
      conflict: false,
    } as backend.CatalogVideoDraft,
    {
      videoId: "yt-2",
      title: "Control - Episode 2 - Unknown Caller",
      existingEpisode: 0,
      episode: 2,
      conflict: false,
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

    const conflicts = screen.getAllByText(/Duplicate episode/i);
    expect(conflicts.length).toBeGreaterThan(0);
  });
});
