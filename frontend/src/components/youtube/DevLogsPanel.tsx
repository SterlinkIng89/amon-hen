import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { GetAPILogs } from "../../../wailsjs/go/backend/App";
import { useToast } from "../ui/ToastContainer";
import { useQuotaStatus } from "../../hooks/useQuotaStatus";
import {
  formatCountdown,
  formatResetClock,
  uploadsRemaining,
  UPLOAD_BASE_COST,
} from "../../utils/quotaStatus";
import {
  filterLogsByTimeScope,
  computeOperationSummary,
  filterAPILogs,
  groupLogsWithBursts,
  APILogEntry,
  LogTimeScope,
  LogFilterTier,
} from "../../utils/devLogsUtils";
import DevLogsKpiStrip from "./DevLogsKpiStrip";
import DevLogsFilterBar from "./DevLogsFilterBar";
import DevLogsTable from "./DevLogsTable";

const DAILY_LIMIT = 10000;

export function QuotaBadge() {
  const { status, msUntilReset } = useQuotaStatus();
  const warnedRef = useRef<Set<number>>(new Set());
  const { addToast } = useToast();

  useEffect(() => {
    if (!status) return;
    const pct = (status.used / status.limit) * 100;
    if (pct >= 90 && !warnedRef.current.has(90)) {
      warnedRef.current.add(90);
      addToast(
        `Critical: ${status.used.toLocaleString()} / ${status.limit.toLocaleString()} YouTube API quota units used today (${pct.toFixed(0)}%). Uploads may start failing.`,
        "error",
      );
    } else if (pct >= 70 && !warnedRef.current.has(70)) {
      warnedRef.current.add(70);
      addToast(
        `Heads up: ${pct.toFixed(0)}% of your daily YouTube API quota has been used (${status.used.toLocaleString()} / ${status.limit.toLocaleString()} units).`,
        "warning",
      );
    }
  }, [status, addToast]);

  if (!status) return null;

  const pct = Math.min((status.used / status.limit) * 100, 100);
  const danger = pct > 80;
  const warn = pct > 50;
  const color = danger ? "#ef4444" : warn ? "#f59e0b" : "#22d3ee";

  const countdownText = formatCountdown(msUntilReset);
  const resetClockText = formatResetClock(status.resetsAt);
  const tooltipText = `Estimated YouTube API quota used today: ${status.used.toLocaleString()} / ${status.limit.toLocaleString()} units\nRemaining: ${status.remaining.toLocaleString()} units left\nResets in ${countdownText} (at ${resetClockText} local)`;

  return (
    <div
      title={tooltipText}
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
        <path d="M13 2.05V4.07c3.39.49 6 3.39 6 6.93 0 3.21-1.81 6-4.72 7.28L13 17v2.95c4.01-.5 7-3.85 7-7.88 0-4.07-3-7.42-7-7.92zM11 2.05C7 2.55 4 5.9 4 9.97c0 4.03 3 7.38 7 7.88V2.05zM11 13l1-2 1 2h-2zM4 12H2v-2h2v2zm18 0h-2v-2h2v2zm-7-8V2h-2v2h2zm0 18v-2h-2v2h2z" />
      </svg>
      <span
        style={{
          color,
          fontSize: "10px",
          fontWeight: 700,
          fontFamily: "monospace",
        }}
      >
        {status.used.toLocaleString()}
      </span>
      <span style={{ color: "#64748b", fontSize: "10px", fontWeight: 500 }}>
        / {status.limit.toLocaleString()}
      </span>
      <span style={{ color: "#64748b", fontSize: "10px", fontWeight: 500 }}>
        · {countdownText}
      </span>
    </div>
  );
}

export interface DevLogsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export default function DevLogsPanel({ open, onClose }: DevLogsPanelProps) {
  const [logs, setLogs] = useState<APILogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<LogTimeScope>("today");
  const [tier, setTier] = useState<LogFilterTier>("all");
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [groupBursts, setGroupBursts] = useState(true);
  const [expandedBursts, setExpandedBursts] = useState<Set<string>>(new Set());
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const [copiedErrorId, setCopiedErrorId] = useState<number | null>(null);

  const { status, msUntilReset, refresh: refreshQuota } = useQuotaStatus();

