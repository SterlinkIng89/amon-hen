import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as AppBindings from "../../../wailsjs/go/backend/App";
import type { Config, TitleNormalizationDraft, YTVideo } from "../../types";
import { usePlaylistNormalizer } from "../usePlaylistNormalizer";

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetPlaylistVideos: vi.fn(),
  GetTitleNormalizationDrafts: vi.fn(),
  LoadConfig: vi.fn(),
  MarkTitleNormalizationDraftSynced: vi.fn(),
  SaveTitleNormalizationDraftsBatch: vi.fn(),
  UpdateYouTubeVideoGameMeta: vi.fn(),
  UpdateYouTubeVideoMetadata: vi.fn(),
}));

const sampleConfig: Partial<Config> = {
  title_separator: " — ",
  game_profiles: {
    "Helldivers 2": {
      type: "multiplayer",
      titleTemplate: "{event} - {gamemode} - {date}",
      modes: ["Automaton", "Terminid"],
    },
    "Elden Ring": {
      type: "singleplayer",
      titleTemplate: "{game} - {date} - {episode}",
    },
  },
  recent_field_values: {},
};

const sampleVideos: YTVideo[] = [
  {
    id: "v1",
    title: "Old raw title one",
    description: "",
    publishedAt: "2025-05-10T12:00:00Z",
    thumbnailUrl: "",
    viewCount: 0,
    likeCount: 0,
    duration: "10:00",
    privacy: "public",
  },
  {
    id: "v2",
    title: "Creek Defense - Automaton - 12/05/25",
    description: "",
    publishedAt: "2025-05-12T12:00:00Z",
    thumbnailUrl: "",
    viewCount: 0,
    likeCount: 0,
    duration: "12:00",
    privacy: "public",
  },
  {
    id: "v3",
    title: "Unparsed clip 15/05/25",
    description: "",
    publishedAt: "2025-05-15T12:00:00Z",
    thumbnailUrl: "",
    viewCount: 0,
    likeCount: 0,
    duration: "05:00",
    privacy: "public",
  },
];

const sampleDrafts: TitleNormalizationDraft[] = [
  {
    videoId: "v1",
    playlistId: "pl-1",
    gameTag: "Helldivers 2",
    profileType: "multiplayer",
    event: "Malevelon Creek",
    gameMode: "Automaton",
    dateOverride: "10/05/25",
    episode: 0,
    customVars: {},
    proposedTitle: "Malevelon Creek - Automaton - 10/05/25",
    status: "ready",
    updatedAt: 1700000000,
  },
  {
    videoId: "v2",
    playlistId: "pl-1",
    gameTag: "Helldivers 2",
    profileType: "multiplayer",
    event: "Creek Defense",
    gameMode: "Automaton",
    dateOverride: "12/05/25",
    episode: 0,
    customVars: {},
    proposedTitle: "Creek Defense - Automaton - 12/05/25",
    status: "synced",
    updatedAt: 1700000000,
  },
];

