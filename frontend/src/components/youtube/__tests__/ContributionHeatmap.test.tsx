import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ContributionHeatmap, { DailyCount } from "../ContributionHeatmap";

describe("ContributionHeatmap enriched tooltip", () => {
  it("renders enriched tooltip with games, total duration, and source breakdown on hover", () => {
    const stats: DailyCount[] = [
      {
        date: "2026-01-01",
        count: 3,
        totalHours: 4.5,
        localCount: 2,
        youtubeCount: 1,
        games: [
          { game: "Elden Ring", count: 2, hours: 3.0 },
          { game: "Hades II", count: 1, hours: 1.5 },
        ],
      },
    ];

    const { container } = render(
      <ContributionHeatmap stats={stats} label="recording" />,
    );

    const activeRects = container.querySelectorAll('rect[fill="#a1381d"]');
    expect(activeRects.length).toBe(1);

    fireEvent.mouseEnter(activeRects[0]);

    expect(screen.getByText(/Jan 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText("3 recordings")).toBeInTheDocument();
    expect(screen.getByText("4h 30m")).toBeInTheDocument();
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    expect(screen.getByText("2x · 3h 00m")).toBeInTheDocument();
    expect(screen.getByText("Hades II")).toBeInTheDocument();
    expect(screen.getByText("1x · 1h 30m")).toBeInTheDocument();
    expect(screen.getByText("2 Local")).toBeInTheDocument();
    expect(screen.getByText("1 YouTube")).toBeInTheDocument();
  });

  it("applies highlight stroke to selected date cell and triggers onDateClick", () => {
    const onDateClick = vi.fn();
    const stats: DailyCount[] = [
      {
        date: "2026-01-01",
        count: 2,
        totalHours: 1.5,
        games: [{ game: "Elden Ring", count: 2, hours: 1.5 }],
      },
      {
        date: "2026-01-02",
        count: 1,
        totalHours: 0.5,
        games: [{ game: "Hades II", count: 1, hours: 0.5 }],
      },
    ];

    const { container } = render(
      <ContributionHeatmap
        stats={stats}
        selectedDate="2026-01-01"
        onDateClick={onDateClick}
      />,
    );

    const rects = container.querySelectorAll("rect");
    const selectedRect = Array.from(rects).find(
      (r) => r.getAttribute("stroke") === "#f97316",
    );
    expect(selectedRect).toBeDefined();
    expect(selectedRect?.getAttribute("stroke-width")).toBe("1.5");

    if (selectedRect) {
      fireEvent.click(selectedRect);
      expect(onDateClick).toHaveBeenCalledWith("2026-01-01");
    }
  });
});

