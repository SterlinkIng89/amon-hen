import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  EnrichedDailyCount,
  DailyGameSummary,
  normalizeGameKey,
  computeHeatmapPeriodSummary,
} from "../../utils/gameStats";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";
import { getGameColor } from "../../utils/tagColors";

export type DailyCount = EnrichedDailyCount;
export type { DailyGameSummary };

const SUMMARY_PILL_CLASS =
  "px-2.5 py-1 rounded-md bg-[#141418] border border-border-subtle text-xs text-text-muted tabular-nums";

interface ContributionHeatmapProps {
  stats: readonly DailyCount[];
  label?: string;
  metricSource?: "upload" | "title";
  onMetricChange?: (source: "upload" | "title") => void;
  onDateClick?: (date: string) => void;
  selectedDate?: string | null;
  title?: React.ReactNode | false;
  extraControls?: React.ReactNode;
  selectedYear?: string;
  onYearChange?: (year: string) => void;
}

const ContributionHeatmap: React.FC<ContributionHeatmapProps> = React.memo(
  ({
    stats,
    label = "upload",
    metricSource,
    onMetricChange,
    onDateClick,
    selectedDate,
    title,
    extraControls,
    selectedYear: externalSelectedYear,
    onYearChange: externalOnYearChange,
  }) => {
    const calendarData = useMemo(() => {
      const acc: Record<string, EnrichedDailyCount> = {};
      if (stats) {
        stats.forEach((curr) => {
          const existing = acc[curr.date];
          if (!existing) {
            acc[curr.date] = {
              date: curr.date,
              count: curr.count,
              totalHours: curr.totalHours ?? 0,
              localCount: curr.localCount ?? 0,
              youtubeCount: curr.youtubeCount ?? 0,
              games: curr.games ? [...curr.games] : [],
            };
            return;
          }

          const mergedGamesMap: Record<
            string,
            { game: string; count: number; hours: number }
          > = {};
          for (const g of existing.games ?? []) {
            const k = normalizeGameKey(g.game);
            if (!k) continue;
            mergedGamesMap[k] = {
              game: g.game,
              count: g.count,
              hours: g.hours,
            };
          }
          for (const g of curr.games ?? []) {
            const k = normalizeGameKey(g.game);
            if (!k) continue;
            if (!mergedGamesMap[k]) {
              mergedGamesMap[k] = {
                game: g.game,
                count: g.count,
                hours: g.hours,
              };
            } else {
              mergedGamesMap[k].count += g.count;
              mergedGamesMap[k].hours += g.hours;
            }
          }

          const mergedGames = Object.values(mergedGamesMap).sort(
            (a, b) =>
              b.count - a.count ||
              b.hours - a.hours ||
              a.game.localeCompare(b.game),
          );

          acc[curr.date] = {
            date: curr.date,
            count: existing.count + curr.count,
            totalHours: (existing.totalHours ?? 0) + (curr.totalHours ?? 0),
            localCount: (existing.localCount ?? 0) + (curr.localCount ?? 0),
            youtubeCount:
              (existing.youtubeCount ?? 0) + (curr.youtubeCount ?? 0),
            games: mergedGames,
          };
        });
      }
      return acc;
    }, [stats]);

    const availableYears = useMemo(() => {
      if (!stats || stats.length === 0)
        return [new Date().getFullYear().toString()];
      const years = new Set(stats.map((s) => s.date.substring(0, 4)));
      years.add(new Date().getFullYear().toString());
      return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [stats]);

    const [internalSelectedYear, setInternalSelectedYear] =
      useState<string>("All");

    const currentSelectedYear =
      externalSelectedYear !== undefined
        ? externalSelectedYear
        : internalSelectedYear;

    const handleYearChange = (year: string) => {
      if (externalOnYearChange) {
        externalOnYearChange(year);
      } else {
        setInternalSelectedYear(year);
      }
    };

    useEffect(() => {
      if (
        currentSelectedYear !== "All" &&
        !availableYears.includes(currentSelectedYear)
      ) {
        handleYearChange("All");
      }
    }, [availableYears, currentSelectedYear]);

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
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Full layout always containing all years in chronological sequence
    const layout = useMemo(() => {
      const yearsToRender = [...availableYears].reverse(); // oldest -> newest

      let currentX = labelPadX;
      const generatedWeeks: {
        x: number;
        days: { date: Date | null; key: string }[];
      }[] = [];
      const yearLabels: { x: number; year: number }[] = [];
      const yearDividers: number[] = [];
      const monthLabels: { x: number; label: string }[] = [];

      yearsToRender.forEach((yrStr, yrIndex) => {
        const yr = parseInt(yrStr, 10);
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
            week.push({
              date: null,
              key: `pad-start-${yr}-${currentDay.getTime()}`,
            });
          } else {
            week.push({
              date: new Date(currentDay),
              key: formatDate(currentDay),
            });
          }

          if (week.length === 7) {
            const firstValid = week.find(
              (d) => d.date !== null && d.date.getFullYear() === yr,
            );
            if (firstValid && firstValid.date) {
              const mo = firstValid.date.getMonth();
              if (mo !== lastMonth && currentX - lastMonthX >= 26) {
                monthLabels.push({
                  x: currentX + cellSize / 2,
                  label: monthNames[mo],
                });
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
      dateLabel: string;
      entry: EnrichedDailyCount | null;
      visible: boolean;
      transform: string;
    }>({
      x: 0,
      y: 0,
      dateLabel: "",
      entry: null,
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
          scrollContainerRef.current.scrollLeft =
            scrollContainerRef.current.scrollWidth;
        }
      });
      return () => cancelAnimationFrame(handle);
    }, [stats, layout.svgWidth]);

    // Smooth scroll to target year when button clicked
    const handleYearClick = (yearOption: string) => {
      handleYearChange(yearOption);
      const container = scrollContainerRef.current;
      if (!container) return;

      if (yearOption === "All") {
        container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
      } else {
        const target = layout.yearLabels.find(
          (yl) => yl.year === parseInt(yearOption, 10),
        );
        if (target) {
          const targetX = Math.max(0, target.x - labelPadX);
          container.scrollTo({ left: targetX, behavior: "smooth" });
        }
      }
    };

    const periodSummary = useMemo(
      () =>
        computeHeatmapPeriodSummary(
          calendarData,
          currentSelectedYear,
          availableYears,
          today,
          selectedDate,
        ),
      [calendarData, currentSelectedYear, availableYears, today, selectedDate],
    );

    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div className="flex flex-col w-full gap-4 relative">
        {/* Unified Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          {title !== false && (
            <h3 className="text-sm font-semibold text-text-primary">
              {title ||
                (metricSource === "upload"
                  ? "Upload activity"
                  : "Recording activity")}
            </h3>
          )}

          <div className="flex items-center gap-2">
            {extraControls}

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
                  const isActive = currentSelectedYear === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => handleYearClick(opt)}
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
        <div
          ref={scrollContainerRef}
          className="flex-1 w-full overflow-x-auto custom-scrollbar pb-2 pt-1"
        >
          <div className="min-w-max flex justify-start">
            <svg
              width={layout.svgWidth}
              height={layout.svgHeight}
              style={{ height: layout.svgHeight, display: "block" }}
            >
              {layout.yearLabels.map((yl) => {
                const isSelected = currentSelectedYear === yl.year.toString();
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
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    fill: "#7e7e88",
                    alignmentBaseline: "central",
                  }}
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
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    fill: "#5f5f68",
                    alignmentBaseline: "central",
                  }}
                >
                  {i % 2 === 1 ? d : ""}
                </text>
              ))}

              {layout.weeks.map((week) =>
                week.days.map((d, di) => {
                  if (!d.date || d.date > today) return null;
                  const x = week.x;
                  const y = labelPadY + di * cellSize;
                  const dayEntry = calendarData[d.key] ?? null;
                  const uploads = dayEntry?.count ?? 0;

                  const weekdayName = weekdayNames[d.date.getDay()];
                  const monthName = monthNames[d.date.getMonth()];
                  const dayNum = d.date.getDate();
                  const yearNum = d.date.getFullYear();
                  const dateStr = `${weekdayName}, ${monthName} ${dayNum}, ${yearNum}`;

                  const idx = getColorIndex(uploads);
                  const color = customPanelColors[idx];
                  const isSelected = selectedDate === d.key;

                  return (
                    <rect
                      key={d.key}
                      x={x}
                      y={y}
                      width={9}
                      height={9}
                      fill={color}
                      stroke={isSelected ? "#f97316" : undefined}
                      strokeWidth={isSelected ? 1.5 : undefined}
                      rx={2}
                      ry={2}
                      className={`transition-colors duration-150 hover:stroke-accent hover:stroke-[1.5px]${uploads > 0 ? " cursor-pointer" : ""}`}
                      onClick={() => {
                        if (uploads > 0 && onDateClick) onDateClick(d.key);
                      }}
                      onMouseEnter={(e) => {
                        const rect = (
                          e.target as SVGRectElement
                        ).getBoundingClientRect();
                        const hasRichDetails =
                          uploads > 0 &&
                          ((dayEntry?.games && dayEntry.games.length > 0) ||
                            (dayEntry?.totalHours ?? 0) > 0 ||
                            (dayEntry?.localCount ?? 0) > 0 ||
                            (dayEntry?.youtubeCount ?? 0) > 0);
                        const approxWidth = hasRichDetails ? 240 : 185;
                        const padding = 10;
                        let tooltipX = rect.right + padding;
                        let transform = "translateY(-50%)";

                        if (
                          rect.right + approxWidth + padding >
                          window.innerWidth
                        ) {
                          tooltipX = rect.left - padding;
                          transform = "translate(-100%, -50%)";
                        }

                        const rawY = rect.top + rect.height / 2;
                        const clampedY = Math.min(
                          Math.max(rawY, 80),
                          window.innerHeight - 80,
                        );

                        setTooltip({
                          x: tooltipX,
                          y: clampedY,
                          dateLabel: dateStr,
                          entry: dayEntry,
                          visible: true,
                          transform: transform,
                        });
                      }}
                      onMouseLeave={() =>
                        setTooltip((t) => ({ ...t, visible: false }))
                      }
                    />
                  );
                }),
              )}
            </svg>
          </div>
        </div>

        {/* Footer Summary & Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full pt-3 border-t border-border-subtle/30 px-1 text-xs text-text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <div className={ SUMMARY_PILL_CLASS }>
              <strong className="text-text-primary font-semibold">
                {periodSummary.totalSessions}
              </strong>{" "}
              {label}
              {periodSummary.totalSessions === 1 ? "" : "s"} in{" "}
              <strong className="text-text-primary font-semibold">
                {periodSummary.activeDays}
              </strong>{" "}
              active days ({periodSummary.activePercentage}%)
            </div>

            <div className={ SUMMARY_PILL_CLASS }>
              <strong className="text-text-primary font-semibold">
                {periodSummary.monthLabel}:
              </strong>{" "}
              <strong className="text-text-primary font-semibold">
                {periodSummary.monthActiveDays}
              </strong>
              /{periodSummary.monthTotalDays} active days (
              {periodSummary.monthActivePercentage}%)
            </div>

            <div className={ SUMMARY_PILL_CLASS }>
              Longest streak:{" "}
              <strong className="text-text-primary font-semibold">
                {periodSummary.longestStreak}d
              </strong>
              {periodSummary.currentStreak > 0 && (
                <>
                  {" · Current: "}
                  <strong className="text-accent font-semibold">
                    {periodSummary.currentStreak}d
                  </strong>
                </>
              )}
            </div>
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
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: tooltip.transform,
              }}
            >
              <HeatmapTooltipCard
                dateLabel={tooltip.dateLabel}
                entry={tooltip.entry}
                label={label}
              />
            </div>,
            document.body,
          )}
      </div>
    );
  },
);

interface HeatmapTooltipCardProps {
  readonly dateLabel: string;
  readonly entry: EnrichedDailyCount | null;
  readonly label: string;
}

function HeatmapTooltipCard({
  dateLabel,
  entry,
  label,
}: HeatmapTooltipCardProps) {
  const count = entry?.count ?? 0;
  const totalHours = entry?.totalHours ?? 0;
  const games = entry?.games ?? [];
  const localCount = entry?.localCount ?? 0;
  const youtubeCount = entry?.youtubeCount ?? 0;

  return (
    <div className="px-3 py-2.5 rounded-lg bg-[#18181c] text-text-primary text-xs shadow-sm border border-[#26262b] min-w-[185px] max-w-[260px] flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-text-muted tabular-nums">
          {dateLabel}
        </span>
        {count > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-text-primary tabular-nums">
              {count} {label}
              {count === 1 ? "" : "s"}
            </span>
            {totalHours > 0 && (
              <span className="text-[11px] font-semibold text-accent tabular-nums">
                {formatPlaytimeHoursMinutes(totalHours)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs font-medium text-text-secondary">
            No {label}s on {dateLabel}
          </span>
        )}
      </div>

      {count > 0 && games.length > 0 && (
        <div className="flex flex-col gap-1 pt-1.5 border-t border-[#232328]">
          {games.slice(0, 4).map((g) => (
            <div
              key={g.game}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getGameColor(g.game) }}
                />
                <span className="text-[11px] font-medium text-text-primary truncate">
                  {g.game}
                </span>
              </div>
              <span className="text-[11px] text-text-secondary tabular-nums shrink-0">
                {g.count}x
                {g.hours > 0 ? ` · ${formatPlaytimeHoursMinutes(g.hours)}` : ""}
              </span>
            </div>
          ))}
          {games.length > 4 && (
            <span className="text-[10px] text-text-muted tabular-nums">
              +{games.length - 4} more games
            </span>
          )}
        </div>
      )}

      {count > 0 && (localCount > 0 || youtubeCount > 0) && (
        <div className="flex items-center gap-3 pt-1.5 border-t border-[#232328] text-[10px] text-text-muted tabular-nums">
          {localCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {localCount} Local
            </span>
          )}
          {youtubeCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              {youtubeCount} YouTube
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ContributionHeatmap;
