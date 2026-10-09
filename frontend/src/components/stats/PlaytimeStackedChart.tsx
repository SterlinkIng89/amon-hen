import { useMemo, useState } from "react";
import {
  DayGameBreakdown,
  MonthGameBreakdown,
  assignGameColors,
  OTHER_GAME_COLOR,
} from "../../utils/gameStats";
import { formatPlaytimeHoursMinutes } from "../../utils/videoUtils";

export interface PlaytimeStackedChartProps {
  readonly viewMode: "month" | "year";
  readonly dailyData: readonly DayGameBreakdown[];
  readonly monthlyData: readonly MonthGameBreakdown[];
  readonly topGames: readonly string[];
  readonly selectedKey: string; // Day date "YYYY-MM-DD" or monthKey "YYYY-MM"
  readonly onSelectKey?: (key: string) => void;
}

export function PlaytimeStackedChart({
  viewMode,
  dailyData,
  monthlyData,
  topGames,
  selectedKey,
  onSelectKey,
}: PlaytimeStackedChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Assign distinct consistent colors for top games
  const colorMap = useMemo(() => {
    return assignGameColors([...topGames]);
  }, [topGames]);

  // Compute maximum stacked height to scale bars
  const maxBarValue = useMemo(() => {
    if (viewMode === "month") {
      const max = Math.max(...dailyData.map((d) => d.totalHours), 0);
      return max > 0 ? max : 1;
    }
    const max = Math.max(...monthlyData.map((m) => m.totalHours), 0);
    return max > 0 ? max : 1;
  }, [viewMode, dailyData, monthlyData]);

  // Legend items (top 5 games + Other if applicable)
  const legendItems = useMemo(() => {
    const items = topGames.slice(0, 5).map((game) => ({
      name: game,
      color: colorMap[game] || OTHER_GAME_COLOR,
    }));
    return items;
  }, [topGames, colorMap]);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Legend */}
      {legendItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-text-secondary">
          {legendItems.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate max-w-[120px]">{item.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: OTHER_GAME_COLOR }}
            />
            <span>Other</span>
          </div>
        </div>
      )}

      {/* Chart container */}
      <div className="h-36 flex items-end gap-1 sm:gap-1.5 pt-6 pb-2 px-1 relative w-full border-b border-border-subtle">
        {viewMode === "month"
          ? dailyData.map((day, idx) => {
              const isSelected = selectedKey === day.date;
              const isHovered = hoveredIndex === idx;
              const totalHeightPct =
                day.totalHours > 0
                  ? Math.max((day.totalHours / maxBarValue) * 100, 4)
                  : 0;

              // Build segments sorted descending
              const entries = Object.entries(day.byGame).sort(
                ([, hA], [, hB]) => hB - hA,
              );

              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col justify-end items-center h-full group cursor-pointer relative"
                  onClick={() => onSelectKey?.(day.date)}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Tooltip */}
                  {isHovered && day.totalHours > 0 && (
                    <div className="absolute -top-12 bg-surface border border-border-subtle text-text-primary text-[10px] p-2 rounded-md whitespace-nowrap z-30 shadow-md pointer-events-none flex flex-col gap-1">
                      <div className="font-bold flex items-center justify-between gap-3">
                        <span>{day.date}</span>
                        <span className="text-accent">
                          {formatPlaytimeHoursMinutes(day.totalHours)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {entries.slice(0, 3).map(([game, h]) => (
                          <div
                            key={game}
                            className="flex items-center justify-between gap-2 text-text-muted"
                          >
                            <span className="truncate max-w-[110px]">
                              {game}
                            </span>
                            <span>{formatPlaytimeHoursMinutes(h)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stacked bar */}
                  <div
                    className={`w-full max-w-[28px] rounded-t-xs overflow-hidden flex flex-col-reverse transition-all duration-300 ${
                      isSelected ? "ring-2 ring-accent" : ""
                    }`}
                    style={{ height: `${totalHeightPct}%` }}
                  >
                    {entries.map(([game, h]) => {
                      const segPct =
                        day.totalHours > 0 ? (h / day.totalHours) * 100 : 0;
                      const color = colorMap[game] || OTHER_GAME_COLOR;
                      return (
                        <div
                          key={game}
                          style={{
                            height: `${segPct}%`,
                            backgroundColor: color,
                          }}
                          className="w-full shrink-0"
                        />
                      );
                    })}
                  </div>

                  {/* X-axis label (show every few days on mobile, all on wide) */}
                  <span
                    className={`text-[9px] mt-1 tabular-nums ${
                      day.dayNum % 5 === 1 || day.dayNum === dailyData.length
                        ? "text-text-muted"
                        : "hidden sm:block text-text-muted/60"
                    }`}
                  >
                    {day.dayNum}
                  </span>
                </div>
              );
            })
          : monthlyData.map((month, idx) => {
              const isSelected = selectedKey === month.monthKey;
              const isHovered = hoveredIndex === idx;
              const totalHeightPct =
                month.totalHours > 0
                  ? Math.max((month.totalHours / maxBarValue) * 100, 4)
                  : 0;

              const entries = Object.entries(month.byGame).sort(
                ([, hA], [, hB]) => hB - hA,
              );

              return (
                <div
                  key={month.monthKey}
                  className="flex-1 flex flex-col justify-end items-center h-full group cursor-pointer relative"
                  onClick={() => onSelectKey?.(month.monthKey)}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Tooltip */}
                  {isHovered && month.totalHours > 0 && (
                    <div className="absolute -top-12 bg-surface border border-border-subtle text-text-primary text-[10px] p-2 rounded-md whitespace-nowrap z-30 shadow-md pointer-events-none flex flex-col gap-1">
                      <div className="font-bold flex items-center justify-between gap-3">
                        <span>{month.monthLabel}</span>
                        <span className="text-accent">
                          {formatPlaytimeHoursMinutes(month.totalHours)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {entries.slice(0, 3).map(([game, h]) => (
                          <div
                            key={game}
                            className="flex items-center justify-between gap-2 text-text-muted"
                          >
                            <span className="truncate max-w-[110px]">
                              {game}
                            </span>
                            <span>{formatPlaytimeHoursMinutes(h)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stacked bar */}
                  <div
                    className={`w-full max-w-[36px] rounded-t-xs overflow-hidden flex flex-col-reverse transition-all duration-300 ${
                      isSelected ? "ring-2 ring-accent" : ""
                    }`}
                    style={{ height: `${totalHeightPct}%` }}
                  >
                    {entries.map(([game, h]) => {
                      const segPct =
                        month.totalHours > 0
                          ? (h / month.totalHours) * 100
                          : 0;
                      const color = colorMap[game] || OTHER_GAME_COLOR;
                      return (
                        <div
                          key={game}
                          style={{
                            height: `${segPct}%`,
                            backgroundColor: color,
                          }}
                          className="w-full shrink-0"
                        />
                      );
                    })}
                  </div>

                  <span className="text-[10px] mt-1 font-medium text-text-muted">
                    {month.monthLabel}
                  </span>
                </div>
              );
            })}
      </div>
    </div>
  );
}
