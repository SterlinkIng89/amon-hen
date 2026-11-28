import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSteamGameData } from "../useSteamGameData";
import * as AppBindings from "../../../wailsjs/go/backend/App";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetSteamAppID: vi.fn(),
  GetSteamGameAssets: vi.fn(),
  GetSteamGameAchievementPct: vi.fn(),
  GetTagGameArtwork: vi.fn(),
}));

describe("useSteamGameData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AppBindings.GetSteamGameAssets).mockResolvedValue({} as never);
    vi.mocked(AppBindings.GetSteamGameAchievementPct).mockResolvedValue(0);
  });

  it("returns custom artwork for non-Steam games when GetSteamAppID returns NOT_FOUND", async () => {
    vi.mocked(AppBindings.GetSteamAppID).mockResolvedValue("NOT_FOUND");
    vi.mocked(AppBindings.GetTagGameArtwork).mockResolvedValue({
      poster_url: "/cache/game_artwork/lol_poster.png",
      hero_url: "https://example.com/lol-hero.jpg",
    } as never);

    const { result } = renderHook(() => useSteamGameData("League of Legends"));

    await waitFor(() => {
      expect(result.current.posterUrl).toBe("/cache/game_artwork/lol_poster.png");
    });

    expect(result.current.appId).toBe("");
    expect(result.current.heroUrl).toBe("https://example.com/lol-hero.jpg");
    expect(result.current.headerUrl).toBe("https://example.com/lol-hero.jpg");
    expect(result.current.achievementsPct).toBe(0);
  });

  it("prioritizes custom artwork over Steam artwork when both exist", async () => {
    vi.mocked(AppBindings.GetSteamAppID).mockResolvedValue("1245620");
    vi.mocked(AppBindings.GetSteamGameAssets).mockResolvedValue({
      heroUrl: "https://steam.example/hero.jpg",
      posterUrl: "https://steam.example/poster.jpg",
      headerUrl: "https://steam.example/header.jpg",
    } as never);
    vi.mocked(AppBindings.GetSteamGameAchievementPct).mockResolvedValue(42);
    vi.mocked(AppBindings.GetTagGameArtwork).mockResolvedValue({
      poster_url: "https://custom.example/poster.jpg",
      hero_url: "",
    } as never);

    const { result } = renderHook(() => useSteamGameData("Elden Ring"));

    await waitFor(() => {
      expect(result.current.appId).toBe("1245620");
    });

    expect(result.current.posterUrl).toBe("https://custom.example/poster.jpg");
    expect(result.current.heroUrl).toBe("https://steam.example/hero.jpg");
    expect(result.current.headerUrl).toBe("https://steam.example/header.jpg");
    expect(result.current.achievementsPct).toBe(42);
  });

  it("falls back to Steam artwork cleanly when custom artwork is empty", async () => {
    vi.mocked(AppBindings.GetSteamAppID).mockResolvedValue("1245620");
    vi.mocked(AppBindings.GetSteamGameAssets).mockResolvedValue({
      heroUrl: "https://steam.example/hero.jpg",
      posterUrl: "https://steam.example/poster.jpg",
      headerUrl: "https://steam.example/header.jpg",
    } as never);
    vi.mocked(AppBindings.GetTagGameArtwork).mockResolvedValue({} as never);

    const { result } = renderHook(() => useSteamGameData("Elden Ring"));

    await waitFor(() => {
      expect(result.current.posterUrl).toBe("https://steam.example/poster.jpg");
    });

    expect(result.current.heroUrl).toBe("https://steam.example/hero.jpg");
    expect(result.current.headerUrl).toBe("https://steam.example/header.jpg");
  });

  it("returns empty data when gameName is blank", () => {
    const { result } = renderHook(() => useSteamGameData("   "));

    expect(result.current.appId).toBe("");
    expect(result.current.posterUrl).toBe("");
    expect(result.current.heroUrl).toBe("");
    expect(AppBindings.GetSteamAppID).not.toHaveBeenCalled();
  });
});
