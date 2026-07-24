import React, { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";

export interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

interface ContributionHeatmapProps {
  stats: DailyCount[];
  label?: string;
}

const ContributionHeatmap: React.FC<ContributionHeatmapProps> = React.memo(({ stats, label = "upload" }) => {
  // Convert stats to a map of "YYYY-MM-DD" -> count
  const calendarData = useMemo(() => {
    const acc: Record<string, number> = {};
    if (stats) {
      stats.forEach((curr) => {
        // curr.date is already YYYY-MM-DD from the backend
        acc[curr.date] = (acc[curr.date] || 0) + curr.count;
      });
    }
    return acc;
  }, [stats]);

  // Custom colors: 0 = gray, 1 = dark orange, 2 = orange, 3 = bright brand orange
  const customPanelColors = [
    "#2E2E31", // 0 games (inactive)
    "#5E291C", // 1 upload (low activity)
    "#A1381D", // 2-3 uploads (medium activity)
    "#FA4726", // 4+ uploads (high activity)
  ];

  const getColorIndex = (value: number) => {
    if (value === 1) return 1;
    if (value === 2 || value === 3) return 2;
    if (value >= 4) return 3;
    return 0;
  };

  let endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  
  let startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 1);
  startDate.setHours(0, 0, 0, 0);

  if (stats && stats.length > 0) {
    const dates = stats.map(s => new Date(s.date).getTime()).filter(t => !isNaN(t));
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      
      endDate = new Date(Math.max(endDate.getTime(), maxDate.getTime()));
      endDate.setHours(23, 59, 59, 999);

      if (minDate < startDate) {
        startDate = new Date(minDate);
        startDate.setHours(0, 0, 0, 0);
      }
    }
  }

  // Adjust start date to the beginning of the week (Sunday = 0)
  if (startDate.getDay() !== 0) {
    startDate.setDate(startDate.getDate() - startDate.getDay());
  }

  const days: { date: Date; key: string }[] = [];
  let currentDay = new Date(startDate);
  
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  while (currentDay <= endDate) {
    days.push({ date: new Date(currentDay), key: formatDate(currentDay) });
    currentDay.setDate(currentDay.getDate() + 1);
  }

  const weeks: { date: Date | null; key: string }[][] = [];
  let week: { date: Date | null; key: string }[] = [];
  
  days.forEach((d) => {
    const dayOfWeek = d.date.getDay();
    if (week.length === 0 && dayOfWeek !== 0) {
      for (let i = 0; i < dayOfWeek; i++) {
        week.push({ date: null, key: `empty-${weeks.length}-${i}` });
      }
    }
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  });
  
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ date: null, key: `empty-last-${week.length}` });
    }
    weeks.push(week);
  }

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

  const cellSize = 11;
  const labelPadX = 12;
  const labelPadY = 12;
  const svgWidth = labelPadX + weeks.length * cellSize;
  const svgHeight = labelPadY + 7 * cellSize;

  const monthLabels: { x: number; label: string }[] = [];
  let lastMonth = -1;
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  weeks.forEach((week, wi) => {
    const firstValidDay = week.find((d) => d.date !== null);
    if (firstValidDay && firstValidDay.date) {
      const month = firstValidDay.date.getMonth();
      if (month !== lastMonth) {
        let lbl = monthNames[month];
        if (month === 0 && firstValidDay.date.getFullYear() !== endDate.getFullYear()) {
          lbl = String(firstValidDay.date.getFullYear());
        }
        monthLabels.push({
          x: labelPadX + wi * cellSize + cellSize / 2,
          label: lbl,
        });
        lastMonth = month;
      }
    }
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return (
    <div className="flex w-full relative justify-center items-center overflow-x-auto custom-scrollbar py-2">
      <div>
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          style={{ height: svgHeight, display: "block", margin: "0 auto" }}
        >
          {monthLabels.map((m, i) => (
            <text
              key={m.label + i}
              x={m.x}
              y={labelPadY - 5}
              textAnchor="middle"
              style={{ fontSize: 8, fill: "#888888", alignmentBaseline: "central" }}
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
              style={{ fontSize: 7, fill: "#888888", alignmentBaseline: "central" }}
            >
              {d}
            </text>
          ))}
          {weeks.map((week, wi) =>
            week.map((d, di) => {
              if (!d.date || d.date > endDate) return null;
              const x = labelPadX + wi * cellSize;
              const y = labelPadY + di * cellSize;
              const uploads = calendarData[d.key] ?? 0;
              
              const monthName = monthNames[d.date.getMonth()];
              const dayNum = d.date.getDate();
              const dateStr = `${monthName} ${dayNum}`;
              
              const tooltipContent = uploads > 0 
                ? `${uploads} ${label}${uploads === 1 ? "" : "s"} on ${dateStr}`
                : `No ${label}s on ${dateStr}`;
                
              const isRecent = d.date > thirtyDaysAgo;
              const idx = getColorIndex(uploads);
              const color = (idx === 0 && isRecent) ? "#3a3a3e" : customPanelColors[idx];

              return (
                <rect
                  key={d.key}
                  x={x}
                  y={y}
                  width={9}
                  height={9}
                  fill={color}
                  rx={2.5}
                  ry={2.5}
                  className="transition-colors hover:stroke-accent/50 hover:stroke-[1.5px]"
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGRectElement).getBoundingClientRect();
                    const approxWidth = Math.max(tooltipContent.length * 7.5, 80);
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
        {tooltip.visible &&
          createPortal(
            <div
              className="fixed z-[9999] pointer-events-none"
              style={{ left: tooltip.x, top: tooltip.y, transform: tooltip.transform }}
            >
              <div className="px-2 py-1 rounded-md bg-elevated/90 text-text-primary text-xs font-semibold shadow-md whitespace-nowrap border border-border-subtle backdrop-blur-sm">
                {tooltip.content}
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
});

export default ContributionHeatmap;
