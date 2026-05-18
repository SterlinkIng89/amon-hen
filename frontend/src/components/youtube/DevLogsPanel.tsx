import { useState, useEffect, useCallback } from "react";
import { GetAPILogs, GetQuotaUsedToday } from "../../../wailsjs/go/main/App";

interface APILog {
  id: number;
  ts: number;
  operation: string;
  resourceId: string;
  resourceTitle: string;
  success: boolean;
  errorMsg: string;
  quotaCost: number;
  durationMs: number;
}

// Quota costs reference (YouTube Data API v3 daily limit = 10,000 units)
const DAILY_LIMIT = 10000;

const OP_COLORS: Record<string, string> = {
  "videos.insert":        "#f97316", // orange — expensive
  "videos.update":        "#eab308", // yellow
  "playlists.insert":     "#eab308",
  "playlistItems.insert": "#eab308",
  "channels.list":        "#22d3ee", // cyan — cheap
  "videos.list":          "#22d3ee",
  "playlists.list":       "#22d3ee",
  "playlistItems.list":   "#22d3ee",
};

function opColor(op: string): string {
  return OP_COLORS[op] ?? "#94a3b8";
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function QuotaBadge() {
  const [used, setUsed] = useState<number | null>(null);

  const refresh = useCallback(() => {
    GetQuotaUsedToday().then(setUsed).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  if (used === null) return null;

  const pct = Math.min((used / DAILY_LIMIT) * 100, 100);
  const danger = pct > 80;
  const warn   = pct > 50;
  const color  = danger ? "#ef4444" : warn ? "#f59e0b" : "#22d3ee";

  return (
    <div
      title={`Estimated YouTube API quota used today: ${used.toLocaleString()} / ${DAILY_LIMIT.toLocaleString()} units`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        background: "rgba(0,0,0,0.3)",
        border: `1px solid ${color}40`,
        borderRadius: "6px",
        padding: "3px 8px",
        cursor: "default",
        userSelect: "none",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill={color}>
        <path d="M13 2.05V4.07c3.39.49 6 3.39 6 6.93 0 3.21-1.81 6-4.72 7.28L13 17v2.95c4.01-.5 7-3.85 7-7.88 0-4.07-3-7.42-7-7.92zM11 2.05C7 2.55 4 5.9 4 9.97c0 4.03 3 7.38 7 7.88V2.05zM11 13l1-2 1 2h-2zM4 12H2v-2h2v2zm18 0h-2v-2h2v2zm-7-8V2h-2v2h2zm0 18v-2h-2v2h2z"/>
      </svg>
      <span style={{ color, fontSize: "10px", fontWeight: 700, fontFamily: "monospace" }}>
        {used.toLocaleString()}
      </span>
      <span style={{ color: "#64748b", fontSize: "10px", fontWeight: 500 }}>/ {DAILY_LIMIT.toLocaleString()}</span>
    </div>
  );
}

interface DevLogsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function DevLogsPanel({ open, onClose }: DevLogsPanelProps) {
  const [logs, setLogs] = useState<APILog[]>([]);
  const [quotaToday, setQuotaToday] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "errors">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [l, q] = await Promise.all([GetAPILogs(200), GetQuotaUsedToday()]);
      setLogs(l ?? []);
      setQuotaToday(q ?? 0);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  if (!open) return null;

  const shown = filter === "errors" ? logs.filter((l) => !l.success) : logs;
  const totalCost = logs.reduce((s, l) => s + l.quotaCost, 0);
  const pct = Math.min((quotaToday / DAILY_LIMIT) * 100, 100);
  const barColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22d3ee";

  // Group by operation for summary
  const byOp: Record<string, { count: number; cost: number; errors: number }> = {};
  for (const l of logs) {
    if (!byOp[l.operation]) byOp[l.operation] = { count: 0, cost: 0, errors: 0 };
    byOp[l.operation].count++;
    byOp[l.operation].cost += l.quotaCost;
    if (!l.success) byOp[l.operation].errors++;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "860px",
          maxWidth: "95vw",
          maxHeight: "85vh",
          background: "hsl(220 13% 9%)",
          border: "1px solid hsl(220 13% 18%)",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid hsl(220 13% 16%)",
          background: "hsl(220 13% 7%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#22d3ee">
              <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/>
            </svg>
            <span style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 700 }}>
              YouTube API Dev Logs
            </span>
            <span style={{
              background: "#22d3ee20",
              border: "1px solid #22d3ee30",
              color: "#22d3ee",
              fontSize: "10px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "4px",
            }}>DEV</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={refresh}
              disabled={loading}
              style={{
                background: "hsl(220 13% 16%)",
                border: "1px solid hsl(220 13% 22%)",
                borderRadius: "6px",
                color: "#94a3b8",
                fontSize: "11px",
                fontWeight: 600,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Quota bar */}
        <div style={{ padding: "12px 18px 8px", borderBottom: "1px solid hsl(220 13% 14%)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 600 }}>
              Estimated quota used today
            </span>
            <span style={{ color: barColor, fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>
              {quotaToday.toLocaleString()} / {DAILY_LIMIT.toLocaleString()} units ({pct.toFixed(1)}%)
            </span>
          </div>
          <div style={{ height: "4px", background: "hsl(220 13% 16%)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: "2px",
              transition: "width 0.4s ease",
            }} />
          </div>

          {/* Summary by operation */}
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            {Object.entries(byOp)
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([op, stats]) => (
                <div key={op} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  background: `${opColor(op)}10`,
                  border: `1px solid ${opColor(op)}30`,
                  borderRadius: "5px",
                  padding: "3px 8px",
                }}>
                  <span style={{ color: opColor(op), fontSize: "10px", fontWeight: 700, fontFamily: "monospace" }}>
                    {op}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "10px" }}>×{stats.count}</span>
                  <span style={{ color: "#94a3b8", fontSize: "10px", fontWeight: 600 }}>
                    {stats.cost.toLocaleString()} units
                  </span>
                  {stats.errors > 0 && (
                    <span style={{ color: "#ef4444", fontSize: "10px", fontWeight: 700 }}>
                      ⚠ {stats.errors} err
                    </span>
                  )}
                </div>
              ))}
            {Object.keys(byOp).length === 0 && (
              <span style={{ color: "#475569", fontSize: "11px" }}>No API calls recorded yet.</span>
            )}
          </div>
        </div>

        {/* Filter tabs + total */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 18px",
          borderBottom: "1px solid hsl(220 13% 14%)",
        }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {(["all", "errors"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? "hsl(220 13% 18%)" : "transparent",
                  border: filter === f ? "1px solid hsl(220 13% 26%)" : "1px solid transparent",
                  borderRadius: "5px",
                  color: filter === f ? "#e2e8f0" : "#64748b",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "3px 10px",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {f === "all" ? `All (${logs.length})` : `Errors (${logs.filter(l => !l.success).length})`}
              </button>
            ))}
          </div>
          <span style={{ color: "#475569", fontSize: "10px", fontFamily: "monospace" }}>
            {logs.length} calls · {totalCost.toLocaleString()} total units in log
          </span>
        </div>

        {/* Log table */}
        <div style={{ flex: 1, overflowY: "auto", fontSize: "11px" }}>
          {shown.length === 0 ? (
            <div style={{ color: "#475569", textAlign: "center", padding: "40px", fontSize: "12px" }}>
              No logs to show.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "hsl(220 13% 9%)", zIndex: 1 }}>
                <tr style={{ borderBottom: "1px solid hsl(220 13% 16%)" }}>
                  {["Time", "Operation", "Resource", "Cost", "Duration", "Status"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left",
                      padding: "6px 12px",
                      color: "#475569",
                      fontWeight: 700,
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((log, i) => (
                  <tr
                    key={log.id}
                    style={{
                      background: i % 2 === 0 ? "transparent" : "hsl(220 13% 7%)",
                      borderBottom: "1px solid hsl(220 13% 13%)",
                    }}
                  >
                    <td style={{ padding: "5px 12px", color: "#475569", whiteSpace: "nowrap" }}>
                      <span title={fmtDate(log.ts)} style={{ fontFamily: "monospace" }}>
                        {fmtTime(log.ts)}
                      </span>
                    </td>
                    <td style={{ padding: "5px 12px", whiteSpace: "nowrap" }}>
                      <span style={{
                        color: opColor(log.operation),
                        fontFamily: "monospace",
                        fontWeight: 700,
                        fontSize: "10px",
                      }}>
                        {log.operation}
                      </span>
                    </td>
                    <td style={{ padding: "5px 12px", color: "#94a3b8", maxWidth: "220px" }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={log.resourceTitle}>
                        {log.resourceTitle || log.resourceId || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "5px 12px", whiteSpace: "nowrap" }}>
                      <span style={{
                        color: log.quotaCost >= 1600 ? "#f97316" : log.quotaCost >= 50 ? "#eab308" : "#64748b",
                        fontFamily: "monospace",
                        fontWeight: log.quotaCost >= 50 ? 700 : 400,
                      }}>
                        {log.quotaCost.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: "5px 12px", color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {log.durationMs}ms
                    </td>
                    <td style={{ padding: "5px 12px" }}>
                      {log.success ? (
                        <span style={{ color: "#22c55e", fontWeight: 700, fontSize: "10px" }}>OK</span>
                      ) : (
                        <span
                          title={log.errorMsg}
                          style={{
                            color: "#ef4444",
                            fontWeight: 700,
                            fontSize: "10px",
                            cursor: "help",
                            borderBottom: "1px dashed #ef4444",
                          }}
                        >
                          ERR
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
