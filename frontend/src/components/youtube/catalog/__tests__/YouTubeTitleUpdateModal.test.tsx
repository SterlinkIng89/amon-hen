import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { YouTubeTitleUpdateModal } from "../YouTubeTitleUpdateModal";
import { backend } from "../../../../../wailsjs/go/models";
import { EventsOn } from "../../../../../wailsjs/runtime/runtime";

vi.mock("../../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn(() => vi.fn()),
}));

describe("YouTubeTitleUpdateModal", () => {
  const mockChanges = [
    backend.CatalogTitleChange.createFrom({
      videoId: "v26b",
      oldTitle: "Persona 3 Reload - 11/08/26 - 26",
      newTitle: "Persona 3 Reload - 11/08/26 - 27",
      oldEpisode: 26,
      newEpisode: 27,
    }),
    backend.CatalogTitleChange.createFrom({
      videoId: "v27",
      oldTitle: "Persona 3 Reload - 12/08/26 - 27",
      newTitle: "Persona 3 Reload - 12/08/26 - 28",
      oldEpisode: 27,
      newEpisode: 28,
    }),
  ];

  it("renders preview with title diffs and estimated quota", () => {
    render(
      <YouTubeTitleUpdateModal
        isOpen={true}
        changes={mockChanges}
        isLoadingPreview={false}
        isApplying={false}
        result={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Update YouTube video titles")).toBeInTheDocument();
    expect(screen.getByText("Persona 3 Reload - 11/08/26 - 26")).toBeInTheDocument();
    expect(screen.getByText("Persona 3 Reload - 11/08/26 - 27")).toBeInTheDocument();
    expect(screen.getByText(/100 quota units/i)).toBeInTheDocument();
  });

  it("calls onConfirm when clicking update button", () => {
    const onConfirm = vi.fn();
    render(
      <YouTubeTitleUpdateModal
        isOpen={true}
        changes={mockChanges}
        isLoadingPreview={false}
        isApplying={false}
        result={null}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    const updateBtn = screen.getByRole("button", { name: /update 2 titles/i });
    fireEvent.click(updateBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders success summary when result is provided", () => {
    const mockResult = backend.CatalogTitleUpdateResult.createFrom({
      updated: ["v26b", "v27"],
      failed: {},
      skipped: [],
    });

    render(
      <YouTubeTitleUpdateModal
        isOpen={true}
        changes={mockChanges}
        isLoadingPreview={false}
        isApplying={false}
        result={mockResult}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Successfully updated 2 titles on YouTube/i)).toBeInTheDocument();
  });

  it("renders progress bar and status when isApplying is true", () => {
    render(
      <YouTubeTitleUpdateModal
        isOpen={true}
        changes={mockChanges}
        isLoadingPreview={false}
        isApplying={true}
        progress={{
          current: 1,
          total: 2,
          videoId: "v26b",
          title: "Persona 3 Reload - 11/08/26 - 27",
          percentage: 50,
        }}
        result={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Updating video 1 of 2...")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Updating...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /updating \(1\/2\)\.\.\./i })).toBeInTheDocument();
  });
});