describe("usePlaylistNormalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AppBindings.GetPlaylistVideos).mockResolvedValue(
      sampleVideos as unknown as Awaited<ReturnType<typeof AppBindings.GetPlaylistVideos>>,
    );
    vi.mocked(AppBindings.GetTitleNormalizationDrafts).mockResolvedValue(
      sampleDrafts as unknown as Awaited<
        ReturnType<typeof AppBindings.GetTitleNormalizationDrafts>
      >,
    );
    vi.mocked(AppBindings.LoadConfig).mockResolvedValue(
      sampleConfig as unknown as Awaited<ReturnType<typeof AppBindings.LoadConfig>>,
    );
    vi.mocked(AppBindings.SaveTitleNormalizationDraftsBatch).mockResolvedValue(undefined);
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockResolvedValue(undefined);
    vi.mocked(AppBindings.UpdateYouTubeVideoGameMeta).mockResolvedValue(undefined);
    vi.mocked(AppBindings.MarkTitleNormalizationDraftSynced).mockResolvedValue(undefined);
  });

  it("hydrates saved SQLite drafts over auto-extracted defaults and preserves synced status", async () => {
    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.rows).toHaveLength(3);
    });

    const [row1, row2, row3] = result.current.rows;
    expect(result.current.selectedGameTag).toBe("Helldivers 2");

    expect(row1.fields.event).toBe("Malevelon Creek");
    expect(row1.fields.gameMode).toBe("Automaton");
    expect(row1.proposedTitle).toBe("Malevelon Creek - Automaton - 10/05/25");
    expect(row1.status).toBe("ready");
    expect(row1.isDirty).toBe(false);

    expect(row2.status).toBe("synced");
    expect(row2.isDirty).toBe(false);

    expect(row3.status).toBe("needs_review");
    expect(row3.missingFields).toContain("gamemode");
  });

  it("recalculates proposedTitle, missingFields, status, and sets isDirty on updateRowField", async () => {
    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    act(() => {
      result.current.updateRowField("v3", {
        event: "Bug Breach",
        gameMode: "Terminid",
      });
    });

    const updated = result.current.rows.find((r) => r.video.id === "v3");
    expect(updated?.isDirty).toBe(true);
    expect(updated?.proposedTitle).toBe("Bug Breach - Terminid - 15/05/25");
    expect(updated?.missingFields).toEqual([]);
    expect(updated?.status).toBe("ready");
  });

  it("re-evaluates non-dirty and non-synced rows when selectedGameTag changes", async () => {
    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    act(() => {
      result.current.updateRowField("v1", { event: "Dirty Edit" });
    });

    act(() => {
      result.current.setSelectedGameTag("Elden Ring");
    });

    const row1 = result.current.rows.find((r) => r.video.id === "v1");
    const row2 = result.current.rows.find((r) => r.video.id === "v2");
    const row3 = result.current.rows.find((r) => r.video.id === "v3");

    expect(row1?.isDirty).toBe(true);
    expect(row1?.fields.event).toBe("Dirty Edit");
    expect(row2?.status).toBe("synced");
    expect(row3?.missingFields).toEqual(["episode"]);
  });

  it("saveAllDirtyDrafts persists only dirty rows and clears isDirty", async () => {
    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    act(() => {
      result.current.updateRowField("v3", {
        event: "Bug Breach",
        gameMode: "Terminid",
      });
    });

    let savedCount = 0;
    await act(async () => {
      savedCount = await result.current.saveAllDirtyDrafts();
    });

    expect(savedCount).toBe(1);
    expect(AppBindings.SaveTitleNormalizationDraftsBatch).toHaveBeenCalledTimes(1);
    const savedPayload = vi.mocked(AppBindings.SaveTitleNormalizationDraftsBatch).mock
      .calls[0][0];
    expect(savedPayload).toHaveLength(1);
    expect(savedPayload[0].videoId).toBe("v3");
    expect(savedPayload[0].proposedTitle).toBe("Bug Breach - Terminid - 15/05/25");
    expect(result.current.rows.find((r) => r.video.id === "v3")?.isDirty).toBe(false);
  });

  it("syncSingleVideo updates YouTube metadata, SQLite game meta, and marks draft synced", async () => {
    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.syncSingleVideo("v1");
    });

    expect(ok).toBe(true);
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith(
      "v1",
      "Malevelon Creek - Automaton - 10/05/25",
      "",
      "",
    );
    expect(AppBindings.UpdateYouTubeVideoGameMeta).toHaveBeenCalledWith(
      "v1",
      "Helldivers 2",
      0,
    );
    expect(AppBindings.MarkTitleNormalizationDraftSynced).toHaveBeenCalledWith(
      "v1",
      "Malevelon Creek - Automaton - 10/05/25",
    );

    const row1 = result.current.rows.find((r) => r.video.id === "v1");
    expect(row1?.status).toBe("synced");
    expect(row1?.isDirty).toBe(false);
    expect(row1?.syncError).toBeUndefined();
  });

  it("syncBatch continues after per-row error without aborting remaining videos", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("YouTube API error"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    await act(async () => {
      await result.current.syncBatch(["v1", "v2", "v3"]);
    });

    expect(result.current.batchProgress.running).toBe(false);
    expect(result.current.batchProgress.current).toBe(3);
    expect(result.current.batchProgress.successCount).toBe(2);
    expect(result.current.batchProgress.failCount).toBe(1);
    expect(result.current.rows.find((r) => r.video.id === "v2")?.syncError).toBe(
      "YouTube API error",
    );
  });

  it("cancelBatchSync stops a running batch cleanly after the in-flight item completes", async () => {
    let resolveCancelItem!: () => void;
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCancelItem = resolve;
        }),
    );

    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    let cancelBatchPromise!: Promise<void>;
    act(() => {
      cancelBatchPromise = result.current.syncBatch(["v1", "v2", "v3"]);
    });

    act(() => {
      result.current.cancelBatchSync();
    });

    resolveCancelItem();
    await act(async () => {
      await cancelBatchPromise;
    });

    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(1);
    expect(result.current.batchProgress.running).toBe(false);
    expect(result.current.batchProgress.current).toBe(1);
  });

  it("estimateQuotaCost returns n * 50", async () => {
    const { result } = renderHook(() =>
      usePlaylistNormalizer({ playlistId: "pl-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.estimateQuotaCost(0)).toBe(0);
    expect(result.current.estimateQuotaCost(5)).toBe(250);
    expect(result.current.estimateQuotaCost(-2)).toBe(0);
  });
});
