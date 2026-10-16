import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  EnrichedDailyCount,
  DailyGameSummary,
  normalizeGameKey,
  computeHeatmapPeriodSummary,
} from "../../utils/gameStats";
import { getGameColor } from "../../utils/tagColors";
import { HeatmapTooltipCard } from "./HeatmapTooltipCard";
import {
  HeatmapColorModeToggle,
  HeatmapColorMode,
} from "./HeatmapColorModeToggle";
import { HeatmapGameLegend } from "./HeatmapGameLegend";
import { getTopGames, TopGamesScope } from "../../utils/heatmapTopGames";

export type DailyCount = EnrichedDailyCount;
export type { DailyGameSummary, HeatmapColorMode };

export interface MonthDividerPath {
  readonly year: number;
  readonly d: string;
}

const SUMMARY_PILL_CLASS =
  "px-2.5 py-1 rounded-md bg-[#141418] border border-border-subtle text-xs text-text-muted tabular-nums";

const CUSTOM_PANEL_COLORS = [
  "#202024", // 0 uploads (inactive)
  "#632516", // 1 upload (low activity)
  "#a1381d", // 2-3 uploads (medium activity)
  "#f45124", // 4-5 uploads (high activity)
  "#ff7e54", // 6+ uploads (intense activity)
] as const;

const GAME_MODE_OPACITIES = [1.0, 0.45, 0.65, 0.85, 1.0] as const;

const BUCKET_RANGES = [
  { range: "0", labelSuffix: "s" },
  { range: "1", labelSuffix: "" },
  { range: "2-3", labelSuffix: "s" },
  { range: "4-5", labelSuffix: "s" },
  { range: "6+", labelSuffix: "s" },
] as const;

