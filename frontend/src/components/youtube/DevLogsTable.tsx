import React, { Fragment } from "react";
import {
  LogDisplayItem,
  opColor,
  durationColor,
} from "../../utils/devLogsUtils";

export interface DevLogsTableProps {
  readonly displayItems: readonly LogDisplayItem[];
  readonly expandedBursts: ReadonlySet<string>;
  readonly onToggleBurst: (id: string) => void;
  readonly expandedErrors: ReadonlySet<number>;
  readonly onToggleError: (id: number) => void;
  readonly copiedErrorId: number | null;
  readonly onCopyError: (id: number, text: string) => void;
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DevLogsTable({
  displayItems,
  expandedBursts,
  onToggleBurst,
  expandedErrors,
  onToggleError,
  copiedErrorId,
  onCopyError,
}: DevLogsTableProps) {
  if (displayItems.length === 0) {
    return (
      <div
        style={{
          color: "#475569",
          textAlign: "center",
          padding: "40px",
          fontSize: "12px",
        }}
      >
        No logs to show.
      </div>
    );
  }

  let prevDayKey = "";

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead
        style={{
          position: "sticky",
          top: 0,
          background: "hsl(220 13% 9%)",
          zIndex: 1,
        }}
      >
        <tr style={{ borderBottom: "1px solid hsl(220 13% 16%)" }}>
          <th
            style={{
              textAlign: "left",
              padding: "6px 12px",
              color: "#475569",
              fontWeight: 700,
              fontSize: "10px",
              whiteSpace: "nowrap",
            }}
          >
            Time
          </th>
          <th
            style={{
              textAlign: "left",
              padding: "6px 12px",
              color: "#475569",
              fontWeight: 700,
              fontSize: "10px",
              whiteSpace: "nowrap",
            }}
          >
            Operation
          </th>
          <th
            style={{
              textAlign: "left",
              padding: "6px 12px",
              color: "#475569",
              fontWeight: 700,
              fontSize: "10px",
              whiteSpace: "nowrap",
            }}
          >
            Resource
          </th>
          <th
            style={{
              textAlign: "right",
              padding: "6px 12px",
              color: "#475569",
              fontWeight: 700,
              fontSize: "10px",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Cost
          </th>
          <th
            style={{
              textAlign: "right",
              padding: "6px 12px",
              color: "#475569",
              fontWeight: 700,
              fontSize: "10px",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Duration
          </th>
          <th
            style={{
              textAlign: "left",
              padding: "6px 12px",
              color: "#475569",
              fontWeight: 700,
              fontSize: "10px",
              whiteSpace: "nowrap",
            }}
          >
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {displayItems.map((item) => {
          const showDateDivider = item.dayKey !== prevDayKey;
          prevDayKey = item.dayKey;

          if (item.kind === "burst") {
            const isBurstExpanded = expandedBursts.has(item.id);
            const burstOpsSummary = Object.entries(item.opCounts)
              .map(([op, count]) => `${op} ×${count}`)
              .join(", ");

            return (
              <Fragment key={item.id}>
                {showDateDivider && (
                  <tr
                    key={`day-${item.dayKey}`}
                    style={{
                      background: "hsl(220 13% 12%)",
                      borderTop: "1px solid hsl(220 13% 18%)",
                      borderBottom: "1px solid hsl(220 13% 18%)",
                    }}
                  >
                    <td
                      colSpan={6}
                      style={{
                        padding: "6px 12px",
                        color: "#38bdf8",
                        fontWeight: 700,
                        fontSize: "10px",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {item.dayLabel}
                    </td>
                  </tr>
                )}
                <tr
                  onClick={() => onToggleBurst(item.id)}
                  style={{
                    background: isBurstExpanded
                      ? "hsl(220 13% 12%)"
                      : "hsl(220 13% 10%)",
                    borderBottom: "1px solid hsl(220 13% 15%)",
                    cursor: "pointer",
                  }}
                >
                  <td
                    style={{
                      padding: "6px 12px",
                      color: "#64748b",
                      whiteSpace: "nowrap",
                      fontFamily: "monospace",
                    }}
                  >
                    {fmtTime(item.startTs)} – {fmtTime(item.endTs)}
                  </td>
                  <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        background: "rgba(34, 211, 238, 0.15)",
                        border: "1px solid rgba(34, 211, 238, 0.35)",
                        borderRadius: "4px",
                        color: "#22d3ee",
                        padding: "2px 6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        fontFamily: "monospace",
                      }}
                    >
                      ⚡ Sync burst ({item.logs.length} calls)
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "6px 12px",
                      color: "#94a3b8",
                      maxWidth: "240px",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: "10px",
                      }}
                      title={burstOpsSummary}
                    >
                      {burstOpsSummary}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "6px 12px",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      fontFamily: "monospace",
                      fontVariantNumeric: "tabular-nums",
                      color: "#94a3b8",
                      fontWeight: 600,
                    }}
                  >
                    {item.totalCost.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "6px 12px",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      fontFamily: "monospace",
                      fontVariantNumeric: "tabular-nums",
                      color: durationColor(item.totalDurationMs),
                    }}
                  >
                    {item.totalDurationMs}ms
                  </td>
                  <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        color: "#38bdf8",
                        fontSize: "10px",
                        fontWeight: 600,
                      }}
                    >
                      {isBurstExpanded ? "▾ Collapse" : "▸ Expand"}
                    </span>
                  </td>
                </tr>
                {isBurstExpanded &&
                  item.logs.map((log) => (
                    <tr
                      key={`child-${log.id}`}
                      style={{
                        background: "hsl(220 13% 8%)",
                        borderBottom: "1px solid hsl(220 13% 12%)",
                      }}
                    >
                      <td
                        style={{
                          padding: "4px 12px 4px 24px",
                          color: "#475569",
                          whiteSpace: "nowrap",
                          fontFamily: "monospace",
                          fontSize: "10px",
                        }}
                      >
                        {fmtTime(log.ts)}
                      </td>
                      <td
                        style={{
                          padding: "4px 12px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            color: opColor(log.operation),
                            fontFamily: "monospace",
                            fontWeight: 700,
                            fontSize: "10px",
                          }}
                        >
                          {log.operation}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "4px 12px",
                          color: "#94a3b8",
                          maxWidth: "220px",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "10px",
                          }}
                          title={log.resourceTitle}
                        >
                          {log.resourceTitle || log.resourceId || "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "4px 12px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          fontFamily: "monospace",
                          fontVariantNumeric: "tabular-nums",
                          color: "#64748b",
                        }}
                      >
                        {log.quotaCost.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "4px 12px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          fontFamily: "monospace",
                          fontVariantNumeric: "tabular-nums",
                          color: durationColor(log.durationMs),
                        }}
                      >
                        {log.durationMs}ms
                      </td>
                      <td style={{ padding: "4px 12px" }}>
                        <span
                          style={{
                            color: "#22c55e",
                            fontWeight: 700,
                            fontSize: "10px",
                          }}
                        >
                          OK
                        </span>
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          }

          // Single log item
          const log = item.log;
          const isErrorExpanded = !log.success && expandedErrors.has(log.id);

          return (
            <Fragment key={log.id}>
              {showDateDivider && (
                <tr
                  key={`day-${item.dayKey}`}
                  style={{
                    background: "hsl(220 13% 12%)",
                    borderTop: "1px solid hsl(220 13% 18%)",
                    borderBottom: "1px solid hsl(220 13% 18%)",
                  }}
                >
                  <td
                    colSpan={6}
                    style={{
                      padding: "6px 12px",
                      color: "#38bdf8",
                      fontWeight: 700,
                      fontSize: "10px",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {item.dayLabel}
                  </td>
                </tr>
              )}
              <tr
                onClick={!log.success ? () => onToggleError(log.id) : undefined}
                style={{
                  background: !log.success
                    ? "rgba(239, 68, 68, 0.06)"
                    : "transparent",
                  borderBottom: "1px solid hsl(220 13% 13%)",
                  cursor: !log.success ? "pointer" : "default",
                }}
              >
                <td
                  style={{
                    padding: "5px 12px",
                    color: "#475569",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    title={fmtDate(log.ts)}
                    style={{ fontFamily: "monospace" }}
                  >
                    {fmtTime(log.ts)}
                  </span>
                </td>
                <td
                  style={{
                    padding: "5px 12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      color: opColor(log.operation),
                      fontFamily: "monospace",
                      fontWeight: 700,
                      fontSize: "10px",
                    }}
                  >
                    {log.operation}
                  </span>
                </td>
                <td
                  style={{
                    padding: "5px 12px",
                    color: "#94a3b8",
                    maxWidth: "220px",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={log.resourceTitle}
                  >
                    {log.resourceTitle || log.resourceId || "—"}
                  </span>
                </td>
                <td
                  style={{
                    padding: "5px 12px",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontVariantNumeric: "tabular-nums",
                    color:
                      log.quotaCost >= 1600
                        ? "#f97316"
                        : log.quotaCost >= 50
                          ? "#eab308"
                          : "#64748b",
                    fontWeight: log.quotaCost >= 50 ? 700 : 400,
                  }}
                >
                  {log.quotaCost.toLocaleString()}
                </td>
                <td
                  style={{
                    padding: "5px 12px",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontVariantNumeric: "tabular-nums",
                    color: durationColor(log.durationMs),
                  }}
                >
                  {log.durationMs}ms
                </td>
                <td style={{ padding: "5px 12px" }}>
                  {log.success ? (
                    <span
                      style={{
                        color: "#22c55e",
                        fontWeight: 700,
                        fontSize: "10px",
                      }}
                    >
                      OK
                    </span>
                  ) : (
                    <span
                      style={{
                        color: "#ef4444",
                        fontWeight: 700,
                        fontSize: "10px",
                        borderBottom: "1px dashed #ef4444",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      ERR {isErrorExpanded ? "▾" : "▸"}
                    </span>
                  )}
                </td>
              </tr>
              {isErrorExpanded && (
                <tr
                  key={`err-detail-${log.id}`}
                  style={{
                    background: "hsl(220 13% 7%)",
                    borderBottom: "1px solid hsl(220 13% 16%)",
                  }}
                >
                  <td colSpan={6} style={{ padding: "8px 14px" }}>
                    <div
                      style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        borderRadius: "6px",
                        padding: "10px 12px",
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
                        <span
                          style={{
                            color: "#ef4444",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          Error Details ({log.operation})
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyError(log.id, log.errorMsg);
                          }}
                          style={{
                            background: "hsl(220 13% 16%)",
                            border: "1px solid hsl(220 13% 24%)",
                            borderRadius: "4px",
                            color:
                              copiedErrorId === log.id ? "#22c55e" : "#e2e8f0",
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            cursor: "pointer",
                          }}
                        >
                          {copiedErrorId === log.id ? "Copied!" : "Copy Error"}
                        </button>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontFamily: "monospace",
                          fontSize: "11px",
                          color: "#fca5a5",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {log.errorMsg || "Unknown error (empty error payload)"}
                      </pre>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
