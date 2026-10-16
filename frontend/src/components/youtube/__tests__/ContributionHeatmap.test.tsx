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

  it("handles interactive intensity bucket filtering and clears selection", () => {
    const stats: DailyCount[] = [
      { date: "2026-01-01", count: 1 }, // Bucket 1
      { date: "2026-01-02", count: 3 }, // Bucket 2 (2-3)
      { date: "2026-01-03", count: 4 }, // Bucket 3 (4-5)
      { date: "2026-01-04", count: 6 }, // Bucket 4 (6+)
    ];

    const { container } = render(
      <ContributionHeatmap stats={stats} label="recording" />,
    );

    const bucket1Btn = screen.getByRole("button", {
      name: "Filter by 1 recording",
    });
    expect(bucket1Btn).toHaveAttribute("aria-pressed", "false");

    // Click bucket 1 to filter
    fireEvent.click(bucket1Btn);

    expect(bucket1Btn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 day")).toBeInTheDocument();
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    expect(clearBtn).toBeInTheDocument();

    // Verify cell opacity modulation: bucket 1 cells should have opacity 1, non-bucket 1 cells should be dimmed (0.15)
    const rects = Array.from(container.querySelectorAll("rect"));
    const bucket1Rect = rects.find((r) => r.getAttribute("fill") === "#632516");
    const otherRect = rects.find((r) => r.getAttribute("fill") === "#a1381d");

    expect(bucket1Rect?.getAttribute("fill-opacity")).toBe("1");
    expect(otherRect?.getAttribute("fill-opacity")).toBe("0.15");

    // Click clear button
    fireEvent.click(clearBtn);

    expect(bucket1Btn).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Clear")).toBeNull();
    expect(bucket1Rect?.getAttribute("fill-opacity")).toBe("1");
    expect(otherRect?.getAttribute("fill-opacity")).toBe("1");

    // Click swatch again to toggle on then off
    fireEvent.click(bucket1Btn);
    expect(bucket1Btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(bucket1Btn);
    expect(bucket1Btn).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ContributionHeatmap dominant game color mode", () => {
  it("does not render color mode toggle when stats have no games metadata", () => {
    const stats: DailyCount[] = [
      { date: "2026-01-01", count: 2 },
      { date: "2026-01-02", count: 1 },
    ];

    render(<ContributionHeatmap stats={stats} />);
    expect(screen.queryByRole("button", { name: "Intensity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Game" })).toBeNull();
  });

  it("renders color mode toggle when games exist, defaulting to intensity and toggling to game mode", () => {
    const stats: DailyCount[] = [
      {
        date: "2026-01-01",
        count: 1, // idx 1 -> opacity 0.45
        games: [{ game: "Hades II", count: 1, hours: 1.0 }],
      },
      {
        date: "2026-01-02",
        count: 6, // idx 4 -> opacity 1.0
        games: [{ game: "Elden Ring", count: 6, hours: 5.0 }],
      },
    ];

    const { container } = render(<ContributionHeatmap stats={stats} />);

    const intensityBtn = screen.getByRole("button", { name: "Intensity" });
    const gameBtn = screen.getByRole("button", { name: "Game" });
    expect(intensityBtn).toBeInTheDocument();
    expect(gameBtn).toBeInTheDocument();

    // Default mode is intensity: Less / More legend is present
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();

    // Switch to game mode
    fireEvent.click(gameBtn);

    // Legend switches from Less/More to top games
    expect(screen.queryByText("Less")).toBeNull();
    expect(screen.queryByText("More")).toBeNull();
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    expect(screen.getByText("Hades II")).toBeInTheDocument();

    // Check SVG cell colors and fillOpacity in game mode
    const rects = Array.from(container.querySelectorAll("rect"));
    const hadesColor = "hsl(100, 56%, 50%)"; // will match getGameColor("Hades II")
    const eldenColor = "hsl(215, 66%, 53%)"; // will match getGameColor("Elden Ring")

    // Find rects by fill attribute (or dominant game fill)
    const activeRects = rects.filter(
      (r) => r.getAttribute("fill") !== "#202024",
    );
    expect(activeRects.length).toBe(2);

    // In game mode:
    // Hades II has 1 session -> idx 1 -> fillOpacity should be "0.45"
    // Elden Ring has 6 sessions -> idx 4 -> fillOpacity should be "1"
    const hadesRect = activeRects.find((r) =>
      r.getAttribute("fillOpacity") === "0.45" || r.getAttribute("fill-opacity") === "0.45",
    );
    const eldenRect = activeRects.find((r) =>
      r.getAttribute("fillOpacity") === "1" || r.getAttribute("fill-opacity") === "1",
    );
    expect(hadesRect).toBeDefined();
    expect(eldenRect).toBeDefined();
  });

  it("resets bucket filter when switching between intensity and game mode", () => {
    const stats: DailyCount[] = [
      {
        date: "2026-01-01",
        count: 1,
        games: [{ game: "Celeste", count: 1, hours: 0.5 }],
      },
    ];

    render(<ContributionHeatmap stats={stats} />);

    // Activate bucket filter in intensity mode
    const bucket1Btn = screen.getByRole("button", {
      name: "Filter by 1 upload",
    });
    fireEvent.click(bucket1Btn);
    expect(screen.getByText("1 day")).toBeInTheDocument();

    // Switch to game mode
    const gameBtn = screen.getByRole("button", { name: "Game" });
    fireEvent.click(gameBtn);

    // Bucket filter indicator should be gone
    expect(screen.queryByText("1 day")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});

describe("ContributionHeatmap grid navigation (Issue 97)", () => {
  it("renders Today cell with gold stroke and appends (Today) in tooltip header", () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayKey = `${y}-${m}-${d}`;

    const stats: DailyCount[] = [
      {
        date: todayKey,
        count: 2,
        totalHours: 1.0,
      },
    ];

    const { container } = render(
      <ContributionHeatmap stats={stats} label="recording" />,
    );

    const rects = Array.from(container.querySelectorAll("rect"));
    const todayRect = rects.find(
      (r) => r.getAttribute("stroke") === "#ffb020",
    );
    expect(todayRect).toBeDefined();
    expect(todayRect?.getAttribute("stroke-width")).toBe("1.25");

    if (todayRect) {
      fireEvent.mouseEnter(todayRect);
      expect(screen.getByText(/\(Today\)/i)).toBeInTheDocument();
    }
  });

  it("renders stepped month divider paths within the SVG", () => {
    const stats: DailyCount[] = [
      { date: "2025-01-15", count: 1 },
      { date: "2025-03-10", count: 2 },
    ];

    const { container } = render(
      <ContributionHeatmap stats={stats} label="recording" />,
    );

    const dividerPaths = container.querySelectorAll(
      'path[data-testid="month-divider"]',
    );
    expect(dividerPaths.length).toBeGreaterThan(0);
    const firstPath = dividerPaths[0];
    expect(firstPath.getAttribute("stroke")).toBe("#2e2e36");
    expect(firstPath.getAttribute("stroke-width")).toBe("1");
    expect(firstPath.getAttribute("fill")).toBe("none");
  });

  it("dims non-selected years when a specific year is selected", () => {
    Element.prototype.scrollTo = vi.fn();
    const stats: DailyCount[] = [
      { date: "2024-05-01", count: 2 },
      { date: "2025-06-01", count: 3 },
    ];

    const { container } = render(<ContributionHeatmap stats={stats} />);

    // Initially in "All" view - no year group should be dimmed
    const yearGroups = container.querySelectorAll("g[data-year]");
    expect(yearGroups.length).toBeGreaterThanOrEqual(2);
    yearGroups.forEach((g) => {
      expect(g.getAttribute("opacity")).toBe("1");
    });

    // Select 2024
    const btn2024 = screen.getByRole("button", { name: "2024" });
    fireEvent.click(btn2024);

    const g2024 = container.querySelector('g[data-year="2024"]');
    const g2025 = container.querySelector('g[data-year="2025"]');

    expect(g2024?.getAttribute("opacity")).toBe("1");
    expect(g2025?.getAttribute("opacity")).toBe("0.3");
  });

  it("toggles single-year isolation with expanded cellSize when Focus year is clicked", () => {
    Element.prototype.scrollTo = vi.fn();
    const stats: DailyCount[] = [
      { date: "2024-05-01", count: 2 },
      { date: "2025-06-01", count: 3 },
    ];

    const { container } = render(<ContributionHeatmap stats={stats} />);

    // Initially, "Focus year" button is not visible in "All" mode
    expect(screen.queryByRole("button", { name: "Focus year" })).toBeNull();

    // Select 2024
    const btn2024 = screen.getByRole("button", { name: "2024" });
    fireEvent.click(btn2024);

    const focusBtn = screen.getByRole("button", { name: "Focus year" });
    expect(focusBtn).toBeInTheDocument();

    // Default rect width should be 9
    const rectBefore = container.querySelector('g[data-year="2024"] rect');
    expect(rectBefore?.getAttribute("width")).toBe("9");

    // Click "Focus year"
    fireEvent.click(focusBtn);

    // Button label toggles to "Show all years"
    expect(screen.getByRole("button", { name: "Show all years" })).toBeInTheDocument();

    // In isolated mode, cellSize is 13, rect width is 11
    const rectAfter = container.querySelector('g[data-year="2024"] rect');
    expect(rectAfter?.getAttribute("width")).toBe("11");

    // In isolated mode, divider lines are omitted in favor of the physical whitespace gap
    const divider = container.querySelector('g[data-year="2024"] path[data-testid="month-divider"]');
    expect(divider).toBeNull();

    // In isolated mode, months have a physical gap (Jan last week to Feb first week is cellSize + monthGap = 21)
    const allRects2024 = Array.from(container.querySelectorAll('g[data-year="2024"] rect'));
    const uniqueXs = Array.from(new Set(allRects2024.map((r) => Number(r.getAttribute("x"))))).sort((a, b) => a - b);
    // Find gaps between consecutive week columns:
    const gaps = uniqueXs.slice(1).map((x, i) => x - uniqueXs[i]);
    // The regular column step is 13, and month transitions have 13 + 8 = 21
    expect(gaps).toContain(21);

    // 2025 group should not be rendered in isolated layout
    expect(container.querySelector('g[data-year="2025"]')).toBeNull();
  });
});
