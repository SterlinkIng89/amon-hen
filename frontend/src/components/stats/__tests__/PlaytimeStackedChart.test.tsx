import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
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
});
