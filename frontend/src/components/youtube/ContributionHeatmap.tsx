import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";

export interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

interface ContributionHeatmapProps {
  stats: DailyCount[];
  label?: string;
  metricSource?: "upload" | "title";
  onMetricChange?: (source: "upload" | "title") => void;
  onDateClick?: (date: string) => void;
}

const ContributionHeatmap: React.FC<ContributionHeatmapProps> = React.memo(({
  stats,
  label = "upload",
  metricSource,
  onMetricChange,
  onDateClick,
}) => {
  const calendarData = useMemo(() => {
    const acc: Record<string, number> = {};
    if (stats) {
      stats.forEach((curr) => {
        acc[curr.date] = (acc[curr.date] || 0) + curr.count;
      });
    }
    return acc;
  }, [stats]);

  const availableYears = useMemo(() => {
    if (!stats || stats.length === 0) return [new Date().getFullYear()];
    const years = new Set(stats.map((s) => parseInt(s.date.substring(0, 4))));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [stats]);

  type YearOption = number | "All";
  const [selectedYear, setSelectedYear] = useState<YearOption>("All");

  useEffect(() => {
    if (selectedYear !== "All" && !availableYears.includes(selectedYear as number)) {
      setSelectedYear("All");
    }
  }, [availableYears, selectedYear]);

  const customPanelColors = [
    "#202024", // 0 uploads (inactive)
    "#632516", // 1 upload (low activity)
    "#a1381d", // 2-3 uploads (medium activity)
    "#f45124", // 4-5 uploads (high activity)
    "#ff7e54", // 6+ uploads (intense activity)
  ];

  const getColorIndex = (value: number) => {
    if (value === 0) return 0;
    if (value === 1) return 1;
    if (value <= 3) return 2;
    if (value <= 5) return 3;
    return 4;
  };

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const today = useMemo(() => new Date(), []);

  const cellSize = 11;
  const labelPadX = 18;
  const labelPadY = 28;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Full layout always containing all years in chronological sequence
  const layout = useMemo(() => {
    const yearsToRender = [...availableYears].reverse(); // oldest -> newest

    let currentX = labelPadX;
    const generatedWeeks: { x: number; days: { date: Date | null; key: string }[] }[] = [];
    const yearLabels: { x: number; year: number }[] = [];
    const yearDividers: number[] = [];
    const monthLabels: { x: number; label: string }[] = [];

    yearsToRender.forEach((yr, yrIndex) => {
      if (yrIndex > 0) {
        currentX += 5;
        yearDividers.push(currentX);
        currentX += 10;
      }

      yearLabels.push({ x: currentX, year: yr });

      const yrStart = new Date(yr, 0, 1, 0, 0, 0, 0);
      let yrEnd = new Date(yr, 11, 31, 23, 59, 59, 999);
      if (yr === today.getFullYear()) {
        yrEnd = new Date(today);
        yrEnd.setHours(23, 59, 59, 999);
      }

      let currentDay = new Date(yrStart);
      if (currentDay.getDay() !== 0) {
        currentDay.setDate(currentDay.getDate() - currentDay.getDay());
      }

      let week: { date: Date | null; key: string }[] = [];
      let lastMonth = -1;
      let lastMonthX = -100;

      while (currentDay <= yrEnd) {
        if (currentDay < yrStart) {
          week.push({ date: null, key: `pad-start-${yr}-${currentDay.getTime()}` });
        } else {
          week.push({ date: new Date(currentDay), key: formatDate(currentDay) });
        }

        if (week.length === 7) {
          const firstValid = week.find((d) => d.date !== null && d.date.getFullYear() === yr);
          if (firstValid && firstValid.date) {
            const mo = firstValid.date.getMonth();
            if (mo !== lastMonth && currentX - lastMonthX >= 26) {
              monthLabels.push({ x: currentX + cellSize / 2, label: monthNames[mo] });
              lastMonth = mo;
              lastMonthX = currentX;
            }
          }

          generatedWeeks.push({ x: currentX, days: week });
          currentX += cellSize;
          week = [];
        }
        currentDay.setDate(currentDay.getDate() + 1);
      }

      if (week.length > 0) {
        while (week.length < 7) {
          week.push({ date: null, key: `pad-end-${yr}-${week.length}` });
        }
        generatedWeeks.push({ x: currentX, days: week });
        currentX += cellSize;
      }
    });

    return {
      weeks: generatedWeeks,
      yearLabels,
      yearDividers,
      monthLabels,
      svgWidth: currentX + 16,
      svgHeight: labelPadY + 7 * cellSize + 6,
    };
  }, [availableYears, today]);

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: string;
    visible: boolean;
    transform: string;
  }>({
    x: 0,
    y: 0,
    content: "",
    visible: false,
    transform: "translateY(-50%)",
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Initial mount auto-scroll to far right (recent activity)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    const handle = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [stats, layout.svgWidth]);

  // Smooth scroll to target year when button clicked
  const handleYearClick = (yearOption: YearOption) => {
    setSelectedYear(yearOption);
    const container = scrollContainerRef.current;
    if (!container) return;

    if (yearOption === "All") {
      container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
    } else {
      const target = layout.yearLabels.find((yl) => yl.year === yearOption);
      if (target) {
        const targetX = Math.max(0, target.x - labelPadX);
        container.scrollTo({ left: targetX, behavior: "smooth" });
      }
    }
  };

  const totalCount = useMemo(() => {
    return Object.values(calendarData).reduce((a, b) => a + b, 0);
  }, [calendarData]);

  return (
    <div className="flex flex-col w-full gap-4 relative">
      {/* Unified Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full">
        <h3 className="text-sm font-semibold text-text-primary">
          {metricSource === "upload" ? "Upload activity" : "Recording activity"}
        </h3>

        <div className="flex items-center gap-2">
          {/* Metric Switcher */}
          {onMetricChange && (
            <div className="flex items-center bg-[#141418] p-1 rounded-lg border-0">
              <button
                onClick={() => onMetricChange("title")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  metricSource === "title"
                    ? "bg-accent text-white font-semibold shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Title date
              </button>
              <button
                onClick={() => onMetricChange("upload")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  metricSource === "upload"
                    ? "bg-accent text-white font-semibold shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Upload date
              </button>
            </div>
          )}

          {/* Year Switcher with Smooth Scroll Navigation */}
          {availableYears.length > 1 && (
            <div className="flex items-center bg-[#141418] p-1 rounded-lg border-0">
              {["All", ...availableYears].map((opt) => {
                const isActive = selectedYear === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => handleYearClick(opt as YearOption)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? "bg-accent text-white font-semibold shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {opt === "All" ? "All time" : opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Heatmap Matrix Canvas */}
      <div ref={scrollContainerRef} className="flex-1 w-full overflow-x-auto custom-scrollbar pb-2 pt-1">
        <div className="min-w-max flex justify-start">
          <svg
            width={layout.svgWidth}
            height={layout.svgHeight}
            style={{ height: layout.svgHeight, display: "block" }}
          >
            {layout.yearLabels.map((yl) => {
              const isSelected = selectedYear === yl.year;
              return (
                <text
                  key={yl.year}
                  x={yl.x}
                  y={13}
                  textAnchor="start"
                  style={{
                    fill: isSelected ? "#ffb020" : "#a0a0aa",
                    fontWeight: isSelected ? 900 : 700,
                    fontSize: 13,
                    transition: "fill 0.2s ease",
                  }}
                >
                  {yl.year}
                </text>
              );
            })}

            {layout.yearDividers.map((dx) => (
              <line
                key={dx}
                x1={dx}
                y1={4}
                x2={dx}
                y2={layout.svgHeight - 2}
                stroke="#383840"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            ))}

            {layout.monthLabels.map((m, i) => (
              <text
                key={m.label + i}
                x={m.x}
                y={labelPadY - 6}
                textAnchor="middle"
                style={{ fontSize: 9, fontWeight: 600, fill: "#7e7e88", alignmentBaseline: "central" }}
              >
                {m.label}
              </text>
            ))}

            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <text
                key={d + i}
                x={labelPadX - 6}
                y={labelPadY + i * cellSize + cellSize / 2}
                textAnchor="middle"
                style={{ fontSize: 8, fontWeight: 600, fill: "#5f5f68", alignmentBaseline: "central" }}
              >
                {i % 2 === 1 ? d : ""}
              </text>
            ))}

            {layout.weeks.map((week) =>
              week.days.map((d, di) => {
                if (!d.date || d.date > today) return null;
                const x = week.x;
                const y = labelPadY + di * cellSize;
                const uploads = calendarData[d.key] ?? 0;

                const monthName = monthNames[d.date.getMonth()];
                const dayNum = d.date.getDate();
                const yearNum = d.date.getFullYear();
                const dateStr = `${monthName} ${dayNum}, ${yearNum}`;

                const tooltipContent = uploads > 0
                  ? `${uploads} ${label}${uploads === 1 ? "" : "s"} on ${dateStr}`
                  : `No ${label}s on ${dateStr}`;

                const idx = getColorIndex(uploads);
                const color = customPanelColors[idx];

                return (
                  <rect
                    key={d.key}
                    x={x}
                    y={y}
                    width={9}
                    height={9}
                    fill={color}
                    rx={2}
                    ry={2}
                    className={`transition-colors duration-150 hover:stroke-white hover:stroke-[1.5px]${uploads > 0 ? " cursor-pointer" : ""}`}
                    onClick={() => { if (uploads > 0 && onDateClick) onDateClick(d.key); }}
                    onMouseEnter={(e) => {
                      const rect = (e.target as SVGRectElement).getBoundingClientRect();
                      const approxWidth = Math.max(tooltipContent.length * 7.5, 90);
                      const padding = 8;
                      let tooltipX = rect.right + padding;
                      let transform = "translateY(-50%)";

                      if (rect.right + approxWidth + padding > window.innerWidth) {
                        tooltipX = rect.left - padding;
                        transform = "translate(-100%, -50%)";
                      }

                      setTooltip({
                        x: tooltipX,
                        y: rect.top + rect.height / 2,
                        content: tooltipContent,
                        visible: true,
                        transform: transform,
                      });
                    }}
                    onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                  />
                );
              })
            )}
          </svg>
        </div>
      </div>

      {/* Footer Legend */}
      <div className="flex flex-wrap items-center justify-between w-full pt-3 border-t border-border-subtle/30 px-1 text-xs text-text-muted">
        <div>
          Total: <strong className="text-text-primary font-semibold">{totalCount}</strong> {label}s recorded
        </div>
        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="flex items-center gap-1">
            {customPanelColors.map((col, idx) => (
              <div
                key={idx}
                className="w-3 h-3 rounded-sm border-0"
                style={{ backgroundColor: col }}
                title={
                  idx === 0
                    ? `0 ${label}s`
                    : idx === 1
                    ? `1 ${label}`
                    : idx === 2
                    ? `2-3 ${label}s`
                    : idx === 3
                    ? `4-5 ${label}s`
                    : `6+ ${label}s`
                }
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>

      {tooltip.visible &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y, transform: tooltip.transform }}
          >
            <div className="px-2.5 py-1 rounded-md bg-[#1c1c20]/95 text-text-primary text-xs font-medium shadow-xl border border-border-subtle/40 backdrop-blur-sm whitespace-nowrap">
              {tooltip.content}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

export default ContributionHeatmap;
