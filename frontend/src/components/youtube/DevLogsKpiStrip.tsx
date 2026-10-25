import React from "react";
import { OperationSummaryItem, opColor } from "../../utils/devLogsUtils";

export interface DevLogsKpiStripProps {
  readonly quotaUsed: number;
  readonly quotaLimit: number;
  readonly quotaRemaining: number;
  readonly remainingUploads: number;
  readonly usedPct: number;
  readonly barColor: string;
  readonly countdownText: string;
  readonly resetClockText: string;
  readonly opSummaries: readonly OperationSummaryItem[];
}

export default function DevLogsKpiStrip({
  quotaUsed,
  quotaLimit,
  quotaRemaining,
  remainingUploads,
  usedPct,
  barColor,
  countdownText,
  resetClockText,
  opSummaries,
}: DevLogsKpiStripProps) {
  return (
    <div
      style={{
        padding: "12px 18px",
        borderBottom: "1px solid hsl(220 13% 14%)",
        background: "hsl(220 13% 8%)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "10px",
      }}
    >
      {/* Card 1: Quota Used Today */}
      <div
        style={{
          background: "hsl(220 13% 11%)",
          border: "1px solid hsl(220 13% 16%)",
          borderRadius: "8px",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 600 }}>
            Quota Used Today
          </span>
          <span
            style={{
              color: barColor,
              fontSize: "11px",
              fontWeight: 700,
              fontFamily: "monospace",
            }}
          >
            {usedPct.toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontSize: "13px",
            fontWeight: 700,
            fontFamily: "monospace",
            marginBottom: "6px",
          }}
        >
          {quotaUsed.toLocaleString()}{" "}
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 500 }}>
            / {quotaLimit.toLocaleString()} units
          </span>
        </div>
        <div
          style={{
            height: "5px",
            background: "hsl(220 13% 18%)",
            borderRadius: "3px",
            overflow: "hidden",
            display: "flex",
            width: "100%",
          }}
        >
          {opSummaries.map((op) => {
            const segmentWidth = Math.min(100, (op.cost / quotaLimit) * 100);
            if (segmentWidth <= 0) return null;
            return (
              <div
                key={op.operation}
                title={`${op.operation}: ${op.cost.toLocaleString()} units`}
                style={{
                  height: "100%",
                  width: `${segmentWidth}%`,
                  background: opColor(op.operation),
                }}
              />
            );
          })}
          {opSummaries.length === 0 && quotaUsed > 0 && (
            <div
              style={{
                height: "100%",
                width: `${usedPct}%`,
                background: barColor,
              }}
            />
          )}
        </div>
      </div>

      {/* Card 2: Remaining Capacity */}
      <div
        style={{
          background: "hsl(220 13% 11%)",
          border: "1px solid hsl(220 13% 16%)",
          borderRadius: "8px",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 600 }}>
            Remaining Capacity
          </span>
          <span style={{ color: "#22c55e", fontSize: "10px", fontWeight: 700 }}>
            AVAILABLE
          </span>
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontSize: "13px",
            fontWeight: 700,
            fontFamily: "monospace",
            marginBottom: "4px",
          }}
        >
          {quotaRemaining.toLocaleString()} units left
        </div>
        <div style={{ color: "#64748b", fontSize: "10px" }}>
          ~{remainingUploads} video uploads available today
        </div>
      </div>

      {/* Card 3: Daily Reset */}
      <div
        style={{
          background: "hsl(220 13% 11%)",
          border: "1px solid hsl(220 13% 16%)",
          borderRadius: "8px",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 600 }}>
            Daily Reset
          </span>
          <span style={{ color: "#64748b", fontSize: "10px" }}>
            Pacific Midnight
          </span>
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontSize: "13px",
            fontWeight: 700,
            fontFamily: "monospace",
            marginBottom: "4px",
          }}
        >
          Resets in {countdownText}
        </div>
        <div style={{ color: "#64748b", fontSize: "10px" }}>
          at {resetClockText} local
        </div>
      </div>
    </div>
  );
}
