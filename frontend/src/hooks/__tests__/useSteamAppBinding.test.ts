import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSteamAppBinding } from "../useSteamAppBinding";
import * as appBackend from "../../../wailsjs/go/backend/App";
import * as thumbnailCache from "../../utils/generateTagThumbnail";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetSteamAppID: vi.fn(),
}));

vi.mock("../../utils/generateTagThumbnail", () => ({
  clearTagThumbnailAssetCache: vi.fn(),
}));

describe("useSteamAppBinding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null and stops loading for an empty tag", async () => {
    const { result } = renderHook(() => useSteamAppBinding(""));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appId).toBeNull();
    expect(appBackend.GetSteamAppID).not.toHaveBeenCalled();
  });

  it("resolves a valid AppID for the tag", async () => {
    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue("3830");
    const { result } = renderHook(() => useSteamAppBinding("Psychonauts"));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appId).toBe("3830");
    expect(appBackend.GetSteamAppID).toHaveBeenCalledWith("Psychonauts");
  });

  it.each(["NOT_FOUND", "0", ""])("normalizes %j to null", async (raw) => {
    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue(raw);
    const { result } = renderHook(() => useSteamAppBinding("Unknown"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appId).toBeNull();
  });

  it("returns null when the lookup fails", async () => {
    vi.mocked(appBackend.GetSteamAppID).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useSteamAppBinding("Broken"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appId).toBeNull();
  });

  it("setBound updates the AppID and clears the thumbnail asset cache", async () => {
    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue("3830");
    const { result } = renderHook(() => useSteamAppBinding("Psychonauts"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setBound("607080"));
    expect(result.current.appId).toBe("607080");
    expect(thumbnailCache.clearTagThumbnailAssetCache).toHaveBeenCalledTimes(1);

    act(() => result.current.setBound(null));
    expect(result.current.appId).toBeNull();
    expect(thumbnailCache.clearTagThumbnailAssetCache).toHaveBeenCalledTimes(2);
  });
});
