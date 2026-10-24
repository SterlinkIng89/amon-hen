import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useQuotaStatus } from "../useQuotaStatus";
import * as appBackend from "../../../wailsjs/go/backend/App";
import { backend } from "../../../wailsjs/go/models";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetQuotaStatus: vi.fn(),
}));

describe("useQuotaStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads quota status and computes initial msUntilReset", async () => {
    const mockResetsAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    vi.mocked(appBackend.GetQuotaStatus).mockResolvedValue(
      new backend.QuotaStatus({
        used: 1600,
        limit: 10000,
        remaining: 8400,
        resetsAt: mockResetsAt,
      }),
    );

    const { result } = renderHook(() => useQuotaStatus());

    await act(async () => {
      // Flush microtasks
      await Promise.resolve();
    });

    expect(result.current.status).toEqual({
      used: 1600,
      limit: 10000,
      remaining: 8400,
      resetsAt: mockResetsAt,
    });
    expect(result.current.msUntilReset).toBeGreaterThan(0);
    expect(result.current.msUntilReset).toBeLessThanOrEqual(3600 * 1000);
  });

  it("decrements msUntilReset every second without making redundant API calls", async () => {
    const mockResetsAt = Math.floor(Date.now() / 1000) + 100; // 100 seconds
    vi.mocked(appBackend.GetQuotaStatus).mockResolvedValue(
      new backend.QuotaStatus({
        used: 50,
        limit: 10000,
        remaining: 9950,
        resetsAt: mockResetsAt,
      }),
    );

    const { result } = renderHook(() => useQuotaStatus());

    await act(async () => {
      await Promise.resolve();
    });

    const initialMs = result.current.msUntilReset;
    expect(appBackend.GetQuotaStatus).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000); // 2 seconds
    });

    expect(result.current.msUntilReset).toBe(initialMs - 2000);
    // API should not have been called for 1-second ticks
    expect(appBackend.GetQuotaStatus).toHaveBeenCalledTimes(1);
  });

  it("polls API every 30 seconds", async () => {
    const mockResetsAt = Math.floor(Date.now() / 1000) + 500;
    vi.mocked(appBackend.GetQuotaStatus).mockResolvedValue(
      new backend.QuotaStatus({
        used: 0,
        limit: 10000,
        remaining: 10000,
        resetsAt: mockResetsAt,
      }),
    );

    renderHook(() => useQuotaStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(appBackend.GetQuotaStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(appBackend.GetQuotaStatus).toHaveBeenCalledTimes(2);
  });
});
