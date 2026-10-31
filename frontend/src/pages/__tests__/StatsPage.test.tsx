import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import StatsPage from "../StatsPage";

vi.mock("../../components/youtube/YouTubeSyncButton", () => ({
  default: () => <div data-testid="youtube-sync-button">Mock YouTubeSyncButton</div>,
}));

vi.mock("../../components/stats/LocalRecordingActivity", () => ({
  default: () => <div data-testid="local-recording-activity">Mock Activity</div>,
}));

vi.mock("../../components/stats/MostPlayedGames", () => ({
  default: () => <div data-testid="most-played-games">Mock Games</div>,
}));

vi.mock("../../components/ui/AdvancedFilters", () => ({
  useAdvancedFilters: () => ({
    value: { dateFrom: "", dateTo: "", excludeWords: [] },
    setValue: vi.fn(),
    reset: vi.fn(),
    activeCount: 0,
  }),
}));

describe("StatsPage", () => {
  it("renders the sticky sub-header with title and YouTubeSyncButton", () => {
    render(<StatsPage />);

    expect(screen.getByRole("heading", { name: "Stats" })).toBeInTheDocument();
    expect(screen.getByTestId("youtube-sync-button")).toBeInTheDocument();
    expect(screen.getByTestId("local-recording-activity")).toBeInTheDocument();
    expect(screen.getByTestId("most-played-games")).toBeInTheDocument();
  });
});
