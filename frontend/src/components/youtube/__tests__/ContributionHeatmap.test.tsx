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

    expect(screen.getByText("Thu, Jan 1, 2026")).toBeInTheDocument();
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

  it("renders contextual summary pills including monthly active days scoped to selected year", () => {
    Element.prototype.scrollTo = vi.fn();

    const stats: DailyCount[] = [
      { date: "2025-05-01", count: 2 },
      { date: "2025-05-02", count: 6 },
      { date: "2025-05-03", count: 1 },
      { date: "2026-01-01", count: 3 },
      { date: "2026-01-02", count: 1 },
    ];

    render(
      <ContributionHeatmap
        stats={stats}
        label="recording"
        selectedDate="2025-05-02"
      />,
    );

    // Default "All" view: 13 recordings in 5 active days, May 2025: 3/31 active days (10%), longest streak 3d
    expect(screen.getByText(/recordings in/i)).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("May 2025:")).toBeInTheDocument();
    expect(screen.getByText(/\/31 active days/i)).toBeInTheDocument();
    expect(screen.getByText("3d")).toBeInTheDocument();
    expect(screen.queryByText(/Peak:/i)).toBeNull();

    // Switch to 2026 year filter
    const year2026Btn = screen.getByRole("button", { name: "2026" });
    fireEvent.click(year2026Btn);

    // Scoped to 2026: 4 recordings in 2 active days, longest streak 2d
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2d")).toBeInTheDocument();
  });
});


