import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useThumbnailAssets } from "../useThumbnailAssets";
import * as appBackend from "../../../wailsjs/go/backend/App";
import { backend } from "../../../wailsjs/go/models";
import { TagThumbnailConfig } from "../../types";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetSteamAppID: vi.fn(),
  GetSteamGameAssets: vi.fn(),
}));

class MockImage {
  private _src = "";
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  get src(): string {
    return this._src;
  }

  set src(val: string) {
    this._src = val;
    queueMicrotask(() => {
      if (val.includes("fail") || val.includes("error")) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    });
  }
}

describe("useThumbnailAssets", () => {
  const mockSteamAssets: backend.SteamGameAssets = {
    title: "Elden Ring",
    headerUrl: "https://steam.cdn/header.jpg",
    heroUrl: "https://steam.cdn/hero.jpg",
    posterUrl: "https://steam.cdn/poster.jpg",
    logoUrl: "https://steam.cdn/logo.png",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default empty state when tag is empty", () => {
    const { result } = renderHook(() => useThumbnailAssets(""));

    expect(result.current.loadingAssets).toBe(false);
    expect(result.current.steamAssets).toBeNull();
    expect(result.current.baseImage).toBeNull();
    expect(result.current.logoImage).toBeNull();
    expect(result.current.gameTitle).toBe("");
  });

  it("loads steam assets and decodes baseImage successfully", async () => {
    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue("1245620");
    vi.mocked(appBackend.GetSteamGameAssets).mockResolvedValue(mockSteamAssets);

    const { result } = renderHook(() => useThumbnailAssets("Elden Ring"));

    expect(result.current.loadingAssets).toBe(true);

    await waitFor(() => {
      expect(result.current.loadingAssets).toBe(false);
      expect(result.current.steamAssets).toEqual(mockSteamAssets);
      expect(result.current.baseImage).not.toBeNull();
      expect(result.current.baseImage?.src).toBe(mockSteamAssets.headerUrl);
      expect(result.current.logoImage).not.toBeNull();
      expect(result.current.logoImage?.src).toBe(mockSteamAssets.logoUrl);
    });
  });

  it("resets baseImage immediately when tag changes", async () => {
    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue("1245620");
    vi.mocked(appBackend.GetSteamGameAssets).mockResolvedValue(mockSteamAssets);

    const { result, rerender } = renderHook(
      ({ tag }) => useThumbnailAssets(tag),
      { initialProps: { tag: "Elden Ring" } }
    );

    await waitFor(() => {
      expect(result.current.baseImage).not.toBeNull();
    });

    act(() => {
      rerender({ tag: "Dark Souls" });
    });

    // baseImage must be cleared immediately upon tag change
    expect(result.current.baseImage).toBeNull();
    expect(result.current.loadingAssets).toBe(true);

    await waitFor(() => {
      expect(result.current.loadingAssets).toBe(false);
    });
  });

  it("falls back to headerUrl when heroUrl fails to load", async () => {
    const failingHeroAssets: backend.SteamGameAssets = {
      title: "Hades",
      headerUrl: "https://steam.cdn/header.jpg",
      heroUrl: "https://steam.cdn/hero_fail.jpg",
      posterUrl: "https://steam.cdn/poster.jpg",
      logoUrl: "https://steam.cdn/logo.png",
    };

    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue("1145360");
    vi.mocked(appBackend.GetSteamGameAssets).mockResolvedValue(failingHeroAssets);

    const heroConfig: TagThumbnailConfig = {
      enabled: true,
      source_type: "steam",
      steam_asset_type: "hero",
      episode_position: "bottom-left",
      episode_format: "pad2",
    };

    const { result } = renderHook(() =>
      useThumbnailAssets("Hades", heroConfig)
    );

    await waitFor(() => {
      expect(result.current.loadingAssets).toBe(false);
      expect(result.current.baseImage).not.toBeNull();
      // Fell back to headerUrl
      expect(result.current.baseImage?.src).toBe(failingHeroAssets.headerUrl);
    });
  });

  it("sets baseImage to null and finishes loading if both primary and fallback fail", async () => {
    const brokenAssets: backend.SteamGameAssets = {
      title: "Broken Game",
      headerUrl: "https://steam.cdn/header_fail.jpg",
      heroUrl: "https://steam.cdn/hero_fail.jpg",
      posterUrl: "https://steam.cdn/poster_fail.jpg",
      logoUrl: "https://steam.cdn/logo_fail.png",
    };

    vi.mocked(appBackend.GetSteamAppID).mockResolvedValue("999999");
    vi.mocked(appBackend.GetSteamGameAssets).mockResolvedValue(brokenAssets);

    const heroConfig: TagThumbnailConfig = {
      enabled: true,
      source_type: "steam",
      steam_asset_type: "hero",
      episode_position: "bottom-left",
      episode_format: "pad2",
    };

    const { result } = renderHook(() =>
      useThumbnailAssets("Broken Game", heroConfig)
    );

    await waitFor(() => {
      expect(result.current.loadingAssets).toBe(false);
      expect(result.current.baseImage).toBeNull();
    });
  });
});
