import { describe, it, expect } from "vitest";
import {
  generateYouTubeTitle,
  getVideoTitleSegments,
  hasUnfilledPlaceholders,
  formatTimeWithSubseconds,
  computeInitialClipRange,
  formatPlaytimeHoursMinutes,
  resolveDisplayTitle,
  extractEpisodeFromTitle,
  resolveVideoEpisode,
  computeDefaultClipTitle,
  groupVideos,
  extractGamePrefixFromTitle,
  groupVideosYT,
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
        sampleVideo.modTime,
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
        sampleVideo.modTime,
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
        sampleVideo.modTime,
      );
      expect(title).toBe("Overwatch 2 - Grand Finals - Competitive - 26/08/26");
    });

    it("handles custom variables in titleTemplate", () => {
      const customProfile: GameProfile = {
        type: "multiplayer",
        titleTemplate:
          "{game} | {event} | {gamemode} | {map} | {hero} | {date}",
      };
      const titleWithFallbacks = generateYouTubeTitle(
        sampleVideo.name,
        sampleVideo.game,
        sampleVideo.episode,
        customProfile,
        "",
        "",
        {},
        sampleVideo.modTime,
      );
      expect(titleWithFallbacks).toBe(
        "Overwatch 2 | Title | Mode | Map | Hero | 26/08/26",
      );

      const titleFilled = generateYouTubeTitle(
        sampleVideo.name,
        sampleVideo.game,
        sampleVideo.episode,
        customProfile,
        "Clash",
        "Ranked",
        { map: "King's Row", hero: "Tracer" },
        sampleVideo.modTime,
      );
      expect(titleFilled).toBe(
        "Overwatch 2 | Clash | Ranked | King's Row | Tracer | 26/08/26",
      );
    });

    it("generates clip title with event title without episode number", () => {
      const title = generateYouTubeTitle(
        "2026-08-26_clip.mp4",
        "Overwatch 2",
        5, // even if episode is passed, clip shouldn't use it
        undefined,
        "Sick 5k",
        undefined,
        undefined,
        sampleVideo.modTime,
        " - ",
        "clip",
      );
      expect(title).toBe("Overwatch 2 - 26/08/26 - Sick 5k");
    });

    it("generates clip title with filename fallback when event is empty", () => {
      const title = generateYouTubeTitle(
        "2026-08-26_Insane_Flick.mp4",
        "Valorant",
        0,
        undefined,
        "",
        undefined,
        undefined,
        sampleVideo.modTime,
        " - ",
        "clip",
      );
      expect(title).toBe("Valorant - 26/08/26 - Insane_Flick");
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
      expect(result.fullTitle).toBe(
        "Overwatch 2 - Scrimmage - Mode - 26/08/26",
      );
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
      expect(result.fullTitle).toBe(
        "Overwatch 2 - Championship - Payload - 26/08/26",
      );
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
      expect(result.fullTitle).toBe(
        "Overwatch 2 | Tournament | Map | 26/08/26",
      );
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

      const result = getVideoTitleSegments(video, {
        type: "singleplayer",
        titleTemplate: "",
      });
      expect(result.fullTitle).toBe("Overwatch 2 — 26/08/26 — 3");
      expect(result.hasPlaceholders).toBe(false);
      expect(result.segments).toEqual([
        { text: "Overwatch 2", isGameTag: true, isPlaceholder: false },
        { text: " — 26/08/26 — 3", isPlaceholder: false },
      ]);
    });

    it("highlights game tag when YTVideo has matching gameTag", () => {
      const ytVideo: YTVideo = {
        id: "yt-1",
        title: "CONTROL Resonant - Ep 1",
        description: "",
        publishedAt: "2026-10-19T10:00:00Z",
        thumbnailUrl: "",
        viewCount: 10,
        likeCount: 2,
        duration: "PT10M",
        privacy: "public",
        gameTag: "CONTROL Resonant",
      };

      const result = getVideoTitleSegments(ytVideo);
      expect(result.fullTitle).toBe("CONTROL Resonant - Ep 1");
      expect(result.hasPlaceholders).toBe(false);
      expect(result.segments).toEqual([
        { text: "CONTROL Resonant", isGameTag: true, isPlaceholder: false },
        { text: " - Ep 1", isPlaceholder: false },
      ]);
    });

    it("extracts and highlights game tag prefix before separator when YTVideo has no gameTag", () => {
      const ytVideo: YTVideo = {
        id: "yt-2",
        title: "CONTROL Resonant - 19/10/26 - 31",
        description: "",
        publishedAt: "2026-10-19T10:00:00Z",
        thumbnailUrl: "",
        viewCount: 10,
        likeCount: 2,
        duration: "PT10M",
        privacy: "public",
      };

      const result = getVideoTitleSegments(ytVideo);
      expect(result.fullTitle).toBe("CONTROL Resonant - 19/10/26 - 31");
      expect(result.hasPlaceholders).toBe(false);
      expect(result.segments).toEqual([
        { text: "CONTROL Resonant", isGameTag: true, isPlaceholder: false },
        { text: " - 19/10/26 - 31", isPlaceholder: false },
      ]);
    });

    it("supports em-dash separator when extracting game tag prefix for YTVideo", () => {
      const ytVideo: YTVideo = {
        id: "yt-3",
        title: "Hollow Knight — 20/10/26 — 5",
        description: "",
        publishedAt: "2026-10-20T10:00:00Z",
        thumbnailUrl: "",
        viewCount: 5,
        likeCount: 1,
        duration: "PT15M",
        privacy: "unlisted",
      };

      const result = getVideoTitleSegments(ytVideo);
      expect(result.fullTitle).toBe("Hollow Knight — 20/10/26 — 5");
      expect(result.segments).toEqual([
        { text: "Hollow Knight", isGameTag: true, isPlaceholder: false },
        { text: " — 20/10/26 — 5", isPlaceholder: false },
      ]);
    });

    it("does not treat pure date prefix as game tag for YTVideo", () => {
      const ytVideo: YTVideo = {
        id: "yt-4",
        title: "19/10/26 - Stream Highlights",
        description: "",
        publishedAt: "2026-10-19T10:00:00Z",
        thumbnailUrl: "",
        viewCount: 10,
        likeCount: 2,
        duration: "PT10M",
        privacy: "public",
      };

      const result = getVideoTitleSegments(ytVideo);
      expect(result.fullTitle).toBe("19/10/26 - Stream Highlights");
      expect(result.segments).toEqual([
        { text: "19/10/26 - Stream Highlights", isPlaceholder: false },
      ]);
    });

    it("returns single plain segment when YTVideo has no separator and no gameTag", () => {
      const ytVideo: YTVideo = {
        id: "yt-5",
        title: "Just a Random Video Title",
        description: "",
        publishedAt: "2026-10-19T10:00:00Z",
        thumbnailUrl: "",
        viewCount: 10,
        likeCount: 2,
        duration: "PT10M",
        privacy: "public",
      };

      const result = getVideoTitleSegments(ytVideo);
      expect(result.fullTitle).toBe("Just a Random Video Title");
      expect(result.segments).toEqual([
        { text: "Just a Random Video Title", isPlaceholder: false },
      ]);
    });
  });

  describe("hasUnfilledPlaceholders", () => {
    it("returns true when multiplayer profile has unfilled variables", () => {
      const video: VideoFile = { ...sampleVideo, event: "", gameMode: "" };
      expect(hasUnfilledPlaceholders(video, multiplayerProfile)).toBe(true);
    });

    it("returns false when multiplayer profile has all variables filled", () => {
      const video: VideoFile = {
        ...sampleVideo,
        event: "Match",
        gameMode: "Competitive",
      };
      expect(hasUnfilledPlaceholders(video, multiplayerProfile)).toBe(false);
    });

    it("returns false for standard singleplayer video", () => {
      expect(hasUnfilledPlaceholders(sampleVideo)).toBe(false);
    });
  });

  describe("formatTimeWithSubseconds", () => {
    it("formats minutes and seconds under an hour with subseconds", () => {
      expect(formatTimeWithSubseconds(0)).toBe("00:00.0");
      expect(formatTimeWithSubseconds(14.5)).toBe("00:14.5");
      expect(formatTimeWithSubseconds(75.3)).toBe("01:15.3");
      expect(formatTimeWithSubseconds(3599.9)).toBe("59:59.9");
    });

    it("formats hours, minutes, and seconds when exceeding 1 hour", () => {
      expect(formatTimeWithSubseconds(3600)).toBe("1:00:00.0");
      expect(formatTimeWithSubseconds(3665.4)).toBe("1:01:05.4");
      expect(formatTimeWithSubseconds(10800.8)).toBe("3:00:00.8");
    });

    it("handles negative values cleanly by clamping to zero", () => {
      expect(formatTimeWithSubseconds(-5)).toBe("00:00.0");
    });
  });

  describe("computeInitialClipRange", () => {
    it("returns full range when total duration is 30s or less", () => {
      expect(computeInitialClipRange(10, 20)).toEqual({ inPoint: 0, outPoint: 20 });
      expect(computeInitialClipRange(0, 30)).toEqual({ inPoint: 0, outPoint: 30 });
    });

    it("centers on anchor when within middle of video", () => {
      expect(computeInitialClipRange(3600, 7200)).toEqual({ inPoint: 3585, outPoint: 3615 });
    });

    it("clamps to start if anchor is near beginning", () => {
      expect(computeInitialClipRange(5, 600)).toEqual({ inPoint: 0, outPoint: 30 });
    });

    it("clamps to end if anchor is near video finish", () => {
      expect(computeInitialClipRange(595, 600)).toEqual({ inPoint: 570, outPoint: 600 });
    });
  });

  describe("formatPlaytimeHoursMinutes", () => {
    it("handles 0, negative, and NaN cleanly", () => {
      expect(formatPlaytimeHoursMinutes(0)).toBe("0m");
      expect(formatPlaytimeHoursMinutes(-2)).toBe("0m");
      expect(formatPlaytimeHoursMinutes(NaN)).toBe("0m");
    });

    it("handles values under 1 minute", () => {
      expect(formatPlaytimeHoursMinutes(0.005)).toBe("<1m");
    });

    it("formats minutes without hour prefix when under 1 hour", () => {
      expect(formatPlaytimeHoursMinutes(0.5)).toBe("30m");
      expect(formatPlaytimeHoursMinutes(0.75)).toBe("45m");
      expect(formatPlaytimeHoursMinutes(1 / 60)).toBe("1m");
    });

    it("formats hours and zero-padded minutes", () => {
      expect(formatPlaytimeHoursMinutes(1)).toBe("1h 00m");
      expect(formatPlaytimeHoursMinutes(1.05)).toBe("1h 03m");
      expect(formatPlaytimeHoursMinutes(12.5)).toBe("12h 30m");
    });

    it("formats large multi-day playtime totals", () => {
      expect(formatPlaytimeHoursMinutes(50.25)).toBe("50h 15m");
      expect(formatPlaytimeHoursMinutes(120.75)).toBe("120h 45m");
    });

    it("handles rounding near boundaries", () => {
      expect(formatPlaytimeHoursMinutes(1.999)).toBe("2h 00m");
    });
  });

  describe("resolveDisplayTitle", () => {
    it("returns manual youtubeTitle if present and non-empty", () => {
      const vid: VideoFile = {
        name: "test.mp4",
        path: "/path/test.mp4",
        size: 100,
        modTime: 1787754600000,
        folder: "/path",
        game: "Hades",
        youtubeTitle: "Custom Manual Title Here",
      };
      expect(resolveDisplayTitle(vid)).toBe("Custom Manual Title Here");
    });

    it("generates singleplayer title when no custom title", () => {
      const vid: VideoFile = {
        name: "2026-08-26 14-30-00.mp4",
        path: "/path/2026-08-26 14-30-00.mp4",
        size: 100,
        modTime: 1787754600000,
        folder: "/path",
        game: "Hades",
        episode: 3,
      };
      expect(resolveDisplayTitle(vid, undefined, " — ")).toBe("Hades — 26/08/26 — 3");
    });

    it("uses multiplayer profile template when available", () => {
      const profiles: Record<string, GameProfile> = {
        Overwatch: {
          type: "multiplayer",
          titleTemplate: "{game} - {event} - {date}",
        },
      };
      const vid: VideoFile = {
        name: "2026-08-26 14-30-00.mp4",
        path: "/path/2026-08-26 14-30-00.mp4",
        size: 100,
        modTime: 1787754600000,
        folder: "/path",
        game: "Overwatch",
        event: "Ranked Match",
      };
      expect(resolveDisplayTitle(vid, profiles)).toBe("Overwatch - Ranked Match - 26/08/26");
    });
  });

  describe("extractEpisodeFromTitle", () => {
    it("extracts trailing episode number from various formats", () => {
      expect(extractEpisodeFromTitle("CONTROL Resonant - 12/10/26 - 14")).toBe(14);
      expect(extractEpisodeFromTitle("Cyberpunk 2077 — 26/08/26 — 5")).toBe(5);
      expect(extractEpisodeFromTitle("Elden Ring #12")).toBe(12);
      expect(extractEpisodeFromTitle("Dark Souls - 1")).toBe(1);
    });

    it("does not match dates or titles without episode numbers", () => {
      expect(extractEpisodeFromTitle("CONTROL Resonant - 12/10/26")).toBe(0);
      expect(extractEpisodeFromTitle("Overwatch 2 - Clip")).toBe(0);
      expect(extractEpisodeFromTitle("")).toBe(0);
      expect(extractEpisodeFromTitle(undefined)).toBe(0);
    });
  });

  describe("resolveVideoEpisode", () => {
    it("prefers explicit input if positive number", () => {
      expect(resolveVideoEpisode(14, 5, "Game - 2")).toBe(14);
      expect(resolveVideoEpisode("14", 5, "Game - 2")).toBe(14);
    });

    it("falls back to video.episode if explicit input is empty or 0", () => {
      expect(resolveVideoEpisode("", 5, "Game - 2")).toBe(5);
      expect(resolveVideoEpisode(0, 5, "Game - 2")).toBe(5);
      expect(resolveVideoEpisode(undefined, 5, "Game - 2")).toBe(5);
    });

    it("falls back to parsing title if video.episode is 0 or missing", () => {
      expect(resolveVideoEpisode("", 0, "CONTROL Resonant - 12/10/26 - 14")).toBe(14);
      expect(resolveVideoEpisode(undefined, undefined, "CONTROL Resonant - 12/10/26 - 14")).toBe(14);
      expect(resolveVideoEpisode("", 0, "CONTROL Resonant - 12/10/26")).toBe(0);
    });
  });

  describe("computeDefaultClipTitle", () => {
    it("prefixes clip title with game tag and base file name when game tag is present", () => {
      expect(
        computeDefaultClipTitle("2026-08-26 14-30-00.mp4", "Lethal Company")
      ).toBe("Lethal Company - 2026-08-26 14-30-00 - Clip");
    });

    it("trims whitespace from game tag", () => {
      expect(
        computeDefaultClipTitle("recording.mkv", "  Elden Ring  ")
      ).toBe("Elden Ring - recording - Clip");
    });

    it("omits game tag prefix when game tag is undefined or empty string", () => {
      expect(computeDefaultClipTitle("2026-08-26 14-30-00.mp4")).toBe(
        "2026-08-26 14-30-00 - Clip"
      );
      expect(computeDefaultClipTitle("2026-08-26 14-30-00.mp4", "")).toBe(
        "2026-08-26 14-30-00 - Clip"
      );
      expect(computeDefaultClipTitle("2026-08-26 14-30-00.mp4", "   ")).toBe(
        "2026-08-26 14-30-00 - Clip"
      );
    });
  });

  describe("groupVideos", () => {
    const videoDate1: VideoFile = {
      name: "vid1.mp4",
      path: "C:\\Recordings\\EldenRing\\vid1.mp4",
      size: 1000,
      modTime: 1729350000000, // 2024-10-19
      folder: "C:\\Recordings\\EldenRing",
      game: "Elden Ring",
    };

    const videoDate2: VideoFile = {
      name: "vid2.mp4",
      path: "C:\\Recordings\\EldenRing\\vid2.mp4",
      size: 2000,
      modTime: 1729350000000,
      folder: "C:\\Recordings\\EldenRing",
      game: "Elden Ring",
      youtubeId: "yt-123",
    };

    const videoUntagged: VideoFile = {
      name: "vid3.mp4",
      path: "C:\\Captures\\vid3.mp4",
      size: 3000,
      modTime: 1729263600000, // 2024-10-18
      folder: "C:\\Captures",
      game: "",
    };

    const videoQueued: VideoFile = {
      name: "vid4.mp4",
      path: "C:\\Captures\\vid4.mp4",
      size: 4000,
      modTime: 1729263600000,
      folder: "C:\\Captures",
      game: "Hades II",
    };

    it("returns an empty array when mode is none", () => {
      const res = groupVideos([videoDate1, videoDate2], "none");
      expect(res).toEqual([]);
    });

    it("delegates to groupByDay when mode is date", () => {
      const res = groupVideos([videoDate1, videoUntagged], "date");
      expect(res).toHaveLength(2);
      expect(res[0].videos).toHaveLength(1);
      expect(res[0].videos[0].name).toBe("vid1.mp4");
      expect(res[1].videos).toHaveLength(1);
      expect(res[1].videos[0].name).toBe("vid3.mp4");
    });

    it("groups by game tag and assigns Untagged for empty or missing game", () => {
      const res = groupVideos(
        [videoDate1, videoUntagged, videoQueued],
        "game",
      );
      expect(res).toHaveLength(3);
      expect(res[0].label).toBe("Elden Ring");
      expect(res[0].videos[0].name).toBe("vid1.mp4");
      expect(res[1].label).toBe("Untagged");
      expect(res[1].videos[0].name).toBe("vid3.mp4");
      expect(res[2].label).toBe("Hades II");
      expect(res[2].videos[0].name).toBe("vid4.mp4");
    });

    it("groups by status in fixed order and omits empty buckets", () => {
      const queuedPaths = new Set([videoQueued.path]);
      const res = groupVideos(
        [videoDate1, videoDate2, videoQueued],
        "status",
        queuedPaths,
      );

      // Order must strictly be: Pending Upload -> Queued -> Uploaded to YouTube
      expect(res).toHaveLength(3);
      expect(res[0].label).toBe("Pending Upload");
      expect(res[0].videos.map((v) => v.name)).toEqual(["vid1.mp4"]);

      expect(res[1].label).toBe("Queued");
      expect(res[1].videos.map((v) => v.name)).toEqual(["vid4.mp4"]);

      expect(res[2].label).toBe("Uploaded to YouTube");
      expect(res[2].videos.map((v) => v.name)).toEqual(["vid2.mp4"]);
    });

    it("groups by folder displaying folder basename as label", () => {
      const res = groupVideos(
        [videoDate1, videoDate2, videoUntagged],
        "folder",
      );

      expect(res).toHaveLength(2);
      expect(res[0].label).toBe("EldenRing");
      expect(res[0].dateKey).toBe("folder:C:\\Recordings\\EldenRing");
      expect(res[0].videos).toHaveLength(2);

      expect(res[1].label).toBe("Captures");
      expect(res[1].dateKey).toBe("folder:C:\\Captures");
      expect(res[1].videos).toHaveLength(1);
    });

    it("preserves caller sorted order within each group", () => {
      const v1: VideoFile = { ...videoDate1, name: "alpha.mp4", size: 100 };
      const v2: VideoFile = { ...videoDate1, name: "beta.mp4", size: 200 };
      const res = groupVideos([v2, v1], "game");
      expect(res[0].videos[0].name).toBe("beta.mp4");
      expect(res[0].videos[1].name).toBe("alpha.mp4");
    });
  });

  describe("extractGamePrefixFromTitle", () => {
    it("extracts game prefix when separated by dash or em-dash", () => {
      expect(extractGamePrefixFromTitle("Elden Ring — 2026-10-21 — Ep 1")).toBe("Elden Ring");
      expect(extractGamePrefixFromTitle("Hollow Knight - 12/10/26 - Episode 4")).toBe("Hollow Knight");
    });

    it("returns empty string if prefix looks like a date or has no separator", () => {
      expect(extractGamePrefixFromTitle("2026-10-21 — Episode 1")).toBe("");
      expect(extractGamePrefixFromTitle("No Separator In This Title")).toBe("");
      expect(extractGamePrefixFromTitle("")).toBe("");
      expect(extractGamePrefixFromTitle(undefined)).toBe("");
    });
  });

  describe("groupVideosYT", () => {
    const mockYTVideo = (overrides: Partial<YTVideo>): YTVideo => ({
      id: "vid-1",
      title: "Sample Video",
      description: "",
      publishedAt: "2026-10-21T12:00:00Z",
      thumbnailUrl: "",
      viewCount: 100,
      likeCount: 10,
      duration: "10:00",
      privacy: "public",
      monetizationStatus: "monetized",
      ...overrides,
    });

    it("returns empty array when mode is 'none'", () => {
      const v1 = mockYTVideo({ id: "1" });
      expect(groupVideosYT([v1], "none", "recent")).toEqual([]);
    });

    it("delegates to groupByDayYT when mode is 'date'", () => {
      const v1 = mockYTVideo({ id: "1", publishedAt: "2026-10-21T12:00:00Z" });
      const v2 = mockYTVideo({ id: "2", publishedAt: "2026-10-20T12:00:00Z" });
      const res = groupVideosYT([v1, v2], "date", "recent");
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].videos).toBeDefined();
    });

    it("groups by playlist title with fallback to 'No Playlist'", () => {
      const v1 = mockYTVideo({ id: "1", playlistTitle: "RPG Let's Plays" });
      const v2 = mockYTVideo({ id: "2", playlistTitle: "" });
      const v3 = mockYTVideo({ id: "3", playlistTitle: "RPG Let's Plays" });

      const res = groupVideosYT([v1, v2, v3], "playlist", "recent");
      expect(res).toHaveLength(2);
      expect(res[0].label).toBe("RPG Let's Plays");
      expect(res[0].dateKey).toBe("playlist:RPG Let's Plays");
      expect(res[0].videos.map((v) => v.id)).toEqual(["1", "3"]);

      expect(res[1].label).toBe("No Playlist");
      expect(res[1].dateKey).toBe("playlist:No Playlist");
      expect(res[1].videos.map((v) => v.id)).toEqual(["2"]);
    });

    it("groups by game tag with fallback to title prefix and Untagged", () => {
      const v1 = mockYTVideo({ id: "1", gameTag: "Zelda" });
      const v2 = mockYTVideo({ id: "2", title: "Metroid Prime — 2026-10-21 — Part 1" });
      const v3 = mockYTVideo({ id: "3", title: "Untitled Recording" });

      const res = groupVideosYT([v1, v2, v3], "game", "recent");
      expect(res).toHaveLength(3);
      expect(res[0].label).toBe("Zelda");
      expect(res[0].dateKey).toBe("game:Zelda");
      expect(res[1].label).toBe("Metroid Prime");
      expect(res[1].dateKey).toBe("game:Metroid Prime");
      expect(res[2].label).toBe("Untagged");
      expect(res[2].dateKey).toBe("game:Untagged");
    });

    it("groups by privacy status into Public, Unlisted, and Private", () => {
      const v1 = mockYTVideo({ id: "1", privacy: "public" });
      const v2 = mockYTVideo({ id: "2", privacy: "UNLISTED" });
      const v3 = mockYTVideo({ id: "3", privacy: "private" });
      const v4 = mockYTVideo({ id: "4", privacy: "" });

      const res = groupVideosYT([v1, v2, v3, v4], "privacy", "recent");
      expect(res).toHaveLength(3);
      expect(res[0].label).toBe("Public");
      expect(res[0].dateKey).toBe("privacy:public");
      expect(res[0].videos.map((v) => v.id)).toEqual(["1", "4"]);

      expect(res[1].label).toBe("Unlisted");
      expect(res[1].dateKey).toBe("privacy:unlisted");
      expect(res[1].videos.map((v) => v.id)).toEqual(["2"]);

      expect(res[2].label).toBe("Private");
      expect(res[2].dateKey).toBe("privacy:private");
      expect(res[2].videos.map((v) => v.id)).toEqual(["3"]);
    });

    it("groups by monetization status into Monetized, Limited, and Demonetized", () => {
      const v1 = mockYTVideo({ id: "1", monetizationStatus: "monetized" });
      const v2 = mockYTVideo({ id: "2", monetizationStatus: "LIMITED" });
      const v3 = mockYTVideo({ id: "3", monetizationStatus: "demonetized" });
      const v4 = mockYTVideo({ id: "4", monetizationStatus: undefined });

      const res = groupVideosYT([v1, v2, v3, v4], "status", "recent");
      expect(res).toHaveLength(3);
      expect(res[0].label).toBe("Monetized");
      expect(res[0].dateKey).toBe("status:monetized");
      expect(res[0].videos.map((v) => v.id)).toEqual(["1", "4"]);

      expect(res[1].label).toBe("Limited");
      expect(res[1].dateKey).toBe("status:limited");
      expect(res[1].videos.map((v) => v.id)).toEqual(["2"]);

      expect(res[2].label).toBe("Demonetized");
      expect(res[2].dateKey).toBe("status:demonetized");
      expect(res[2].videos.map((v) => v.id)).toEqual(["3"]);
    });

    it("preserves caller order within each group", () => {
      const v1 = mockYTVideo({ id: "first", playlistTitle: "Series A" });
      const v2 = mockYTVideo({ id: "second", playlistTitle: "Series A" });
      const res = groupVideosYT([v2, v1], "playlist", "recent");
      expect(res[0].videos[0].id).toBe("second");
      expect(res[0].videos[1].id).toBe("first");
    });
  });
});


