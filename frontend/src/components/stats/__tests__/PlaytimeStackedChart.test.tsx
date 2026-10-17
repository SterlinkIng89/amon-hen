import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlaytimeStackedChart } from "../PlaytimeStackedChart";
import { DayGameBreakdown, MonthGameBreakdown } from "../../../utils/gameStats";

describe("PlaytimeStackedChart Component", () => {
  const mockDailyData: readonly DayGameBreakdown[] = [
    {
      date: "2026-10-01",
      dayNum: 1,
      totalHours: 3.5,
      byGame: { "Hades II": 2.0, "Silksong": 1.5 },
    },
    {
      date: "2026-10-02",
      dayNum: 2,
      totalHours: 0,
      byGame: {},
    },
    {
      date: "2026-10-03",
      dayNum: 3,
      totalHours: 1.5,
      byGame: { "Hades II": 1.5 },
    },
    {
      date: "2026-10-04",
      dayNum: 4,
      totalHours: 0,
      byGame: {},
    },
    {
      date: "2026-10-05",
      dayNum: 5,
      totalHours: 0,
      byGame: {},
    },
  ];

  const mockMonthlyData: readonly MonthGameBreakdown[] = [
    {
      monthKey: "2026-01",
      monthLabel: "Jan",
      monthIndex: 0,
      totalHours: 25,
      byGame: { "Hades II": 25 },
    },
    {
      monthKey: "2026-02",
      monthLabel: "Feb",
      monthIndex: 1,
      totalHours: 0,
      byGame: {},
    },
  ];

  it("renders 0-hour baseline stubs for empty days", () => {
    render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
      />
    );

    expect(screen.getByTestId("empty-bar-stub-2026-10-02")).toBeDefined();
    expect(screen.getByTestId("empty-bar-stub-2026-10-04")).toBeDefined();
    expect(screen.queryByTestId("empty-bar-stub-2026-10-01")).toBeNull();
  });

  it("renders multi-game stacked bar container with segment separation gap", () => {
    const { container } = render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
      />
    );

    const stackedBars = container.querySelectorAll(".gap-\\[1\\.5px\\]");
    expect(stackedBars.length).toBeGreaterThan(0);
  });

  it("renders active average reference line when 2 or more active days exist", () => {
    render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
      />
    );

    // Active days are day 1 (3.5h) and day 3 (1.5h). Mean is 2.5h -> "2h 30m"
    expect(screen.getByText("Avg 2h 30m")).toBeDefined();
  });

  it("does not render average reference line when fewer than 2 active days exist", () => {
    const singleActiveDay: readonly DayGameBreakdown[] = [
      {
        date: "2026-10-01",
        dayNum: 1,
        totalHours: 3.5,
        byGame: { "Hades II": 3.5 },
      },
      {
        date: "2026-10-02",
        dayNum: 2,
        totalHours: 0,
        byGame: {},
      },
    ];

    render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={singleActiveDay}
        monthlyData={[]}
        topGames={["Hades II"]}
        selectedKey="2026-10-01"
      />
    );

    expect(screen.queryByText(/Avg /)).toBeNull();
  });

  it("renders refined Y-axis without border-r and with secondary text contrast", () => {
    const { container } = render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
      />
    );

    // Y-axis container must use pr-1.5 and not border-r
    const yAxisContainer = container.querySelector(".pr-1\\.5");
    expect(yAxisContainer).not.toBeNull();
    expect(yAxisContainer?.className).not.toContain("border-r");
  });

  it("highlights milestone day labels with font-medium and secondary text", () => {
    render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
      />
    );

    // Day 1, 5, and last day (5) are milestone days
    const day1Label = screen.getByText("1");
    expect(day1Label.className).toContain("text-text-secondary font-medium");

    const day5Label = screen.getByText("5");
    expect(day5Label.className).toContain("text-text-secondary font-medium");
  });

  it("renders interactive legend chips with hours and share percentage", () => {
    render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
      />
    );

    // Total view hours = 3.5 (Day 1) + 1.5 (Day 3) = 5.0h
    // Hades II = 2.0 + 1.5 = 3.5h (70%)
    // Silksong = 1.5h (30%)
    expect(screen.getByText("Hades II")).toBeDefined();
    expect(screen.getByText("3h 30m (70%)")).toBeDefined();
    expect(screen.getByText("Silksong")).toBeDefined();
    expect(screen.getByText("1h 30m (30%)")).toBeDefined();
  });

  it("calls onSelectGame when clicking legend chips and toggles selection", () => {
    const handleSelectGame = vi.fn();
    const { rerender } = render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
        selectedGame={null}
        onSelectGame={handleSelectGame}
      />
    );

    const hadesChip = screen.getByRole("button", { name: /Hades II/ });
    fireEvent.click(hadesChip);
    expect(handleSelectGame).toHaveBeenCalledWith("Hades II");

    // When rerendered with selectedGame="Hades II", clicking it again toggles it off (null)
    rerender(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
        selectedGame="Hades II"
        onSelectGame={handleSelectGame}
      />
    );

    fireEvent.click(hadesChip);
    expect(handleSelectGame).toHaveBeenCalledWith(null);
  });

  it("renders Reset button when a game is selected and clears selection on click", () => {
    const handleSelectGame = vi.fn();
    render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
        selectedGame="Hades II"
        onSelectGame={handleSelectGame}
      />
    );

    const resetButton = screen.getByRole("button", { name: "Reset" });
    expect(resetButton).toBeDefined();

    fireEvent.click(resetButton);
    expect(handleSelectGame).toHaveBeenCalledWith(null);
  });

  it("dims non-matching bar segments to opacity-20 when a game is selected", () => {
    const { container } = render(
      <PlaytimeStackedChart
        viewMode="month"
        dailyData={mockDailyData}
        monthlyData={[]}
        topGames={["Hades II", "Silksong"]}
        selectedKey="2026-10-01"
        selectedGame="Hades II"
      />
    );

    // On Day 1 (Hades II + Silksong):
    // Hades II segment has opacity-100, Silksong segment has opacity-20
    const opacity20Segments = container.querySelectorAll(".opacity-20");
    const opacity100Segments = container.querySelectorAll(".opacity-100");

    expect(opacity20Segments.length).toBeGreaterThan(0);
    expect(opacity100Segments.length).toBeGreaterThan(0);
  });
});
