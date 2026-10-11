import { useState, useEffect } from "react";
import {
  GetSteamAppID,
  GetSteamGameAssets,
  GetSteamGameAchievementPct,
} from "../../wailsjs/go/backend/App";

export interface SteamGameData {
  readonly appId: string;
  readonly heroUrl: string;
  readonly posterUrl: string;
  readonly headerUrl: string;
  readonly achievementsPct: number;
}

const INITIAL_STEAM_DATA: SteamGameData = {
  appId: "",
  heroUrl: "",
  posterUrl: "",
  headerUrl: "",
  achievementsPct: 0,
};

/**
 * Custom hook to retrieve Steam metadata, posters, and achievements for a game title.
 */
export function useSteamGameData(gameName: string): SteamGameData {
  const [data, setData] = useState<SteamGameData>(INITIAL_STEAM_DATA);

  useEffect(() => {
    let mounted = true;
    const trimmed = gameName.trim();

    if (!trimmed) {
      setData(INITIAL_STEAM_DATA);
      return;
    }

    GetSteamAppID(trimmed)
      .then(async (id: unknown) => {
        const strId = typeof id === "string" ? id : "";
        if (!mounted || !strId || strId === "NOT_FOUND") {
          if (mounted) setData(INITIAL_STEAM_DATA);
          return;
        }

        let heroUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${strId}/library_hero.jpg`;
        let posterUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${strId}/library_600x900_2x.jpg`;
        let headerUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${strId}/header.jpg`;
        let achievementsPct = 0;

        if (typeof GetSteamGameAssets === "function") {
          try {
            const assets = await GetSteamGameAssets(strId);
            if (assets?.heroUrl) heroUrl = assets.heroUrl;
            if (assets?.posterUrl) posterUrl = assets.posterUrl;
            if (assets?.headerUrl) headerUrl = assets.headerUrl;
          } catch (e) {
            console.error(e);
          }
        }

        if (typeof GetSteamGameAchievementPct === "function") {
          try {
            const pct = await GetSteamGameAchievementPct(strId);
            if (typeof pct === "number" && pct > 0) {
              achievementsPct = pct;
            }
          } catch (e) {
            console.error(e);
          }
        }

        if (mounted) {
          setData({ appId: strId, heroUrl, posterUrl, headerUrl, achievementsPct });
        }
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setData(INITIAL_STEAM_DATA);
      });

    return () => {
      mounted = false;
    };
  }, [gameName]);

  return data;
}
