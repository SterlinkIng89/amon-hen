import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DuplicateEpisodeDialog } from "../DuplicateEpisodeDialog";
import { backend } from "../../../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../../../wailsjs/runtime/runtime";

vi.mock("../../../../../wailsjs/runtime/runtime", () => ({
  BrowserOpenURL: vi.fn(),
}));

describe("DuplicateEpisodeDialog", () => {
  const mockVideos = [
    backend.CatalogVideoDraft.createFrom({
      videoId: "vid-a",
      title: "Persona 3 Reload - 10/08/26 - 26",
      sortDate: "2026-08-10",
      publishedAt: "2026-08-10T14:30:00Z",
      duration: "PT1H15M20S",
      thumbnailUrl: "https://example.com/thumb-a.jpg",
      episode: 26,
    }),
    backend.CatalogVideoDraft.createFrom({
      videoId: "vid-b",
      title: "Persona 3 Reload - 10/08/26 - 26",
      sortDate: "2026-08-10",
      publishedAt: "2026-08-10T19:45:00Z",
      duration: "PT45M10S",
      thumbnailUrl: "https://example.com/thumb-b.jpg",
      episode: 26,
    }),
  ];

  it("renders the dialog with header, video items, and shifted count summary", () => {
    render(
      <DuplicateEpisodeDialog
        episode={26}
        videos={mockVideos}
        shiftedCount={7}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Resolve duplicate episode 26")).toBeInTheDocument();
    expect(screen.getAllByText("Persona 3 Reload - 10/08/26 - 26")).toHaveLength(2);
    expect(screen.getByText(/7 subsequent episode/i)).toBeInTheDocument();
    // Displays duration badges for each video
    expect(screen.getAllByText("1:15:20").length).toBeGreaterThan(0);
    expect(screen.getAllByText("45:10").length).toBeGreaterThan(0);
  });

  it("allows moving items down and up", () => {
    const onConfirm = vi.fn();
    render(
      <DuplicateEpisodeDialog
        episode={26}
        videos={mockVideos}
        shiftedCount={7}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    // Initial sequence: vid-a -> vid-b
    const downButtons = screen.getAllByRole("button", { name: /down/i });
    expect(downButtons[0]).not.toBeDisabled();
    expect(downButtons[1]).toBeDisabled();

    // Click move down on the first item
    fireEvent.click(downButtons[0]);

    // Now vid-b is first, vid-a is second
    fireEvent.click(screen.getByRole("button", { name: /apply sequence/i }));
    expect(onConfirm).toHaveBeenCalledWith(["vid-b", "vid-a"]);
  });

  it("calls onCancel when clicking cancel or pressing Escape", () => {
    const onCancel = vi.fn();
    render(
      <DuplicateEpisodeDialog
        episode={26}
        videos={mockVideos}
        shiftedCount={0}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("opens video on YouTube when clicking watch button", () => {
    render(
      <DuplicateEpisodeDialog
        episode={26}
        videos={mockVideos}
        shiftedCount={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const watchButtons = screen.getAllByRole("button", { name: /watch .* on youtube/i });
    expect(watchButtons).toHaveLength(2);

    fireEvent.click(watchButtons[0]);
    expect(BrowserOpenURL).toHaveBeenCalledWith("https://www.youtube.com/watch?v=vid-a");
  });
});
