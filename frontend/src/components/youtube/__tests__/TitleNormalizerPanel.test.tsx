import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TitleNormalizerPanel from "../TitleNormalizerPanel";
import type { YTVideo, GameProfile } from "../../../types";
import {
  GetTitleNormalizationDraft,
  SaveTitleNormalizationDraft,
  MarkTitleNormalizationDraftSynced,
  UpdateYouTubeVideoMetadata,
  UpdateYouTubeVideoGameMeta,
  SaveRecentFieldValues,
} from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetTitleNormalizationDraft: vi.fn(),
  SaveTitleNormalizationDraft: vi.fn().mockResolvedValue(undefined),
  MarkTitleNormalizationDraftSynced: vi.fn().mockResolvedValue(undefined),
  UpdateYouTubeVideoMetadata: vi.fn().mockResolvedValue(undefined),
  UpdateYouTubeVideoGameMeta: vi.fn().mockResolvedValue(undefined),
  LoadConfig: vi.fn().mockResolvedValue({
    recent_field_values: {
      champion: ["Jinx", "Ahri"],
    },
    tag_playlist_configs: {},
  }),
  SaveRecentFieldValues: vi.fn().mockResolvedValue(undefined),
}));

describe("TitleNormalizerPanel", () => {
  const gameProfiles: Record<string, GameProfile> = {
    "League of Legends": {
      type: "multiplayer",
      modes: ["Ranked Solo", "ARAM", "Normal"],
      titleTemplate: "{champion} {event} - {gamemode} - {date}",
    },
  };

  const baseVideo: YTVideo = {
    id: "vid-123",
    title: "Jinx Cuadrakill - 11 11 2024",
    description: "Old clip description",
    publishedAt: "2024-11-11T20:00:00Z",
    thumbnailUrl: "https://yt.com/thumb.jpg",
    viewCount: 42,
    likeCount: 5,
    duration: "0:45",
    privacy: "unlisted",
    gameTag: "League of Legends",
    episode: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GetTitleNormalizationDraft).mockResolvedValue({
      videoId: "",
      playlistId: "",
      gameTag: "",
      profileType: "",
      event: "",
      gameMode: "",
      dateOverride: "",
      episode: 0,
      customVars: {},
      proposedTitle: "",
      status: "",
      updatedAt: 0,
    });
  });

  it("loads saved SQLite draft when present", async () => {
    vi.mocked(GetTitleNormalizationDraft).mockResolvedValueOnce({
      videoId: "vid-123",
      playlistId: "pl-1",
      gameTag: "League of Legends",
      profileType: "multiplayer",
      event: "Pentakill",
      gameMode: "ARAM",
      dateOverride: "11/11/24",
      episode: 0,
      customVars: { champion: "Ahri" },
      proposedTitle: "Ahri Pentakill - ARAM - 11/11/24",
      status: "ready",
      updatedAt: 1700000000,
    });

    render(
      <TitleNormalizerPanel
        video={baseVideo}
        playlistId="pl-1"
        gameProfiles={gameProfiles}
        onSynced={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("normalizer-proposed-title")).toHaveTextContent(
        "Ahri Pentakill - ARAM - 11/11/24",
      );
    });

    expect(
      (screen.getByLabelText(/event/i) as HTMLInputElement).value,
    ).toBe("Pentakill");
    expect(
      (screen.getByLabelText(/game mode/i) as HTMLSelectElement).value,
    ).toBe("ARAM");
  });

  it("falls back to extractNormalizedFields when no draft exists and updates preview on edit", async () => {
    render(
      <TitleNormalizerPanel
        video={baseVideo}
        gameProfiles={gameProfiles}
        recentFieldValues={{ champion: ["Jinx", "Ahri"] }}
        onSynced={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/event/i)).toBeInTheDocument();
    });

    expect(
      (screen.getByLabelText(/event/i) as HTMLInputElement).value,
    ).toBe("Cuadrakill");
    expect(screen.getByText("From title")).toBeInTheDocument();

    // Select a game mode and verify live preview updates immediately
    fireEvent.change(screen.getByLabelText(/game mode/i), {
      target: { value: "Ranked Solo" },
    });

    expect(screen.getByTestId("normalizer-proposed-title")).toHaveTextContent(
      "Jinx Cuadrakill - Ranked Solo - 11/11/24",
    );
  });

  it("saves draft via SaveTitleNormalizationDraft without calling UpdateYouTubeVideoMetadata", async () => {
    render(
      <TitleNormalizerPanel
        video={baseVideo}
        playlistId="pl-1"
        gameProfiles={gameProfiles}
        recentFieldValues={{ champion: ["Jinx"] }}
        onSynced={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/game mode/i), {
      target: { value: "ARAM" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => {
      expect(SaveTitleNormalizationDraft).toHaveBeenCalledTimes(1);
    });

    expect(SaveTitleNormalizationDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: "vid-123",
        playlistId: "pl-1",
        gameTag: "League of Legends",
        event: "Cuadrakill",
        gameMode: "ARAM",
        dateOverride: "11/11/24",
        proposedTitle: "Jinx Cuadrakill - ARAM - 11/11/24",
      }),
    );
    expect(UpdateYouTubeVideoMetadata).not.toHaveBeenCalled();
  });

  it("syncs to YouTube, persists game meta, and marks draft synced", async () => {
    const onSynced = vi.fn();

    render(
      <TitleNormalizerPanel
        video={baseVideo}
        gameProfiles={gameProfiles}
        recentFieldValues={{ champion: ["Jinx"] }}
        onSynced={onSynced}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sync to youtube/i }),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/game mode/i), {
      target: { value: "Ranked Solo" },
    });

    fireEvent.click(screen.getByRole("button", { name: /sync to youtube/i }));

    await waitFor(() => {
      expect(UpdateYouTubeVideoMetadata).toHaveBeenCalledWith(
        "vid-123",
        "Jinx Cuadrakill - Ranked Solo - 11/11/24",
        "Old clip description",
        "unlisted",
      );
    });

    expect(UpdateYouTubeVideoGameMeta).toHaveBeenCalledWith(
      "vid-123",
      "League of Legends",
      0,
    );
    expect(MarkTitleNormalizationDraftSynced).toHaveBeenCalledWith(
      "vid-123",
      "Jinx Cuadrakill - Ranked Solo - 11/11/24",
    );
    expect(SaveRecentFieldValues).toHaveBeenCalled();
    expect(onSynced).toHaveBeenCalledWith(
      "vid-123",
      "Jinx Cuadrakill - Ranked Solo - 11/11/24",
      "League of Legends",
      0,
    );
  });

  it("syncs and advances on Sync & Next click and Ctrl+Enter", async () => {
    const onSynced = vi.fn();
    const onSyncAndNext = vi.fn();

    render(
      <TitleNormalizerPanel
        video={baseVideo}
        gameProfiles={gameProfiles}
        recentFieldValues={{ champion: ["Jinx"] }}
        onSynced={onSynced}
        onSyncAndNext={onSyncAndNext}
        hasNext={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sync & next/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /sync & next/i }));

    await waitFor(() => {
      expect(onSyncAndNext).toHaveBeenCalledTimes(1);
    });

    // Trigger Ctrl+Enter on an input inside the panel
    const eventInput = screen.getByLabelText(/event/i);
    fireEvent.keyDown(eventInput, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSyncAndNext).toHaveBeenCalledTimes(2);
    });
  });
});