function getColorIndex(value: number): number {
  if (value === 0) return 0;
  if (value === 1) return 1;
  if (value <= 3) return 2;
  if (value <= 5) return 3;
  return 4;
}

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

    const [isolateYear, setIsolateYear] = useState<boolean>(false);

    useEffect(() => {
      if (
        currentSelectedYear !== "All" &&
        !availableYears.includes(currentSelectedYear)
      ) {
        handleYearChange("All");
      }
    }, [availableYears, currentSelectedYear]);

    useEffect(() => {
      if (currentSelectedYear === "All") {
        setIsolateYear(false);
      }
    }, [currentSelectedYear]);

    const isIsolated = isolateYear && currentSelectedYear !== "All";
    const cellSize = isIsolated ? 13 : 11;
    const cellRectSize = isIsolated ? 11 : 9;

    const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
    const [colorMode, setColorMode] = useState<HeatmapColorMode>("intensity");
    const [legendScope, setLegendScope] = useState<TopGamesScope>("year");
    const customPanelColors = CUSTOM_PANEL_COLORS;

    const hasGameMetadata = useMemo(() => {
      return Object.values(calendarData).some(
        (d) => (d.games?.length ?? 0) > 0,
      );
    }, [calendarData]);

    const handleColorModeChange = (mode: HeatmapColorMode) => {
      setColorMode(mode);
      setSelectedBucket(null);
    };

    const topGames = useMemo(() => {
      if (colorMode !== "game") return [];
      return getTopGames(calendarData, legendScope, currentSelectedYear, 5);
    }, [calendarData, colorMode, legendScope, currentSelectedYear]);

    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const today = useMemo(() => new Date(), []);
    const todayKey = useMemo(() => formatDate(today), [today]);

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

    // Layout containing either all years or single isolated year with separated month blocks
    const layout = useMemo(() => {
      let currentX = labelPadX;
      const generatedWeeks: {
        year: number;
        x: number;
        days: { date: Date | null; key: string }[];
      }[] = [];
      const yearLabels: { x: number; year: number }[] = [];
      const yearDividers: number[] = [];
      const monthLabels: { year: number; x: number; label: string }[] = [];
      const monthDividers: MonthDividerPath[] = [];

      if (isIsolated) {
        // Discrete month layout with physical gap between months
        const yr = parseInt(currentSelectedYear, 10);
        yearLabels.push({ x: currentX, year: yr });

        const monthGap = 8;
        const maxMonth = yr === today.getFullYear() ? today.getMonth() : 11;

        for (let m = 0; m <= maxMonth; m++) {
          if (m > 0) {
            currentX += monthGap;
          }

          const monthStartX = currentX;
          const monthStart = new Date(yr, m, 1, 0, 0, 0, 0);
          let monthEnd = new Date(yr, m + 1, 0, 23, 59, 59, 999);
          if (yr === today.getFullYear() && m === today.getMonth()) {
            monthEnd = new Date(today);
            monthEnd.setHours(23, 59, 59, 999);
          }

          let curDay = new Date(monthStart);
          let week: { date: Date | null; key: string }[] = [];

          for (let p = 0; p < curDay.getDay(); p++) {
            week.push({ date: null, key: `pad-start-${yr}-${m}-${p}` });
          }

          while (curDay <= monthEnd) {
            week.push({
              date: new Date(curDay),
              key: formatDate(curDay),
            });

            if (week.length === 7) {
              generatedWeeks.push({ year: yr, x: currentX, days: week });
              currentX += cellSize;
              week = [];
            }
            curDay.setDate(curDay.getDate() + 1);
          }

          if (week.length > 0) {
            while (week.length < 7) {
              week.push({
                date: null,
                key: `pad-end-${yr}-${m}-${week.length}`,
              });
            }
            generatedWeeks.push({ year: yr, x: currentX, days: week });
            currentX += cellSize;
          }

          const monthEndX = currentX;
          monthLabels.push({
            year: yr,
            x: (monthStartX + monthEndX) / 2,
            label: monthNames[m],
          });
        }

        return {
          years: [yr],
          weeks: generatedWeeks,
          yearLabels,
          yearDividers,
          monthLabels,
          monthDividers,
          svgWidth: currentX + 16,
          svgHeight: labelPadY + 7 * cellSize + 6,
        };
      }

      // Continuous multi-year layout (when !isIsolated)
      const yearsToRender = [...availableYears].reverse(); // oldest -> newest

      const processWeekDividers = (
        wk: { date: Date | null; key: string }[],
        wkX: number,
        targetYear: number,
      ) => {
        wk.forEach((d, splitDayIdx) => {
          if (
            d.date !== null &&
            d.date.getFullYear() === targetYear &&
            d.date.getDate() === 1 &&
            d.date.getMonth() > 0
          ) {
            if (splitDayIdx > 0) {
              const ySplit = labelPadY + splitDayIdx * cellSize;
              const dPath = `M ${wkX + cellSize} ${labelPadY} L ${wkX + cellSize} ${ySplit} L ${wkX} ${ySplit} L ${wkX} ${labelPadY + 7 * cellSize}`;
              monthDividers.push({ year: targetYear, d: dPath });
            } else {
              const dPath = `M ${wkX - 1} ${labelPadY} L ${wkX - 1} ${labelPadY + 7 * cellSize}`;
              monthDividers.push({ year: targetYear, d: dPath });
            }
          }
        });
      };

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
                  year: yr,
                  x: currentX + cellSize / 2,
                  label: monthNames[mo],
                });
                lastMonth = mo;
                lastMonthX = currentX;
              }
            }

            processWeekDividers(week, currentX, yr);

            generatedWeeks.push({ year: yr, x: currentX, days: week });
            currentX += cellSize;
            week = [];
          }
          currentDay.setDate(currentDay.getDate() + 1);
        }

        if (week.length > 0) {
          while (week.length < 7) {
            week.push({ date: null, key: `pad-end-${yr}-${week.length}` });
          }
          processWeekDividers(week, currentX, yr);
          generatedWeeks.push({ year: yr, x: currentX, days: week });
          currentX += cellSize;
        }
      });

      return {
        years: yearsToRender.map((yrStr) => parseInt(yrStr, 10)),
        weeks: generatedWeeks,
        yearLabels,
        yearDividers,
        monthLabels,
        monthDividers,
        svgWidth: currentX + 16,
        svgHeight: labelPadY + 7 * cellSize + 6,
      };
    }, [availableYears, today, isIsolated, currentSelectedYear, cellSize]);

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

    const handleCellMouseEnter = (
      targetEl: SVGRectElement,
      dayEntry: EnrichedDailyCount | null,
      dateStr: string,
      uploads: number,
    ) => {
      const rect = targetEl.getBoundingClientRect();
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

      if (rect.right + approxWidth + padding > window.innerWidth) {
        tooltipX = rect.left - padding;
        transform = "translate(-100%, -50%)";
      }

      const rawY = rect.top + rect.height / 2;
      const clampedY = Math.min(Math.max(rawY, 80), window.innerHeight - 80);

      setTooltip({
        x: tooltipX,
        y: clampedY,
        dateLabel: dateStr,
        entry: dayEntry,
        visible: true,
        transform: transform,
      });
    };

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
      if (yearOption === "All") {
        setIsolateYear(false);
      }
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

    const matchingBucketDays = useMemo(() => {
      if (selectedBucket === null) return 0;
      let count = 0;
      for (const w of layout.weeks) {
        for (const d of w.days) {
          if (!d.date) continue;
          if (
            currentSelectedYear !== "All" &&
            d.date.getFullYear().toString() !== currentSelectedYear
          ) {
            continue;
          }
          const uploads = calendarData[d.key]?.count ?? 0;
          if (getColorIndex(uploads) === selectedBucket) {
            count += 1;
          }
        }
      }
      return count;
    }, [selectedBucket, layout.weeks, currentSelectedYear, calendarData]);

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

            {/* Dominant Game Color Mode Toggle */}
            {hasGameMetadata && (
              <HeatmapColorModeToggle
                value={colorMode}
                onChange={handleColorModeChange}
              />
            )}

            {/* Year Switcher with Smooth Scroll Navigation */}
            {availableYears.length > 1 && (
              <div className="flex items-center gap-2">
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

                {currentSelectedYear !== "All" && (
                  <button
                    type="button"
                    onClick={() => setIsolateYear((prev) => !prev)}
                    className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors bg-[#141418] border border-border-subtle/50 text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    {isolateYear ? "Show all years" : "Focus year"}
                  </button>
                )}
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
              {layout.years.map((yr) => {
                const isSelected = currentSelectedYear === yr.toString();
                const isDimmed =
                  currentSelectedYear !== "All" &&
                  currentSelectedYear !== yr.toString();
                const yearLabel = layout.yearLabels.find((yl) => yl.year === yr);
                const yearWeeks = layout.weeks.filter((w) => w.year === yr);
                const yearMonthLabels = layout.monthLabels.filter(
                  (m) => m.year === yr,
                );
                const yearDividersList = layout.monthDividers.filter(
                  (md) => md.year === yr,
                );

                return (
                  <g
                    key={yr}
                    data-year={yr}
                    opacity={isDimmed ? 0.3 : 1}
                    className="transition-opacity duration-200"
                  >
                    {yearLabel && (
                      <text
                        x={yearLabel.x}
                        y={13}
                        textAnchor="start"
                        style={{
                          fill: isSelected ? "#ffb020" : "#a0a0aa",
                          fontWeight: isSelected ? 900 : 700,
                          fontSize: 13,
                          transition: "fill 0.2s ease",
                        }}
                      >
                        {yearLabel.year}
                      </text>
                    )}

                    {yearMonthLabels.map((m, i) => (
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

                    {yearDividersList.map((div, i) => (
                      <path
                        key={`divider-${yr}-${i}`}
                        data-testid="month-divider"
                        d={div.d}
                        stroke={isIsolated ? "#52525b" : "#2e2e36"}
                        strokeWidth={isIsolated ? 1.5 : 1}
                        fill="none"
                        pointerEvents="none"
                      />
                    ))}

                    {yearWeeks.map((week) =>
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
                        const isToday = d.key === todayKey;
                        const dateStr = `${weekdayName}, ${monthName} ${dayNum}, ${yearNum}${isToday ? " (Today)" : ""}`;

                        const idx = getColorIndex(uploads);
                        let color: string = customPanelColors[idx];
                        const isSelectedDate = selectedDate === d.key;
                        const isBucketDimmed =
                          selectedBucket !== null && idx !== selectedBucket;

                        let cellOpacity: number = isBucketDimmed ? 0.15 : 1;

                        if (colorMode === "game" && uploads > 0) {
                          const dominantGame = dayEntry?.games?.[0]?.game;
                          if (dominantGame) {
                            color = getGameColor(dominantGame);
                          }
                          if (!isBucketDimmed) {
                            cellOpacity = GAME_MODE_OPACITIES[idx] ?? 1.0;
                          }
                        }

                        const strokeColor = isSelectedDate
                          ? "#f97316"
                          : isToday
                            ? "#ffb020"
                            : undefined;
                        const strokeWidthVal = isSelectedDate
                          ? 1.5
                          : isToday
                            ? 1.25
                            : undefined;

                        return (
                          <rect
                            key={d.key}
                            x={x}
                            y={y}
                            width={cellRectSize}
                            height={cellRectSize}
                            fill={color}
                            fillOpacity={cellOpacity}
                            stroke={strokeColor}
                            strokeWidth={strokeWidthVal}
                            rx={2}
                            ry={2}
                            className={`transition-colors duration-150 hover:stroke-accent hover:stroke-[1.5px]${uploads > 0 ? " cursor-pointer" : ""}`}
                            onClick={() => {
                              if (uploads > 0 && onDateClick) onDateClick(d.key);
                            }}
                            onMouseEnter={(e) =>
                              handleCellMouseEnter(
                                e.currentTarget,
                                dayEntry,
                                dateStr,
                                uploads,
                              )
                            }
                            onMouseLeave={() =>
                              setTooltip((t) => ({ ...t, visible: false }))
                            }
                          />
                        );
                      }),
                    )}
                  </g>
                );
              })}

              {!isIsolated &&
                layout.yearDividers.map((dx) => (
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
          {colorMode === "game" ? (
            <HeatmapGameLegend
              games={topGames}
              scope={legendScope}
              onScopeChange={setLegendScope}
              showScopeToggle={availableYears.length > 1}
            />
          ) : (
            <div className="flex items-center gap-2">
              {selectedBucket !== null && (
                <div className="flex items-center gap-2 text-[11px] tabular-nums mr-1">
                  <span className="text-text-muted">
                    {matchingBucketDays} {matchingBucketDays === 1 ? "day" : "days"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedBucket(null)}
                    className="text-accent hover:underline font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
              <span>Less</span>
              <div className="flex items-center gap-1">
                {customPanelColors.map((col, idx) => {
                  const rangeInfo = BUCKET_RANGES[idx];
                  const rangeText = `${rangeInfo.range} ${label}${rangeInfo.labelSuffix}`;
                  const isActive = selectedBucket === idx;
                  const isInactive =
                    selectedBucket !== null && selectedBucket !== idx;

                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`Filter by ${rangeText}`}
                      aria-pressed={isActive}
                      title={rangeText}
                      onClick={() =>
                        setSelectedBucket((prev) => (prev === idx ? null : idx))
                      }
                      className={`w-3.5 h-3.5 rounded-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        isActive
                          ? "ring-1 ring-text-primary scale-110 opacity-100"
                          : isInactive
                            ? "opacity-35 hover:opacity-75"
                            : "opacity-100 hover:opacity-80"
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  );
                })}
              </div>
              <span>More</span>
            </div>
          )}
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

export default ContributionHeatmap;
