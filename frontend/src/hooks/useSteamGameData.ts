import { useState, useEffect } from "react";
import { GetSteamAppID } from "../../wailsjs/go/backend/App";

export interface SteamGameData {
  readonly appId: string;
  readonly heroUrl: string;
  readonly posterUrl: string;
  readonly achievementsPct: number;
}

interface GoAppBackend {
  GetSteamGameAssets?: (appId: string) => Promise<{ heroUrl?: string; posterUrl?: string }>;
  GetSteamGameAchievementPct?: (appId: string) => Promise<number>;
}

interface WindowWithGo extends Window {
  go?: {
    backend?: {
      App?: GoAppBackend;
    };
  };
}

/**
 * Custom hook to retrieve Steam metadata, posters, and achievements for a game title.
 */
export function useSteamGameData(gameName: string): SteamGameData {
  const [appId, setAppId] = useState<string>("");
  const [heroUrl, setHeroUrl] = useState<string>("");
  const [posterUrl, setPosterUrl] = useState<string>("");
  const [achievementsPct, setAchievementsPct] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    if (!gameName || !gameName.trim()) {
      setAppId("");
      setHeroUrl("");
      setPosterUrl("");
      setAchievementsPct(0);
      return;
    }

    GetSteamAppID(gameName)
      .then(async (id: unknown) => {
        const strId = typeof id === "string" ? id : "";
        if (!mounted || !strId || strId === "NOT_FOUND") return;
        setAppId(strId);

        const win = window as unknown as WindowWithGo;
        const goApp = win.go?.backend?.App;
        if (goApp?.GetSteamGameAssets) {
          try {
            const assets = await goApp.GetSteamGameAssets(strId);
            if (mounted) {
              if (assets?.heroUrl) setHeroUrl(assets.heroUrl);
              if (assets?.posterUrl) setPosterUrl(assets.posterUrl);
            }
          } catch (e) {
            console.error(e);
          }
        } else if (mounted) {
          setHeroUrl(
            `https://cdn.akamai.steamstatic.com/steam/apps/${strId}/library_hero.jpg`,
          );
          setPosterUrl(
            `https://cdn.akamai.steamstatic.com/steam/apps/${strId}/library_600x900_2x.jpg`,
          );
        }

        if (goApp?.GetSteamGameAchievementPct) {
          try {
            const pct = await goApp.GetSteamGameAchievementPct(strId);
            if (mounted && typeof pct === "number" && pct > 0) {
              setAchievementsPct(pct);
            }
          } catch (e) {
            console.error(e);
          }
        }
      })
      .catch(console.error);

    return () => {
      mounted = false;
    };
  }, [gameName]);

  return { appId, heroUrl, posterUrl, achievementsPct };
}
