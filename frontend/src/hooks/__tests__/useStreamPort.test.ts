import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useStreamPort } from "../useStreamPort";
import * as appBackend from "../../../wailsjs/go/backend/App";

const eventListeners: Record<string, Function[]> = {};

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetStreamPort: vi.fn(),
}));

vi.mock("../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn((event: string, callback: Function) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
    return () => {
      eventListeners[event] = eventListeners[event].filter(
        (cb) => cb !== callback,
      );
    };
  }),
}));

describe("useStreamPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(eventListeners)) {
      delete eventListeners[key];
    }
  });

  it("resolves streamPort successfully on mount", async () => {
    vi.mocked(appBackend.GetStreamPort).mockResolvedValue(55443);

    const { result } = renderHook(() => useStreamPort());

    await waitFor(() => {
      expect(result.current.streamPort).toBe(55443);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.streamError).toBeNull();
    });
  });

  it("handles stream:error event from backend", async () => {
    vi.mocked(appBackend.GetStreamPort).mockResolvedValue(0);

    const { result } = renderHook(() => useStreamPort());

    await act(async () => {
      const callbacks = eventListeners["stream:error"] || [];
      callbacks.forEach((cb) => cb("Port already in use"));
    });

    expect(result.current.streamError).toBe("Port already in use");
  });

  it("allows retrying stream port resolution", async () => {
    vi.mocked(appBackend.GetStreamPort)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(61234);

    const { result } = renderHook(() => useStreamPort());

    await act(async () => {
      result.current.retryStream();
    });

    await waitFor(() => {
      expect(result.current.streamPort).toBe(61234);
      expect(result.current.streamError).toBeNull();
    });
  });
});