  const toggleBurst = useCallback((id: string) => {
    setExpandedBursts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleError = useCallback((id: number) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCopyError = useCallback((id: number, text: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedErrorId(id);
      setTimeout(() => setCopiedErrorId(null), 2000);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const l = await GetAPILogs(200);
      setLogs(l ?? []);
      refreshQuota();
    } catch {
      // Ignored: keep existing logs if network fails
    } finally {
      setLoading(false);
    }
  }, [refreshQuota]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !autoRefresh) return;
    const timer = setInterval(() => {
      refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [open, autoRefresh, refresh]);

  const resetsAt = status?.resetsAt ?? 0;
  const scopedLogs = useMemo(
    () => filterLogsByTimeScope(logs, scope, resetsAt),
    [logs, scope, resetsAt],
  );
  const opSummaries = useMemo(
    () => computeOperationSummary(scopedLogs),
    [scopedLogs],
  );
  const filteredLogs = useMemo(
    () => filterAPILogs(scopedLogs, { tier, selectedOp, searchQuery }),
    [scopedLogs, tier, selectedOp, searchQuery],
  );
  const displayItems = useMemo(
    () => groupLogsWithBursts(filteredLogs, groupBursts),
    [filteredLogs, groupBursts],
  );

  const quotaUsed = status?.used ?? 0;
  const quotaLimit = status?.limit ?? DAILY_LIMIT;
  const quotaRemaining = status?.remaining ?? Math.max(0, quotaLimit - quotaUsed);
  const remainingUploads = uploadsRemaining(quotaRemaining, UPLOAD_BASE_COST);
  const usedPct = Math.min((quotaUsed / quotaLimit) * 100, 100);
  const barColor = usedPct > 80 ? "#ef4444" : usedPct > 50 ? "#f59e0b" : "#22d3ee";
  const countdownText = formatCountdown(msUntilReset);
  const resetClockText = status?.resetsAt ? formatResetClock(status.resetsAt) : "Midnight";

  const allCount = useMemo(
    () => filterAPILogs(scopedLogs, { tier: "all", selectedOp, searchQuery: "" }).length,
    [scopedLogs, selectedOp],
  );
  const writesCount = useMemo(
    () => filterAPILogs(scopedLogs, { tier: "writes", selectedOp, searchQuery: "" }).length,
    [scopedLogs, selectedOp],
  );
  const readsCount = useMemo(
    () => filterAPILogs(scopedLogs, { tier: "reads", selectedOp, searchQuery: "" }).length,
    [scopedLogs, selectedOp],
  );
  const errorsCount = useMemo(
    () => filterAPILogs(scopedLogs, { tier: "errors", selectedOp, searchQuery: "" }).length,
    [scopedLogs, selectedOp],
  );
  const filteredTotalCost = useMemo(
    () => filteredLogs.reduce((acc, l) => acc + (l.success ? l.quotaCost : 0), 0),
    [filteredLogs],
  );

  if (!open) return null;

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
          width: "920px",
          maxWidth: "96vw",
          maxHeight: "90vh",
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid hsl(220 13% 16%)",
            background: "hsl(220 13% 7%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#22d3ee">
              <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z" />
            </svg>
            <span
              style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 700 }}
            >
              YouTube API Dev Logs
            </span>
            <span
              style={{
                background: "#22d3ee20",
                border: "1px solid #22d3ee30",
                color: "#22d3ee",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "4px",
              }}
            >
              DEV
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                background: autoRefresh
                  ? "rgba(34, 197, 94, 0.15)"
                  : "hsl(220 13% 16%)",
                border: autoRefresh
                  ? "1px solid rgba(34, 197, 94, 0.4)"
                  : "1px solid hsl(220 13% 22%)",
                borderRadius: "6px",
                color: autoRefresh ? "#22c55e" : "#94a3b8",
                fontSize: "11px",
                fontWeight: 600,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {autoRefresh ? "Auto-refresh: 10s" : "Auto-refresh: Off"}
            </button>
            <button
              type="button"
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
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* 3-Card Quota KPI Strip */}
        <DevLogsKpiStrip
          quotaUsed={quotaUsed}
          quotaLimit={quotaLimit}
          quotaRemaining={quotaRemaining}
          remainingUploads={remainingUploads}
          usedPct={usedPct}
          barColor={barColor}
          countdownText={countdownText}
          resetClockText={resetClockText}
          opSummaries={opSummaries}
        />

        {/* Scope, Pills, Tabs and Search Bar */}
        <DevLogsFilterBar
          scope={scope}
          onScopeChange={setScope}
          tier={tier}
          onTierChange={setTier}
          selectedOp={selectedOp}
          onSelectedOpChange={setSelectedOp}
          groupBursts={groupBursts}
          onGroupBurstsChange={setGroupBursts}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          opSummaries={opSummaries}
          allCount={allCount}
          writesCount={writesCount}
          readsCount={readsCount}
          errorsCount={errorsCount}
          totalShownCount={filteredLogs.length}
          totalScopeCount={scopedLogs.length}
          totalCostInView={filteredTotalCost}
        />

        {/* Log table */}
        <div style={{ flex: 1, overflowY: "auto", fontSize: "11px" }}>
          <DevLogsTable
            displayItems={displayItems}
            expandedBursts={expandedBursts}
            onToggleBurst={toggleBurst}
            expandedErrors={expandedErrors}
            onToggleError={toggleError}
            copiedErrorId={copiedErrorId}
            onCopyError={handleCopyError}
          />
        </div>
      </div>
    </div>
  );
}
