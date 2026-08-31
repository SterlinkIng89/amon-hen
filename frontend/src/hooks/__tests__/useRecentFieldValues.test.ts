import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecentFieldValues } from "../useRecentFieldValues";
import * as appBackend from "../../../wailsjs/go/backend/App";

let mockConfigState: { recent_field_values: Record<string, string[]> } = {
  recent_field_values: {
    event: ["Quadra Kill", "Ace"],
  },
};

vi.mock("../../../wailsjs/go/backend/App", () => ({
  LoadConfig: vi.fn(() => Promise.resolve(mockConfigState)),
  SaveRecentFieldValues: vi.fn((newValues) => {
    mockConfigState.recent_field_values = newValues;
    return Promise.resolve();
  }),
}));

describe("useRecentFieldValues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigState = {
      recent_field_values: {
        event: ["Quadra Kill", "Ace"],
      },
    };
  });

  it("loads initial values from backend config", async () => {
    const { result } = renderHook(() => useRecentFieldValues());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.getRecentValues("event")).toEqual([
      "Quadra Kill",
      "Ace",
    ]);
    expect(result.current.getRecentValues("nonexistent")).toEqual([]);
  });

  it("adds a recent value and puts it at the front without duplicates", async () => {
    const { result } = renderHook(() => useRecentFieldValues());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.addRecentValue("event", "Pentakill");
      await Promise.resolve();
    });

    expect(result.current.getRecentValues("event")).toEqual([
      "Pentakill",
      "Quadra Kill",
      "Ace",
    ]);
    expect(appBackend.SaveRecentFieldValues).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ["Pentakill", "Quadra Kill", "Ace"],
      }),
    );

    // Adding existing item reorders it to front
    await act(async () => {
      result.current.addRecentValue("event", "Ace");
      await Promise.resolve();
    });

    expect(result.current.getRecentValues("event")).toEqual([
      "Ace",
      "Pentakill",
      "Quadra Kill",
    ]);
  });

  it("removes a recent value from the specified fieldKey", async () => {
    const { result } = renderHook(() => useRecentFieldValues());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.removeRecentValue("event", "Quadra Kill");
      await Promise.resolve();
    });

    expect(result.current.getRecentValues("event")).toEqual(["Ace"]);
    expect(appBackend.SaveRecentFieldValues).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ["Ace"],
      }),
    );
  });
});
