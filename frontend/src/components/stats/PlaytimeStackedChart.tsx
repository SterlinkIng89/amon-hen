import { useMemo, useState } from "react";
import {
  DayGameBreakdown,
  MonthGameBreakdown,
  assignGameColors,
  OTHER_GAME_COLOR,
} from "../../utils/gameStats";

export interface PlaytimeStackedChartProps {
  readonly viewMode: "month" | "year";
  readonly dailyData: readonly DayGameBreakdown[];
  readonly monthlyData: readonly MonthGameBreakdown[];
  readonly topGames: readonly string[];
  readonly selectedKey: string;
  readonly onSelectKey?: (key: string) => void;
}

function formatChartDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function computeNiceChartMax(rawHours: number): number {
  if (rawHours <= 0) return 2;
  const target = Math.max(rawHours + 1.2, rawHours * 1.2);
  if (target <= 10) {
    return Math.ceil(target);
  }
  if (target <= 30) {
    return Math.ceil(target / 2) * 2;
  }
  return Math.ceil(target / 5) * 5;
}

function formatAxisHours(decimalHours: number): string {
  if (decimalHours <= 0) return "0h";
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDigitalHours(decimalHours: number): string {
  if (decimalHours <= 0) return "00:00h";
  const totalMin = Math.round(decimalHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
}

interface StackedBarColumnProps {
  readonly id: string;
  readonly title: string;
  readonly totalHours: number;
  readonly byGame: Readonly<Record<string, number>>;
  readonly totalViewHours: number;
  readonly chartMax: number;
  readonly isSelected: boolean;
  readonly isHovered: boolean;
  readonly hasAnyHovered: boolean;
  readonly tooltipSide: "left" | "right";
  readonly barMaxWidthClass: string;
  readonly colorMap: Readonly<Record<string, string>>;
  readonly labelNode: React.ReactNode;
  readonly onSelect?: (key: string) => void;
  readonly onHover: () => void;
  readonly onLeave: () => void;
}

function StackedBarColumn({
  id,
  title,
  totalHours,
  byGame,
  totalViewHours,
  chartMax,
  isSelected,
  isHovered,
  hasAnyHovered,
  tooltipSide,
  barMaxWidthClass,
  colorMap,
  labelNode,
  onSelect,
  onHover,
  onLeave,
}: StackedBarColumnProps) {
  const totalHeightPct =
    totalHours > 0 ? Math.max((totalHours / chartMax) * 100, 3) : 0;

  const entries = Object.entries(byGame).sort(([, hA], [, hB]) => hB - hA);

  const pctOfView =
    totalViewHours > 0 ? Math.round((totalHours / totalViewHours) * 100) : 0;

  return (
    <div
      className="flex-1 flex flex-col justify-end items-center h-full group cursor-pointer relative"
      onClick={() => onSelect?.(id)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {isHovered && (
        <div className="absolute inset-x-0 bottom-6 top-1 rounded-t-xs pointer-events-none bg-card/60" />
      )}

      {isHovered && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 bg-elevated/95 backdrop-blur-md border border-border-medium text-text-primary text-xs p-3 rounded-xl whitespace-nowrap z-40 shadow-sm pointer-events-none flex flex-col gap-2 min-w-[170px] ${
            tooltipSide === "right" ? "left-full ml-3" : "right-full mr-3"
          }`}
        >
          <div className="flex items-center justify-between gap-4 font-bold pb-2 border-b border-border-subtle">
            <span className="text-text-primary">{title}</span>
            <div className="flex items-center gap-1.5 tabular-nums text-xs">
              <span className="text-accent font-bold">
                {formatDigitalHours(totalHours)}
              </span>
              {totalHours > 0 && pctOfView > 0 && (
                <span className="text-text-secondary font-medium">
                  ({pctOfView}%)
                </span>
              )}
            </div>
          </div>

          {entries.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {entries.slice(0, 4).map(([game, h]) => {
                const color = colorMap[game] || OTHER_GAME_COLOR;
                const pct =
                  totalHours > 0 ? Math.round((h / totalHours) * 100) : 0;
                return (
                  <div
                    key={game}
                    className="flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-text-primary font-medium truncate max-w-[130px]">
                        {game}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2 shrink-0 tabular-nums font-semibold text-text-secondary">
                      <span className="text-text-primary">
                        {formatDigitalHours(h)}
                      </span>
                      {entries.length > 1 && (
                        <span className="text-[10px] text-text-muted font-normal w-9 text-right">
                          ({pct}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {entries.length > 4 && (
                <span className="text-[10px] text-text-secondary italic pt-0.5">
                  +{entries.length - 4} more
                </span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-text-secondary">
              No playtime recorded
            </span>
          )}
        </div>
      )}

      <div
        className={`w-full ${barMaxWidthClass} rounded-t-xs overflow-hidden flex flex-col-reverse transition-all duration-150 relative z-10 ${
          isSelected ? "ring-2 ring-accent" : ""
        } ${
          isHovered
            ? "brightness-125 ring-1 ring-border-medium"
            : hasAnyHovered
              ? "opacity-35"
              : "opacity-100"
        }`}
        style={{ height: `${totalHeightPct}%` }}
      >
        {entries.map(([game, h]) => {
          const segPct = totalHours > 0 ? (h / totalHours) * 100 : 0;
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

      {labelNode}
    </div>
  );
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

  const colorMap = useMemo(() => {
    return assignGameColors([...topGames]);
  }, [topGames]);

  const chartMax = useMemo(() => {
    const raw =
      viewMode === "month"
        ? Math.max(...dailyData.map((d) => d.totalHours), 0)
        : Math.max(...monthlyData.map((m) => m.totalHours), 0);
    return computeNiceChartMax(raw);
  }, [viewMode, dailyData, monthlyData]);

  const totalViewHours = useMemo(() => {
    if (viewMode === "month") {
      return dailyData.reduce((acc, d) => acc + d.totalHours, 0);
    }
    return monthlyData.reduce((acc, m) => acc + m.totalHours, 0);
  }, [viewMode, dailyData, monthlyData]);

  const legendItems = useMemo(() => {
    return topGames.slice(0, 5).map((game) => ({
      name: game,
      color: colorMap[game] || OTHER_GAME_COLOR,
    }));
  }, [topGames, colorMap]);

  const hasAnyHovered = hoveredIndex !== null;

  return (
    <div className="flex flex-col gap-2 w-full mt-2">
      <div className="flex gap-2 w-full items-stretch">
        <div className="flex flex-col justify-between items-end pb-6 pt-1 text-[10px] text-text-muted font-medium shrink-0 w-12 tabular-nums select-none border-r border-border-subtle/50 pr-2">
          <span title="Scale ceiling">{formatAxisHours(chartMax)}</span>
          <span className="text-text-muted/60">
            {formatAxisHours(chartMax / 2)}
          </span>
          <span>0h</span>
        </div>

        <div className="h-44 flex-1 flex items-end gap-1 sm:gap-1.5 pb-6 pt-1 px-1 relative border-b border-border-subtle">
          <div className="absolute inset-x-0 top-1 border-b border-dashed border-border-subtle/30 pointer-events-none" />
          <div className="absolute inset-x-0 top-1/2 -translate-y-2.5 border-b border-dashed border-border-subtle/20 pointer-events-none" />

          {viewMode === "month"
            ? dailyData.map((day, idx) => (
                <StackedBarColumn
                  key={day.date}
                  id={day.date}
                  title={formatChartDate(day.date)}
                  totalHours={day.totalHours}
                  byGame={day.byGame}
                  totalViewHours={totalViewHours}
                  chartMax={chartMax}
                  isSelected={selectedKey === day.date}
                  isHovered={hoveredIndex === idx}
                  hasAnyHovered={hasAnyHovered}
                  tooltipSide={idx < 18 ? "right" : "left"}
                  barMaxWidthClass="max-w-[28px]"
                  colorMap={colorMap}
                  onSelect={onSelectKey}
                  onHover={() => setHoveredIndex(idx)}
                  onLeave={() => setHoveredIndex(null)}
                  labelNode={
                    <span
                      className={`text-[9px] mt-1 tabular-nums transition-colors ${
                        hoveredIndex === idx
                          ? "text-accent font-bold"
                          : day.dayNum % 5 === 1 || day.dayNum === dailyData.length
                            ? "text-text-secondary"
                            : "hidden sm:block text-text-muted"
                      }`}
                    >
                      {day.dayNum}
                    </span>
                  }
                />
              ))
            : monthlyData.map((month, idx) => (
                <StackedBarColumn
                  key={month.monthKey}
                  id={month.monthKey}
                  title={month.monthLabel}
                  totalHours={month.totalHours}
                  byGame={month.byGame}
                  totalViewHours={totalViewHours}
                  chartMax={chartMax}
                  isSelected={selectedKey === month.monthKey}
                  isHovered={hoveredIndex === idx}
                  hasAnyHovered={hasAnyHovered}
                  tooltipSide={idx < 6 ? "right" : "left"}
                  barMaxWidthClass="max-w-[36px]"
                  colorMap={colorMap}
                  onSelect={onSelectKey}
                  onHover={() => setHoveredIndex(idx)}
                  onLeave={() => setHoveredIndex(null)}
                  labelNode={
                    <span
                      className={`text-[10px] mt-1 tabular-nums transition-colors ${
                        hoveredIndex === idx
                          ? "text-accent font-bold"
                          : "text-text-secondary font-medium"
                      }`}
                    >
                      {month.monthLabel}
                    </span>
                  }
                />
              ))}
        </div>
      </div>

      {legendItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-2 pb-1 text-[11px] text-text-secondary">
          {legendItems.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate max-w-[130px]">{item.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: OTHER_GAME_COLOR }}
            />
            <span>Other</span>
          </div>
        </div>
      )}
    </div>
  );
}
