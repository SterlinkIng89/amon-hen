import { describe, it, expect } from "vitest";
import {
  generateYouTubeTitle,
  getVideoTitleSegments,
  hasUnfilledPlaceholders,
} from "../videoUtils";
import { VideoFile, GameProfile, YTVideo } from "../../types";

describe("videoUtils - Title generation & placeholder detection", () => {
  const sampleVideo: VideoFile = {
    name: "2026-08-26 14-30-00.mp4",
    path: "/videos/2026-08-26 14-30-00.mp4",
    size: 104857600,
    modTime: 1787754600000,
    folder: "/videos",
    game: "Overwatch 2",
  };

  const multiplayerProfile: GameProfile = {
    type: "multiplayer",
    titleTemplate: "{game} - {event} - {gamemode} - {date}",
    modes: ["Quick Play", "Competitive", "Arcade"],
  };

  describe("generateYouTubeTitle", () => {
    it("generates standard singleplayer title with game and datePart", () => {
      const title = generateYouTubeTitle(
        sampleVideo.name,
        sampleVideo.game,
        sampleVideo.episode,
        undefined,
        undefined,
        undefined,
        undefined,
        sampleVideo.modTime
      );
      expect(title).toBe("Overwatch 2 — 26/08/26");
    });

    it("generates multiplayer title with fallback placeholders when unfilled", () => {
      const title = generateYouTubeTitle(
        sampleVideo.name,
        sampleVideo.game,
        sampleVideo.episode,
        multiplayerProfile,
        undefined,
        undefined,
        undefined,
        sampleVideo.modTime
      );
      expect(title).toBe("Overwatch 2 - Title - Mode - 26/08/26");
    });

    it("generates multiplayer title with user-provided fields when filled", () => {
      const title = generateYouTubeTitle(
        sampleVideo.name,
        sampleVideo.game,
        sampleVideo.episode,
        multiplayerProfile,
        "Grand Finals",
        "Competitive",
        undefined,
        sampleVideo.modTime
      );
      expect(title).toBe("Overwatch 2 - Grand Finals - Competitive - 26/08/26");
    });

    it("handles custom variables in titleTemplate", () => {
      const customProfile: GameProfile = {
        type: "multiplayer",
        titleTemplate: "{game} | {event} | {gamemode} | {map} | {hero} | {date}",
      };
      const titleWithFallbacks = generateYouTubeTitle(
        sampleVideo.name,
        sampleVideo.game,
        sampleVideo.episode,
        customProfile,
        "",
        "",
        {},
        sampleVideo.modTime
      );
      expect(titleWithFallbacks).toBe("Overwatch 2 | Title | Mode | Map | Hero | 26/08/26");

      const titleFilled = generateYouTubeTitle(
        sampleVideo.name,
        sampleVideo.game,
        sampleVideo.episode,
        customProfile,
        "Clash",
        "Ranked",
        { map: "King's Row", hero: "Tracer" },
        sampleVideo.modTime
      );
      expect(titleFilled).toBe("Overwatch 2 | Clash | Ranked | King's Row | Tracer | 26/08/26");
    });
  });

  describe("getVideoTitleSegments", () => {
    it("returns single segment for YTVideo", () => {
      const ytVid: YTVideo = {
        id: "yt-123",
        title: "YouTube Video Title",
        description: "",
        publishedAt: "2026-01-01T00:00:00Z",
        thumbnailUrl: "https://example.com/thumb.jpg",
        viewCount: 10,
        likeCount: 2,
        duration: "PT5M",
        privacy: "public",
        localFile: "",
      };

      const result = getVideoTitleSegments(ytVid);
      expect(result.fullTitle).toBe("YouTube Video Title");
      expect(result.hasPlaceholders).toBe(false);
      expect(result.segments).toEqual([
        { text: "YouTube Video Title", isPlaceholder: false },
      ]);
    });

    it("identifies unfilled placeholder variables in multiplayer profile", () => {
      const video: VideoFile = {
        ...sampleVideo,
        event: "",
        gameMode: "",
      };

      const result = getVideoTitleSegments(video, multiplayerProfile);
      expect(result.fullTitle).toBe("Overwatch 2 - Title - Mode - 26/08/26");
      expect(result.hasPlaceholders).toBe(true);

      expect(result.segments).toEqual([
        { text: "Overwatch 2", isGameTag: true, isPlaceholder: false },
        { text: " - ", isPlaceholder: false },
        { text: "Title", isPlaceholder: true, varName: "event" },
        { text: " - ", isPlaceholder: false },
        { text: "Mode", isPlaceholder: true, varName: "gamemode" },
        { text: " - ", isPlaceholder: false },
        { text: "26/08/26", isPlaceholder: false },
      ]);
    });

    it("identifies partially filled variables in multiplayer profile", () => {
      const video: VideoFile = {
        ...sampleVideo,
        event: "Scrimmage",
        gameMode: "",
      };

      const result = getVideoTitleSegments(video, multiplayerProfile);
      expect(result.fullTitle).toBe("Overwatch 2 - Scrimmage - Mode - 26/08/26");
      expect(result.hasPlaceholders).toBe(true);

      expect(result.segments).toEqual([
        { text: "Overwatch 2", isGameTag: true, isPlaceholder: false },
        { text: " - ", isPlaceholder: false },
        { text: "Scrimmage", isPlaceholder: false },
        { text: " - ", isPlaceholder: false },
        { text: "Mode", isPlaceholder: true, varName: "gamemode" },
        { text: " - ", isPlaceholder: false },
        { text: "26/08/26", isPlaceholder: false },
      ]);
    });

    it("returns no placeholders when all fields are filled", () => {
      const video: VideoFile = {
        ...sampleVideo,
        event: "Championship",
        gameMode: "Payload",
      };

      const result = getVideoTitleSegments(video, multiplayerProfile);
      expect(result.fullTitle).toBe("Overwatch 2 - Championship - Payload - 26/08/26");
      expect(result.hasPlaceholders).toBe(false);

      expect(result.segments).toEqual([
        { text: "Overwatch 2", isGameTag: true, isPlaceholder: false },
        { text: " - ", isPlaceholder: false },
        { text: "Championship", isPlaceholder: false },
        { text: " - ", isPlaceholder: false },
        { text: "Payload", isPlaceholder: false },
        { text: " - ", isPlaceholder: false },
        { text: "26/08/26", isPlaceholder: false },
      ]);
    });

    it("handles custom variables and highlights unfilled ones", () => {
      const customProfile: GameProfile = {
        type: "multiplayer",
        titleTemplate: "{game} | {event} | {map} | {date}",
      };

      const video: VideoFile = {
        ...sampleVideo,
        event: "Tournament",
        customVars: { map: "" },
      };

      const result = getVideoTitleSegments(video, customProfile);
      expect(result.fullTitle).toBe("Overwatch 2 | Tournament | Map | 26/08/26");
      expect(result.hasPlaceholders).toBe(true);

      expect(result.segments).toEqual([
        { text: "Overwatch 2", isGameTag: true, isPlaceholder: false },
        { text: " | ", isPlaceholder: false },
        { text: "Tournament", isPlaceholder: false },
        { text: " | ", isPlaceholder: false },
        { text: "Map", isPlaceholder: true, varName: "map" },
        { text: " | ", isPlaceholder: false },
        { text: "26/08/26", isPlaceholder: false },
      ]);
    });

    it("handles raw placeholders in manual youtubeTitle", () => {
      const video: VideoFile = {
        ...sampleVideo,
        youtubeTitle: "My Epic Match {event} - {gamemode}",
      };

      const result = getVideoTitleSegments(video);
      expect(result.fullTitle).toBe("My Epic Match {event} - {gamemode}");
      expect(result.hasPlaceholders).toBe(true);

      expect(result.segments).toEqual([
        { text: "My Epic Match ", isPlaceholder: false },
        { text: "{event}", isPlaceholder: true, varName: "event" },
        { text: " - ", isPlaceholder: false },
        { text: "{gamemode}", isPlaceholder: true, varName: "gamemode" },
      ]);
    });

    it("handles singleplayer video without profile or with singleplayer profile", () => {
      const video: VideoFile = {
        ...sampleVideo,
        episode: 3,
      };

      const result = getVideoTitleSegments(video, { type: "singleplayer", titleTemplate: "" });
      expect(result.fullTitle).toBe("Overwatch 2 — 26/08/26 — 3");
      expect(result.hasPlaceholders).toBe(false);
      expect(result.segments).toEqual([
        { text: "Overwatch 2", isGameTag: true, isPlaceholder: false },
        { text: " — 26/08/26 — 3", isPlaceholder: false },
      ]);
    });
  });

  describe("hasUnfilledPlaceholders", () => {
    it("returns true when multiplayer profile has unfilled variables", () => {
      const video: VideoFile = { ...sampleVideo, event: "", gameMode: "" };
      expect(hasUnfilledPlaceholders(video, multiplayerProfile)).toBe(true);
    });

    it("returns false when multiplayer profile has all variables filled", () => {
      const video: VideoFile = { ...sampleVideo, event: "Match", gameMode: "Competitive" };
      expect(hasUnfilledPlaceholders(video, multiplayerProfile)).toBe(false);
    });

    it("returns false for standard singleplayer video", () => {
      expect(hasUnfilledPlaceholders(sampleVideo)).toBe(false);
    });
  });
});
