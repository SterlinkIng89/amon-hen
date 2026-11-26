import { useState, useEffect } from "react";
import {
  GetSteamAppID,
  GetSteamGameAssets,
  GetSteamGameAchievementPct,
  GetTagGameArtwork,
} from "../../wailsjs/go/backend/App";
import { GameArtworkConfig } from "../types";

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
 * Custom hook to retrieve Steam metadata, posters, and achievements for a game title,
 * prioritizing user-configured custom artwork when present.
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

    const loadArtwork = async () => {
      const customPromise: Promise<GameArtworkConfig> =
        typeof GetTagGameArtwork === "function"
          ? GetTagGameArtwork(trimmed).catch((err) => {
              console.error(err);
              return {};
            })
          : Promise.resolve({});

      const steamIdPromise: Promise<string> =
        typeof GetSteamAppID === "function"
          ? GetSteamAppID(trimmed)
              .then((id: unknown) => (typeof id === "string" ? id : ""))
              .catch((err) => {
                console.error(err);
                return "";
              })
          : Promise.resolve("");

      const [custom, rawId] = await Promise.all([customPromise, steamIdPromise]);
      if (!mounted) return;

      const customPoster = custom?.poster_url?.trim() || "";
      const customHero = custom?.hero_url?.trim() || "";

      const strId = rawId && rawId !== "NOT_FOUND" ? rawId : "";

      let steamHeroUrl = "";
      let steamPosterUrl = "";
      let steamHeaderUrl = "";
      let achievementsPct = 0;

      if (strId) {
        steamHeroUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${strId}/library_hero.jpg`;
        steamPosterUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${strId}/library_600x900_2x.jpg`;
        steamHeaderUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${strId}/header.jpg`;

        const assetsPromise =
          typeof GetSteamGameAssets === "function"
            ? GetSteamGameAssets(strId).catch((e) => {
                console.error(e);
                return null;
              })
            : Promise.resolve(null);

        const pctPromise =
          typeof GetSteamGameAchievementPct === "function"
            ? GetSteamGameAchievementPct(strId).catch((e) => {
                console.error(e);
                return 0;
              })
            : Promise.resolve(0);

        const [assets, pct] = await Promise.all([assetsPromise, pctPromise]);
        if (assets?.heroUrl) steamHeroUrl = assets.heroUrl;
        if (assets?.posterUrl) steamPosterUrl = assets.posterUrl;
        if (assets?.headerUrl) steamHeaderUrl = assets.headerUrl;
        if (typeof pct === "number" && pct > 0) {
          achievementsPct = pct;
        }
      }

      if (!mounted) return;

      setData({
        appId: strId,
        posterUrl: customPoster || steamPosterUrl,
        heroUrl: customHero || steamHeroUrl,
        headerUrl: customHero || steamHeaderUrl || customPoster,
        achievementsPct,
      });
    };

    void loadArtwork();

    return () => {
      mounted = false;
    };
  }, [gameName]);

  return data;
}
