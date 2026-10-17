import { describe, it, expect } from "vitest";
import {
  matchesPlaytimeBucket,
  matchesAchievementFilter,
  splitSteamCompanies,
  splitSteamTags,
  filterSteamGames,
  computeSmartBacklogSuggestions,
  pickBacklogRouletteGame,
  SteamGameInsight,
} from "../steamInsightsUtils";

describe("steamInsightsUtils", () => {
  const baseGame: SteamGameInsight = {
    appid: 1001,
    name: "Elden Ring",
    playtimeHours: 100,
    playtimeForever: 6000,
    playtime2Weeks: 0,
    headerUrl: "https://example.com/header.jpg",
    posterUrl: "https://example.com/poster.jpg",
    achievementsPct: 100,
    developers: "FromSoftware, Inc.",
    publishers: "Bandai Namco Entertainment",
    genres: "Action, RPG, Open World",
    isUtility: false,
    ytVideosCount: 5,
    ytRecordedHours: 12.5,
  };

  describe("matchesPlaytimeBucket", () => {
    it("handles 'all' bucket", () => {
      expect(matchesPlaytimeBucket(0, "all")).toBe(true);
      expect(matchesPlaytimeBucket(50, "all")).toBe(true);
      expect(matchesPlaytimeBucket(5000, "all")).toBe(true);
    });

    it("handles 'unplayed' bucket (0 min)", () => {
      expect(matchesPlaytimeBucket(0, "unplayed")).toBe(true);
      expect(matchesPlaytimeBucket(1, "unplayed")).toBe(false);
    });

    it("handles 'tried' bucket (>0 and <120 min)", () => {
      expect(matchesPlaytimeBucket(0, "tried")).toBe(false);
      expect(matchesPlaytimeBucket(1, "tried")).toBe(true);
      expect(matchesPlaytimeBucket(119, "tried")).toBe(true);
      expect(matchesPlaytimeBucket(120, "tried")).toBe(false);
    });

    it("handles 'played' bucket (>=120 and <3000 min)", () => {
      expect(matchesPlaytimeBucket(119, "played")).toBe(false);
      expect(matchesPlaytimeBucket(120, "played")).toBe(true);
      expect(matchesPlaytimeBucket(2999, "played")).toBe(true);
      expect(matchesPlaytimeBucket(3000, "played")).toBe(false);
    });

    it("handles 'obsession' bucket (>=3000 min)", () => {
      expect(matchesPlaytimeBucket(2999, "obsession")).toBe(false);
      expect(matchesPlaytimeBucket(3000, "obsession")).toBe(true);
      expect(matchesPlaytimeBucket(10000, "obsession")).toBe(true);
    });
  });

  describe("matchesAchievementFilter", () => {
    it("matches 'all' criteria unconditionally", () => {
      expect(matchesAchievementFilter(baseGame, "all")).toBe(true);
    });

    it("matches 'perfect' when achievementsPct rounds to 100", () => {
      expect(matchesAchievementFilter({ ...baseGame, achievementsPct: 100 }, "perfect")).toBe(true);
      expect(matchesAchievementFilter({ ...baseGame, achievementsPct: 99.6 }, "perfect")).toBe(true);
      expect(matchesAchievementFilter({ ...baseGame, achievementsPct: 99.4 }, "perfect")).toBe(false);
    });

    it("matches 'almost_there' when achievementsPct >= 75 and < 100", () => {
      expect(matchesAchievementFilter({ ...baseGame, achievementsPct: 75 }, "almost_there")).toBe(true);
      expect(matchesAchievementFilter({ ...baseGame, achievementsPct: 99.4 }, "almost_there")).toBe(true);
      expect(matchesAchievementFilter({ ...baseGame, achievementsPct: 99.6 }, "almost_there")).toBe(false);
      expect(matchesAchievementFilter({ ...baseGame, achievementsPct: 74.9 }, "almost_there")).toBe(false);
    });

    it("matches 'unrecorded_gems' when playtime >= 1200 min and ytVideosCount is 0", () => {
      expect(
        matchesAchievementFilter(
          { ...baseGame, playtimeForever: 1200, ytVideosCount: 0 },
          "unrecorded_gems"
        )
      ).toBe(true);
      expect(
        matchesAchievementFilter(
          { ...baseGame, playtimeForever: 1199, ytVideosCount: 0 },
          "unrecorded_gems"
        )
      ).toBe(false);
      expect(
        matchesAchievementFilter(
          { ...baseGame, playtimeForever: 2000, ytVideosCount: 1 },
          "unrecorded_gems"
        )
      ).toBe(false);
    });
  });

  describe("splitSteamCompanies & splitSteamTags", () => {
    it("splits studios and re-attaches corporate suffixes", () => {
      expect(splitSteamCompanies("FromSoftware, Inc.")).toEqual(["FromSoftware, Inc."]);
      expect(
        splitSteamCompanies("FromSoftware, Inc., Bandai Namco Entertainment, Valve")
      ).toEqual(["FromSoftware, Inc.", "Bandai Namco Entertainment", "Valve"]);
      expect(
        splitSteamCompanies("Sony, Interactive Entertainment, Guerrilla Games")
      ).toEqual(["Sony Interactive Entertainment", "Guerrilla Games"]);
      expect(splitSteamCompanies("Inc., Ltd.")).toEqual([]);
      expect(splitSteamCompanies("")).toEqual([]);
    });

    it("splits tags and trims whitespace", () => {
      expect(splitSteamTags("Action, RPG,  Indie ")).toEqual(["Action", "RPG", "Indie"]);
      expect(splitSteamTags("")).toEqual([]);
    });
  });

  describe("filterSteamGames", () => {
    const games: SteamGameInsight[] = [
      {
        ...baseGame,
        appid: 1,
        name: "Dark Souls III",
        playtimeForever: 4500, // obsession
        achievementsPct: 100, // perfect
        developers: "FromSoftware, Inc.",
        publishers: "Bandai Namco",
        genres: "Action, RPG, Dark Fantasy",
        ytVideosCount: 10,
      },
      {
        ...baseGame,
        appid: 2,
        name: "Hollow Knight",
        playtimeForever: 1800, // played (30h)
        achievementsPct: 80, // almost_there
        developers: "Team Cherry",
        publishers: "Team Cherry",
        genres: "Metroidvania, 2D, Indie",
        ytVideosCount: 0, // unrecorded gem (1800 >= 1200 and 0 yt videos)
      },
      {
        ...baseGame,
        appid: 3,
        name: "Nine Sols",
        playtimeForever: 60, // tried (1h)
        achievementsPct: 20,
        developers: "Red Candle Games",
        publishers: "Red Candle Games",
        genres: "Action, Metroidvania, 2D",
        ytVideosCount: 1,
      },
      {
        ...baseGame,
        appid: 4,
        name: "Silksong",
        playtimeForever: 0, // unplayed
        achievementsPct: 0,
        developers: "Team Cherry",
        publishers: "Team Cherry",
        genres: "Metroidvania, Adventure",
        ytVideosCount: 0,
      },
    ];

    it("filters by playtime bucket", () => {
      expect(filterSteamGames(games, { bucket: "unplayed" })).toEqual([games[3]]);
      expect(filterSteamGames(games, { bucket: "tried" })).toEqual([games[2]]);
      expect(filterSteamGames(games, { bucket: "played" })).toEqual([games[1]]);
      expect(filterSteamGames(games, { bucket: "obsession" })).toEqual([games[0]]);
      expect(filterSteamGames(games, { bucket: "all" })).toHaveLength(4);
    });

    it("filters by achievement / channel filter", () => {
      expect(filterSteamGames(games, { achievementFilter: "perfect" })).toEqual([games[0]]);
      expect(filterSteamGames(games, { achievementFilter: "almost_there" })).toEqual([games[1]]);
      expect(filterSteamGames(games, { achievementFilter: "unrecorded_gems" })).toEqual([games[1]]);
    });

    it("filters by developer token matching with corporate suffixes", () => {
      expect(filterSteamGames(games, { developer: "FromSoftware, Inc." })).toEqual([games[0]]);
      expect(filterSteamGames(games, { developer: "fromsoftware, inc." })).toEqual([games[0]]);
      expect(filterSteamGames(games, { developer: "Team Cherry" })).toEqual([games[1], games[3]]);
    });

    it("filters by publisher token matching", () => {
      expect(filterSteamGames(games, { publisher: "Red Candle Games" })).toEqual([games[2]]);
    });

    it("filters by tag / genre token matching", () => {
      expect(filterSteamGames(games, { tag: "Metroidvania" })).toEqual([
        games[1],
        games[2],
        games[3],
      ]);
    });

    it("filters by search substring across name, developers, and genres", () => {
      expect(filterSteamGames(games, { search: "souls" })).toEqual([games[0]]);
      expect(filterSteamGames(games, { search: "candle" })).toEqual([games[2]]);
      expect(filterSteamGames(games, { search: "action" })).toEqual([games[0], games[2]]);
    });
  });

  describe("computeSmartBacklogSuggestions", () => {
    const candidateGames: SteamGameInsight[] = [
      {
        ...baseGame,
        appid: 10,
        name: "Bloodborne PSX Demake",
        playtimeForever: 0,
        developers: "FromSoftware, Inc.",
        genres: "Action, RPG, Retro",
      },
      {
        ...baseGame,
        appid: 20,
        name: "Sekiro",
        playtimeForever: 60,
        developers: "FromSoftware, Inc.",
        genres: "Action, Adventure",
      },
      {
        ...baseGame,
        appid: 30,
        name: "Animal Crossing",
        playtimeForever: 0,
        developers: "Nintendo",
        genres: "Casual, Simulation",
      },
      {
        ...baseGame,
        appid: 40,
        name: "Played Game",
        playtimeForever: 150, // >= 120 -> excluded
        developers: "FromSoftware, Inc.",
        genres: "Action",
      },
      {
        ...baseGame,
        appid: 50,
        name: "Utility Tool",
        playtimeForever: 0,
        isUtility: true, // excluded
        developers: "FromSoftware, Inc.",
        genres: "Action",
      },
      {
        ...baseGame,
        appid: 60,
        name: "Queued Game",
        playtimeForever: 0,
        backlogStatus: "candidate", // excluded
        developers: "FromSoftware, Inc.",
        genres: "Action",
      },
    ];

    it("scores candidate games based on top genres and developers", () => {
      const topGenres = ["Action", "RPG", "Open World", "Retro", "Indie"];
      const topDevs = ["FromSoftware, Inc."];

      // Bloodborne PSX:
      // Dev match: FromSoftware, Inc. (+3)
      // Top 3 Genre match: Action (+2), RPG (+2)
      // Top 4-8 Genre match: Retro (+1)
      // Score = 3 + 2 + 2 + 1 = 8
      //
      // Sekiro:
      // Dev match: FromSoftware, Inc. (+3)
      // Top 3 Genre match: Action (+2)
      // Score = 3 + 2 = 5
      //
      // Animal Crossing:
      // Dev match: 0, Genre match: 0 -> Score = 0 -> excluded

      const suggestions = computeSmartBacklogSuggestions(
        candidateGames,
        topGenres,
        topDevs
      );

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].game.appid).toBe(10);
      expect(suggestions[0].score).toBe(8);
      expect(suggestions[0].matchReasons).toContain("By FromSoftware, Inc.");
      expect(suggestions[0].matchReasons).toContain("Action");
      expect(suggestions[0].matchReasons).toContain("RPG");
      expect(suggestions[0].matchReasons).toContain("Retro");

      expect(suggestions[1].game.appid).toBe(20);
      expect(suggestions[1].score).toBe(5);
    });

    it("respects limit parameter", () => {
      const topGenres = ["Action"];
      const topDevs = ["FromSoftware, Inc."];
      const suggestions = computeSmartBacklogSuggestions(
        candidateGames,
        topGenres,
        topDevs,
        1
      );
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].game.appid).toBe(10);
    });
  });

  describe("pickBacklogRouletteGame", () => {
    const pool: SteamGameInsight[] = [
      {
        ...baseGame,
        appid: 101,
        name: "Game A",
        playtimeForever: 30,
        genres: "Action, Indie",
        backlogStatus: undefined,
      },
      {
        ...baseGame,
        appid: 102,
        name: "Game B",
        playtimeForever: 0,
        genres: "RPG, Adventure",
        backlogStatus: "candidate",
      },
      {
        ...baseGame,
        appid: 103,
        name: "Game C - Dropped",
        playtimeForever: 50,
        genres: "Action",
        backlogStatus: "dropped", // excluded
      },
      {
        ...baseGame,
        appid: 104,
        name: "Game D - Playing",
        playtimeForever: 50,
        genres: "Action",
        backlogStatus: "playing", // excluded
      },
      {
        ...baseGame,
        appid: 105,
        name: "Game E - Played Too Long",
        playtimeForever: 120, // >= 120 -> excluded
        genres: "Action",
      },
      {
        ...baseGame,
        appid: 106,
        name: "Game F - Utility",
        playtimeForever: 0,
        isUtility: true, // excluded
        genres: "Action",
      },
    ];

    it("picks deterministically with custom randomFn", () => {
      // eligible pool: Game A (index 0), Game B (index 1)
      const pickFirst = pickBacklogRouletteGame(pool, null, () => 0.1);
      expect(pickFirst?.appid).toBe(101);

      const pickSecond = pickBacklogRouletteGame(pool, null, () => 0.9);
      expect(pickSecond?.appid).toBe(102);
    });

    it("filters eligible games by genre when specified", () => {
      // genre "RPG" -> only Game B is eligible
      const pickRpg = pickBacklogRouletteGame(pool, "RPG", () => 0.5);
      expect(pickRpg?.appid).toBe(102);
    });

    it("returns null when pool is empty or no games match", () => {
      expect(pickBacklogRouletteGame(pool, "Horror")).toBeNull();
      expect(pickBacklogRouletteGame([])).toBeNull();
    });
  });
});
