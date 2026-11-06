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

  it("renders single title mismatch correction with custom title and without episode badges", () => {
    const singleMismatch = [
      backend.CatalogTitleChange.createFrom({
        videoId: "v-lol-1",
        oldTitle: "League of Legends — 2/11/26 — Pentakill",
        newTitle: "League of Legends — 8/04/26 — Pentakill",
        oldEpisode: 0,
        newEpisode: 0,
      }),
    ];

    render(
      <YouTubeTitleUpdateModal
        isOpen={true}
        changes={singleMismatch}
        isLoadingPreview={false}
        isApplying={false}
        result={null}
        title="Correct video title"
        description="Update video title on YouTube to match local recording date."
        confirmLabel="Apply corrected title"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Correct video title")).toBeInTheDocument();
    expect(
      screen.getByText("Update video title on YouTube to match local recording date.")
    ).toBeInTheDocument();
    expect(screen.getByText("League of Legends — 2/11/26 — Pentakill")).toBeInTheDocument();
    expect(screen.getByText("League of Legends — 8/04/26 — Pentakill")).toBeInTheDocument();
    // Episode badges should NOT be rendered when oldEpisode and newEpisode are 0
    expect(
      screen.getByRole("button", { name: /apply corrected title/i })
    ).toBeInTheDocument();
  });

  it("does not render episode change badge when oldEpisode equals newEpisode", () => {
    const identicalEpisodes = [
      backend.CatalogTitleChange.createFrom({
        videoId: "v-ds-11",
        oldTitle: "DEATH STRANDING DIRECTOR'S CUT - 2/11/26 - 11",
        newTitle: "DEATH STRANDING DIRECTOR'S CUT - 30/10/26 - 11",
        oldEpisode: 11,
        newEpisode: 11,
      }),
    ];

    render(
      <YouTubeTitleUpdateModal
        isOpen={true}
        changes={identicalEpisodes}
        isLoadingPreview={false}
        isApplying={false}
        result={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Episode badge should NOT be rendered when oldEpisode === newEpisode
    expect(screen.queryByText(/Ep 11/i)).not.toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Corrected")).toBeInTheDocument();
    expect(screen.getByText("DEATH STRANDING DIRECTOR'S CUT - 2/11/26 - 11")).toBeInTheDocument();
    expect(screen.getByText("DEATH STRANDING DIRECTOR'S CUT - 30/10/26 - 11")).toBeInTheDocument();
  });
});
