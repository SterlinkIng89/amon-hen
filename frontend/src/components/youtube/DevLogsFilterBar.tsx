import React from "react";
import {
  LogTimeScope,
  LogFilterTier,
  OperationSummaryItem,
  opColor,
} from "../../utils/devLogsUtils";

export interface DevLogsFilterBarProps {
  readonly scope: LogTimeScope;
  readonly onScopeChange: (scope: LogTimeScope) => void;
  readonly tier: LogFilterTier;
  readonly onTierChange: (tier: LogFilterTier) => void;
  readonly selectedOp: string | null;
  readonly onSelectedOpChange: (op: string | null) => void;
  readonly groupBursts: boolean;
  readonly onGroupBurstsChange: (group: boolean) => void;
  readonly searchQuery: string;
  readonly onSearchQueryChange: (query: string) => void;
  readonly opSummaries: readonly OperationSummaryItem[];
  readonly allCount: number;
  readonly writesCount: number;
  readonly readsCount: number;
  readonly errorsCount: number;
  readonly totalShownCount: number;
  readonly totalScopeCount: number;
  readonly totalCostInView: number;
}

export default function DevLogsFilterBar({
  scope,
  onScopeChange,
  tier,
  onTierChange,
  selectedOp,
  onSelectedOpChange,
  groupBursts,
  onGroupBurstsChange,
  searchQuery,
  onSearchQueryChange,
  opSummaries,
  allCount,
  writesCount,
  readsCount,
  errorsCount,
  totalShownCount,
  totalScopeCount,
  totalCostInView,
}: DevLogsFilterBarProps) {
  return (
    <>
      {/* Scope toggle & Interactive Operation Pills */}
      <div
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid hsl(220 13% 14%)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{ color: "#64748b", fontSize: "11px", fontWeight: 600 }}
            >
              Scope:
            </span>
            <div
              style={{
                display: "flex",
                background: "hsl(220 13% 14%)",
                borderRadius: "6px",
                padding: "2px",
                border: "1px solid hsl(220 13% 20%)",
              }}
            >
              <button
                type="button"
                aria-pressed={scope === "today"}
                onClick={() => onScopeChange("today")}
                style={{
                  background:
                    scope === "today" ? "hsl(220 13% 24%)" : "transparent",
                  color: scope === "today" ? "#e2e8f0" : "#64748b",
                  border: "none",
                  borderRadius: "4px",
                  padding: "3px 10px",
                  fontSize: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Today
              </button>
              <button
                type="button"
                aria-pressed={scope === "all"}
                onClick={() => onScopeChange("all")}
                style={{
                  background:
                    scope === "all" ? "hsl(220 13% 24%)" : "transparent",
                  color: scope === "all" ? "#e2e8f0" : "#64748b",
                  border: "none",
                  borderRadius: "4px",
                  padding: "3px 10px",
                  fontSize: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Last 200 calls
              </button>
            </div>
          </div>
          {selectedOp && (
            <button
              type="button"
              onClick={() => onSelectedOpChange(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#38bdf8",
                fontSize: "10px",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear operation filter ({selectedOp})
            </button>
          )}
        </div>

        {/* Operation pills */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
          }}
        >
          {opSummaries.map((op) => {
            const isSelected = selectedOp === op.operation;
            const color = opColor(op.operation);
            return (
              <button
                key={op.operation}
                type="button"
                aria-pressed={isSelected}
                onClick={() =>
                  onSelectedOpChange(isSelected ? null : op.operation)
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  background: isSelected ? `${color}30` : `${color}10`,
                  border: isSelected
                    ? `1px solid ${color}`
                    : `1px solid ${color}30`,
                  borderRadius: "5px",
                  padding: "3px 8px",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    color,
                    fontSize: "10px",
                    fontWeight: 700,
                    fontFamily: "monospace",
                  }}
                >
                  {op.operation}
                </span>
                <span style={{ color: "#64748b", fontSize: "10px" }}>
                  ×{op.count}
                </span>
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: "10px",
                    fontWeight: 600,
                  }}
                >
                  {op.cost.toLocaleString()} units
                </span>
                {op.errors > 0 && (
                  <span
                    style={{
                      color: "#ef4444",
                      fontSize: "10px",
                      fontWeight: 700,
                    }}
                  >
                    ⚠ {op.errors} err
                  </span>
                )}
              </button>
            );
          })}
          {opSummaries.length === 0 && (
            <span style={{ color: "#475569", fontSize: "11px" }}>
              No API calls recorded in this scope.
            </span>
          )}
        </div>
      </div>

      {/* Filter bar: Tabs + Search input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 18px",
          borderBottom: "1px solid hsl(220 13% 14%)",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {(
              [
                { key: "all", label: `All (${allCount})` },
                { key: "writes", label: `Writes (${writesCount})` },
                { key: "reads", label: `Reads (${readsCount})` },
                { key: "errors", label: `Errors (${errorsCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTierChange(tab.key)}
                style={{
                  background:
                    tier === tab.key ? "hsl(220 13% 18%)" : "transparent",
                  border:
                    tier === tab.key
                      ? "1px solid hsl(220 13% 26%)"
                      : "1px solid transparent",
                  borderRadius: "5px",
                  color: tier === tab.key ? "#e2e8f0" : "#64748b",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "3px 10px",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={groupBursts}
            onClick={() => onGroupBurstsChange(!groupBursts)}
            style={{
              background: groupBursts
                ? "rgba(34, 211, 238, 0.15)"
                : "transparent",
              border: groupBursts
                ? "1px solid rgba(34, 211, 238, 0.4)"
                : "1px solid hsl(220 13% 22%)",
              borderRadius: "5px",
              color: groupBursts ? "#22d3ee" : "#64748b",
              fontSize: "11px",
              fontWeight: 600,
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            Group bursts
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flex: 1,
            justifyContent: "flex-end",
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Filter by operation, title, ID, or error..."
            style={{
              background: "hsl(220 13% 14%)",
              border: "1px solid hsl(220 13% 22%)",
              borderRadius: "6px",
              padding: "4px 10px",
              color: "#e2e8f0",
              fontSize: "11px",
              width: "280px",
              outline: "none",
            }}
          />
          <span
            style={{
              color: "#475569",
              fontSize: "10px",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}
          >
            {totalShownCount} shown of {totalScopeCount} calls ·{" "}
            {totalCostInView.toLocaleString()} units in view
          </span>
        </div>
      </div>
    </>
  );
}
