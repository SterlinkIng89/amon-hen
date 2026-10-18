import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SteamBacklogView } from "../SteamBacklogView";
import { SteamGameInsight } from "../../../utils/steamInsightsUtils";

describe("SteamBacklogView", () => {
  const sampleGames: readonly SteamGameInsight[] = [
    {
      appid: 105600,
      name: "Terraria",
      playtimeHours: 150.5,
      playtimeForever: 9030,
      playtime2Weeks: 120,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/105600/library_600x900_2x.jpg",
      achievementsPct: 80,
      developers: "Re-Logic",
      publishers: "Re-Logic",
      genres: "Action, Adventure, Sandbox",
      ytVideosCount: 5,
      ytRecordedHours: 12.5,
      backlogStatus: "playing",
      backlogRank: 1,
      backlogNotes: "Hardmode boss prep",
    },
    {
      appid: 292030,
      name: "The Witcher 3: Wild Hunt",
      playtimeHours: 85.0,
      playtimeForever: 5100,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/292030/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/292030/library_600x900_2x.jpg",
      achievementsPct: 65,
      developers: "CD PROJEKT RED",
      publishers: "CD PROJEKT RED",
      genres: "RPG, Open World",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      backlogStatus: "up_next",
      backlogRank: 2,
      backlogNotes: "Blood and Wine DLC",
    },
    {
      appid: 550,
      name: "Left 4 Dead 2",
      playtimeHours: 25.0,
      playtimeForever: 1500,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/550/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/550/library_600x900_2x.jpg",
      achievementsPct: 40,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action, Zombies",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      backlogStatus: "candidate",
      backlogRank: 3,
      backlogNotes: "",
    },
    {
      appid: 730,
      name: "Counter-Strike 2",
      playtimeHours: 0.5,
      playtimeForever: 30,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/730/library_600x900_2x.jpg",
      achievementsPct: 10,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action, FPS",
      ytVideosCount: 0,
      ytRecordedHours: 0,
    },
    {
      appid: 1245620,
      name: "Elden Ring",
      playtimeHours: 0,
      playtimeForever: 0,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/1245620/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/1245620/library_600x900_2x.jpg",
      achievementsPct: 0,
      developers: "FromSoftware, Inc.",
      publishers: "Bandai Namco Entertainment",
      genres: "RPG, Souls-like",
      ytVideosCount: 0,
      ytRecordedHours: 0,
    },
  ];

  const topGenres = ["RPG", "Action", "Adventure"];
  const topDevs = ["FromSoftware, Inc.", "CD PROJEKT RED"];

  it("renders queued games in backlogRank order with rank badges and details", () => {
    const handleUpsert = vi.fn();
    const handleReorder = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={handleUpsert}
        onReorderBacklog={handleReorder}
        onRemoveBacklog={handleRemove}
      />
    );

    expect(screen.getByText("Up next & candidate queue")).toBeInTheDocument();

    const row1 = screen.getByTestId("backlog-row-105600");
    const row2 = screen.getByTestId("backlog-row-292030");
    const row3 = screen.getByTestId("backlog-row-550");

    expect(row1).toBeInTheDocument();
    expect(row2).toBeInTheDocument();
    expect(row3).toBeInTheDocument();

    expect(row1).toHaveTextContent("#1");
    expect(row1).toHaveTextContent("Terraria");
    expect(row1).toHaveTextContent("150.5h");

    expect(row2).toHaveTextContent("#2");
    expect(row2).toHaveTextContent("The Witcher 3: Wild Hunt");

    expect(row3).toHaveTextContent("#3");
    expect(row3).toHaveTextContent("Left 4 Dead 2");
  });

  it("swaps items and calls onReorderBacklog when clicking move up and move down buttons", () => {
    const handleReorder = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={vi.fn()}
        onReorderBacklog={handleReorder}
        onRemoveBacklog={vi.fn()}
      />
    );

    // Clicking move down on item #1 (105600) should swap with #2 (292030)
    const moveDownBtn = screen.getByTestId("backlog-move-down-105600");
    fireEvent.click(moveDownBtn);

    expect(handleReorder).toHaveBeenCalledWith([292030, 105600, 550]);

    // Clicking move up on item #2 (292030) should swap with #1 (105600)
    const moveUpBtn = screen.getByTestId("backlog-move-up-292030");
    fireEvent.click(moveUpBtn);

    expect(handleReorder).toHaveBeenCalledWith([292030, 105600, 550]);
  });

  it("calls onUpsertBacklog when status selector changes", () => {
    const handleUpsert = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={handleUpsert}
        onReorderBacklog={vi.fn()}
        onRemoveBacklog={vi.fn()}
      />
    );

    const statusSelect = screen.getByTestId("backlog-status-292030");
    fireEvent.change(statusSelect, { target: { value: "playing" } });

    expect(handleUpsert).toHaveBeenCalledWith(292030, "playing", "Blood and Wine DLC");
  });

  it("calls onUpsertBacklog when editing inline note and pressing Enter or blurring", () => {
    const handleUpsert = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={handleUpsert}
        onReorderBacklog={vi.fn()}
        onRemoveBacklog={vi.fn()}
      />
    );

    const noteInput = screen.getByTestId("backlog-note-105600");
    fireEvent.change(noteInput, { target: { value: "Updated note text" } });
    fireEvent.blur(noteInput);

    expect(handleUpsert).toHaveBeenCalledWith(105600, "playing", "Updated note text");
  });

  it("calls onRemoveBacklog when clicking remove button", () => {
    const handleRemove = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={vi.fn()}
        onReorderBacklog={vi.fn()}
        onRemoveBacklog={handleRemove}
      />
    );

    const removeBtn = screen.getByTestId("backlog-remove-550");
    fireEvent.click(removeBtn);

    expect(handleRemove).toHaveBeenCalledWith(550);
  });

  it("filters queued games by status tab", () => {
    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={vi.fn()}
        onReorderBacklog={vi.fn()}
        onRemoveBacklog={vi.fn()}
      />
    );

    expect(screen.getByTestId("backlog-row-105600")).toBeInTheDocument();
    expect(screen.getByTestId("backlog-row-292030")).toBeInTheDocument();

    const playingTab = screen.getByRole("button", { name: /^Playing/i });
    fireEvent.click(playingTab);

    expect(screen.getByTestId("backlog-row-105600")).toBeInTheDocument();
    expect(screen.queryByTestId("backlog-row-292030")).not.toBeInTheDocument();
  });

  it("allows searching unqueued games and adding them as candidate", () => {
    const handleUpsert = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={handleUpsert}
        onReorderBacklog={vi.fn()}
        onRemoveBacklog={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId("backlog-add-search");
    fireEvent.change(searchInput, { target: { value: "Counter" } });

    const addBtn = screen.getByTestId("backlog-add-game-730");
    expect(addBtn).toBeInTheDocument();

    fireEvent.click(addBtn);
    expect(handleUpsert).toHaveBeenCalledWith(730, "candidate", "");
  });

  it("renders smart backlog suggestions and queues candidate on button click", () => {
    const handleUpsert = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={handleUpsert}
        onReorderBacklog={vi.fn()}
        onRemoveBacklog={vi.fn()}
      />
    );

    // Elden Ring has 0 playtime, matches FromSoftware, Inc. and RPG, and is not queued
    const suggestionRow = screen.getByTestId("suggestion-row-1245620");
    expect(suggestionRow).toBeInTheDocument();
    expect(suggestionRow).toHaveTextContent("Elden Ring");
    expect(suggestionRow).toHaveTextContent("By FromSoftware, Inc.");
    expect(suggestionRow).toHaveTextContent("RPG");

    const addBtn = screen.getByTestId("suggestion-add-1245620");
    fireEvent.click(addBtn);

    expect(handleUpsert).toHaveBeenCalledWith(
      1245620,
      "candidate",
      "By FromSoftware, Inc. · RPG"
    );
  });

  it("spins backlog roulette and queues picked game as up_next", () => {
    const handleUpsert = vi.fn();

    render(
      <SteamBacklogView
        allGames={sampleGames}
        topGenres={topGenres}
        topDevs={topDevs}
        onUpsertBacklog={handleUpsert}
        onReorderBacklog={vi.fn()}
        onRemoveBacklog={vi.fn()}
      />
    );

    const spinBtn = screen.getByTestId("roulette-spin-btn");
    fireEvent.click(spinBtn);

    const resultCard = screen.getByTestId("roulette-result-card");
    expect(resultCard).toBeInTheDocument();

    const queueBtn = screen.getByTestId("roulette-queue-btn");
    fireEvent.click(queueBtn);

    expect(handleUpsert).toHaveBeenCalledWith(
      expect.any(Number),
      "up_next",
      "Picked via Backlog Roulette"
    );
  });
});
