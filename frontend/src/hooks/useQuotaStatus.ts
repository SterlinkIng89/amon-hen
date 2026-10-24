import { useState, useEffect, useCallback, useRef } from "react";
import { GetQuotaStatus } from "../../wailsjs/go/backend/App";
import { QuotaStatus } from "../utils/quotaStatus";

export interface UseQuotaStatusResult {
  readonly status: QuotaStatus | null;
  readonly msUntilReset: number;
  readonly refresh: () => void;
}

export function useQuotaStatus(): UseQuotaStatusResult {
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  const [msUntilReset, setMsUntilReset] = useState<number>(0);
  const statusRef = useRef<QuotaStatus | null>(null);
  statusRef.current = status;

  const refresh = useCallback(() => {
    GetQuotaStatus()
      .then((res) => {
        if (!res) return;
        const normalized: QuotaStatus = {
          used: Number(res.used) || 0,
          limit: Number(res.limit) || 10000,
          remaining: Number(res.remaining) || 0,
          resetsAt: Number(res.resetsAt) || 0,
        };
        setStatus(normalized);
        const diff = Math.max(0, normalized.resetsAt * 1000 - Date.now());
        setMsUntilReset(diff);
      })
      .catch(() => {
        // Keep previous status on failure
      });
  }, []);

  // Poll backend every 30 seconds
  useEffect(() => {
    refresh();
    const intervalId = setInterval(refresh, 30000);
    return () => clearInterval(intervalId);
  }, [refresh]);

  // Local 1-second tick for countdown
  useEffect(() => {
    const timerId = setInterval(() => {
      const current = statusRef.current;
      if (!current || !current.resetsAt) {
        return;
      }
      const remainingMs = current.resetsAt * 1000 - Date.now();
      if (remainingMs <= 0) {
        setMsUntilReset(0);
        refresh();
      } else {
        setMsUntilReset(remainingMs);
      }
    }, 1000);

    return () => clearInterval(timerId);
  }, [refresh]);

  return {
    status,
    msUntilReset,
    refresh,
  };
}
