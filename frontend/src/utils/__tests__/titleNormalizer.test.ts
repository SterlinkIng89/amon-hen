import { describe, it, expect } from "vitest";
import {
  extractNormalizedFields,
  buildNormalizedTitle,
  evaluateNormalizedTitle,
} from "../titleNormalizer";
import type { GameProfile } from "../../types";

const lolProfile: GameProfile = {
  type: "multiplayer",
  titleTemplate: "{champion} - {event} - {gamemode} - {date}",
  modes: ["ARAM", "ARAM: Mayhem", "Ranked Solo", "Arena"],
};

const eldenRingProfile: GameProfile = {
  type: "singleplayer",
  titleTemplate: "{game} — {date} — {episode}",
};

describe("titleNormalizer", () => {
  describe("extractNormalizedFields & evaluateNormalizedTitle", () => {
    it("parses 'Jinx Cuadrakill - 11 11 2024' with missing gamemode into needs_review", () => {
      const input = {
        currentTitle: "Jinx Cuadrakill - 11 11 2024",
        publishedAt: "2024-11-12T10:00:00Z",
        gameTag: "League of Legends",
        profile: lolProfile,
        recentFieldValues: {
          champion: ["Jinx", "Yasuo", "Ahri"],
        },
      };

      const fields = extractNormalizedFields(input);
      expect(fields.customVars.champion).toBe("Jinx");
      expect(fields.event).toBe("Cuadrakill");
      expect(fields.date).toBe("11/11/24");
      expect(fields.dateSource).toBe("title");
      expect(fields.gameMode).toBe("");

      const result = evaluateNormalizedTitle(input.currentTitle, fields, input);
      expect(result.missingFields).toEqual(["gamemode"]);
      expect(result.status).toBe("needs_review");
    });

    it("parses 'yasuo 1v3 aram clip' using publishedAt fallback into ready", () => {
      const input = {
        currentTitle: "yasuo 1v3 aram clip",
        publishedAt: "2024-05-09T18:30:00Z",
        gameTag: "League of Legends",
        profile: lolProfile,
        recentFieldValues: {
          champion: ["Jinx", "Yasuo"],
        },
      };

      const fields = extractNormalizedFields(input);
      expect(fields.customVars.champion).toBe("Yasuo");
      expect(fields.gameMode).toBe("ARAM");
      expect(fields.event).toBe("1v3");
      expect(fields.date).toBe("9/05/24");
      expect(fields.dateSource).toBe("published");

      const result = evaluateNormalizedTitle(input.currentTitle, fields, input);
      expect(result.missingFields).toEqual([]);
      expect(result.status).toBe("ready");
      expect(result.proposedTitle).toBe("Yasuo - 1v3 - ARAM - 9/05/24");
    });

    it("matches longer mode 'ARAM: Mayhem' before 'ARAM'", () => {
      const input = {
        currentTitle: "Jinx Pentakill ARAM: Mayhem 12/04/2025",
        publishedAt: "2025-04-12T12:00:00Z",
        gameTag: "League of Legends",
        profile: lolProfile,
        recentFieldValues: {
          champion: ["Jinx"],
        },
      };

      const fields = extractNormalizedFields(input);
      expect(fields.gameMode).toBe("ARAM: Mayhem");
      expect(fields.customVars.champion).toBe("Jinx");
      expect(fields.event).toBe("Pentakill");
      expect(fields.date).toBe("12/04/25");
      expect(fields.dateSource).toBe("title");
    });

    it("parses legacy singleplayer titles like 'Elden Ring Ep 14 - 2024-03-05'", () => {
      const input = {
        currentTitle: "Elden Ring Ep 14 - 2024-03-05",
        publishedAt: "2024-03-06T00:00:00Z",
        gameTag: "Elden Ring",
        profile: eldenRingProfile,
        contentType: "vod" as const,
      };

      const fields = extractNormalizedFields(input);
      expect(fields.episode).toBe(14);
      expect(fields.date).toBe("5/03/24");
      expect(fields.dateSource).toBe("title");

      const result = evaluateNormalizedTitle(input.currentTitle, fields, input);
      expect(result.missingFields).toEqual([]);
      expect(result.status).toBe("ready");
      expect(result.proposedTitle).toBe("Elden Ring — 5/03/24 — 14");
    });

    it("parses singleplayer titles with #episode and event text", () => {
      const input = {
        currentTitle: "Hollow Knight #12 Boss Fight",
        publishedAt: "2024-08-20T15:00:00Z",
        gameTag: "Hollow Knight",
        profile: eldenRingProfile,
        contentType: "vod" as const,
      };

      const fields = extractNormalizedFields(input);
      expect(fields.episode).toBe(12);
      expect(fields.event).toBe("Boss Fight");
      expect(fields.date).toBe("20/08/24");
      expect(fields.dateSource).toBe("published");
    });

    it("detects already-normalized titles via titlesMatch and marks them already_normalized", () => {
      const input = {
        currentTitle: "Jinx - Pentakill - ARAM - 11/11/24",
        publishedAt: "2024-11-12T10:00:00Z",
        gameTag: "League of Legends",
        profile: lolProfile,
        recentFieldValues: {
          champion: ["Jinx"],
        },
      };

      const fields = extractNormalizedFields(input);
      const result = evaluateNormalizedTitle(input.currentTitle, fields, input);
      expect(result.missingFields).toEqual([]);
      expect(result.status).toBe("already_normalized");
    });

    it("detects already-normalized singleplayer titles even with dash vs em-dash separator", () => {
      const input = {
        currentTitle: "Elden Ring - 5/03/24 - 14",
        publishedAt: "2024-03-06T00:00:00Z",
        gameTag: "Elden Ring",
        profile: eldenRingProfile,
        contentType: "vod" as const,
      };

      const fields = extractNormalizedFields(input);
      expect(fields.date).toBe("5/03/24");
      expect(fields.episode).toBe(14);

      const result = evaluateNormalizedTitle(input.currentTitle, fields, input);
      expect(result.status).toBe("already_normalized");
    });

    it("keeps noise token 'clip' if no other meaningful event text remains", () => {
      const input = {
        currentTitle: "Jinx ARAM clip",
        publishedAt: "2024-05-09T18:30:00Z",
        gameTag: "League of Legends",
        profile: lolProfile,
        recentFieldValues: {
          champion: ["Jinx"],
        },
      };

      const fields = extractNormalizedFields(input);
      expect(fields.customVars.champion).toBe("Jinx");
      expect(fields.gameMode).toBe("ARAM");
      expect(fields.event).toBe("clip");
    });

    it("handles buildNormalizedTitle for singleplayer clips", () => {
      const title = buildNormalizedTitle(
        {
          event: "Malenia No Hit",
          gameMode: "",
          date: "5/03/24",
          dateSource: "title",
          episode: "",
          customVars: {},
        },
        {
          gameTag: "Elden Ring",
          profile: eldenRingProfile,
          contentType: "clip",
        },
      );
      expect(title).toBe("Elden Ring — 5/03/24 — Malenia No Hit");
    });
  });
});
