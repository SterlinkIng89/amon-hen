import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SteamPersonalTierView } from "../SteamPersonalTierView";
import { SteamGameInsight } from "../../../utils/steamInsightsUtils";

describe("SteamPersonalTierView", () => {
  const sampleGames: readonly SteamGameInsight[] = [
    {
      appid: 105600,
      name: "Terraria",
      playtimeHours: 250.0,
      playtimeForever: 15000,
      playtime2Weeks: 120,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/105600/library_600x900_2x.jpg",
      achievementsPct: 85,
      developers: "Re-Logic",
      publishers: "Re-Logic",
      genres: "Action, Adventure, Sandbox",
      ytVideosCount: 5,
      ytRecordedHours: 12.5,
      personalTier: "S",
      personalScore: 10,
      personalNotes: "Absolute masterpiece sandbox",
    },
    {
      appid: 292030,
      name: "The Witcher 3: Wild Hunt",
      playtimeHours: 120.0,
      playtimeForever: 7200,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/292030/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/292030/library_600x900_2x.jpg",
      achievementsPct: 70,
      developers: "CD PROJEKT RED",
      publishers: "CD PROJEKT RED",
      genres: "RPG, Open World",
      ytVideosCount: 2,
      ytRecordedHours: 4.0,
      personalTier: "S",
      personalScore: 9,
      personalNotes: "Incredible storytelling and DLCs",
    },
    {
      appid: 550,
      name: "Left 4 Dead 2",
      playtimeHours: 60.0,
      playtimeForever: 3600,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/550/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/550/library_600x900_2x.jpg",
      achievementsPct: 45,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action, Co-op",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      personalTier: "A",
      personalScore: 8,
      personalNotes: "Great co-op fun with friends",
    },
    {
      appid: 620,
      name: "Portal 2",
      playtimeHours: 30.0,
      playtimeForever: 1800,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/620/library_600x900_2x.jpg",
      achievementsPct: 90,
      developers: "Valve",
      publishers: "Valve",
      genres: "Puzzle, Sci-Fi",
      ytVideosCount: 1,
      ytRecordedHours: 1.5,
      personalTier: "B",
      personalScore: 7,
      personalNotes: "Clever puzzles and writing",
    },
    {
      appid: 730,
      name: "Counter-Strike 2",
      playtimeHours: 200.0,
      playtimeForever: 12000,
      playtime2Weeks: 10,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/730/library_600x900_2x.jpg",
      achievementsPct: 5,
      developers: "Valve",
      publishers: "Valve",
      genres: "Action, FPS",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      personalTier: "C",
      personalScore: 5,
    },
    {
      appid: 400,
      name: "Portal",
      playtimeHours: 15.0,
      playtimeForever: 900,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/400/library_600x900_2x.jpg",
      achievementsPct: 100,
      developers: "Valve",
      publishers: "Valve",
      genres: "Puzzle",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      // Unrated played game
    },
    {
      appid: 1145360,
      name: "Hades",
      playtimeHours: 80.0,
      playtimeForever: 4800,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/1145360/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/1145360/library_600x900_2x.jpg",
      achievementsPct: 60,
      developers: "Supergiant Games",
      publishers: "Supergiant Games",
      genres: "Action, Roguelike",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      // Unrated played game with high playtime
    },
    {
      appid: 367520,
      name: "Hollow Knight",
      playtimeHours: 50.0,
      playtimeForever: 3000,
      playtime2Weeks: 0,
      headerUrl: "https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg",
      posterUrl: "https://cdn.akamai.steamstatic.com/steam/apps/367520/library_600x900_2x.jpg",
      achievementsPct: 55,
      developers: "Team Cherry",
      publishers: "Team Cherry",
      genres: "Metroidvania, Difficult",
      ytVideosCount: 0,
      ytRecordedHours: 0,
      // Unrated played game
    },
  ];

  it("renders 5 tier rows with accurate counts and sorted rated games", () => {
    const handleSave = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamPersonalTierView
        allGames={sampleGames}
        onSaveRating={handleSave}
        onRemoveRating={handleRemove}
      />
    );

    // Verify all 5 tier rows exist
    expect(screen.getByTestId("tier-row-S")).toBeInTheDocument();
    expect(screen.getByTestId("tier-row-A")).toBeInTheDocument();
    expect(screen.getByTestId("tier-row-B")).toBeInTheDocument();
    expect(screen.getByTestId("tier-row-C")).toBeInTheDocument();
    expect(screen.getByTestId("tier-row-D")).toBeInTheDocument();

    // S row has Terraria (10/10) and Witcher 3 (9/10)
    const sRow = screen.getByTestId("tier-row-S");
    expect(sRow).toHaveTextContent("Terraria");
    expect(sRow).toHaveTextContent("The Witcher 3: Wild Hunt");
    expect(sRow).toHaveTextContent("10/10");
    expect(sRow).toHaveTextContent("9/10");

    // Tier D is empty
    const dRow = screen.getByTestId("tier-row-D");
    expect(dRow).toHaveTextContent("No games rated in Tier D yet");
  });

  it("opens inline editor when clicking a rated game card and allows saving updates", async () => {
    const handleSave = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamPersonalTierView
        allGames={sampleGames}
        onSaveRating={handleSave}
        onRemoveRating={handleRemove}
      />
    );

    // Click Terraria's card to open editor
    const terrariaCard = screen.getByTestId("tier-card-105600");
    fireEvent.click(terrariaCard);

    // Editor panel is visible
    expect(screen.getByTestId("tier-editor-panel")).toBeInTheDocument();
    const notesInput = screen.getByTestId("tier-editor-notes") as HTMLTextAreaElement;
    expect(notesInput.value).toBe("Absolute masterpiece sandbox");

    // Change note and score
    fireEvent.change(notesInput, {
      target: { value: "Updated: Best sandbox ever" },
    });
    const scoreSelect = screen.getByTestId("tier-editor-score") as HTMLSelectElement;
    fireEvent.change(scoreSelect, { target: { value: "10" } });

    // Save changes
    const saveBtn = screen.getByTestId("tier-editor-save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(
      105600,
      "S",
      10,
      "Updated: Best sandbox ever"
    );
  });

  it("removes a rating from the inline editor", async () => {
    const handleSave = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamPersonalTierView
        allGames={sampleGames}
        onSaveRating={handleSave}
        onRemoveRating={handleRemove}
      />
    );

    // Select Portal 2 in Tier B
    const portal2Card = screen.getByTestId("tier-card-620");
    fireEvent.click(portal2Card);

    // Click remove button
    const removeBtn = screen.getByTestId("tier-remove-620");
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    expect(handleRemove).toHaveBeenCalledWith(620);
  });

  it("allows switching tier inside the editor panel", async () => {
    const handleSave = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamPersonalTierView
        allGames={sampleGames}
        onSaveRating={handleSave}
        onRemoveRating={handleRemove}
      />
    );

    // Select Left 4 Dead 2 in Tier A
    fireEvent.click(screen.getByTestId("tier-card-550"));

    // Switch tier to S
    const tierSBtn = screen.getByTestId("tier-select-btn-S");
    fireEvent.click(tierSBtn);

    // Save
    await act(async () => {
      fireEvent.click(screen.getByTestId("tier-editor-save"));
    });

    expect(handleSave).toHaveBeenCalledWith(
      550,
      "S",
      8,
      "Great co-op fun with friends"
    );
  });

  it("renders unrated played games and allows quick rating", async () => {
    const handleSave = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamPersonalTierView
        allGames={sampleGames}
        onSaveRating={handleSave}
        onRemoveRating={handleRemove}
      />
    );

    // Hades is the highest played unrated game (4800 min), followed by Hollow Knight (3000 min)
    expect(screen.getByTestId("unrated-row-1145360")).toBeInTheDocument();
    expect(screen.getByTestId("unrated-row-367520")).toBeInTheDocument();

    // Select score 9 for Hades and click Tier S
    const scoreSelect = screen.getByTestId("unrated-score-1145360");
    fireEvent.change(scoreSelect, { target: { value: "9" } });

    const rateSBtn = screen.getByTestId("rate-btn-1145360-S");
    await act(async () => {
      fireEvent.click(rateSBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(1145360, "S", 9, "");
  });

  it("filters unrated games when typing in the search input", () => {
    const handleSave = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamPersonalTierView
        allGames={sampleGames}
        onSaveRating={handleSave}
        onRemoveRating={handleRemove}
      />
    );

    const searchInput = screen.getByTestId("tier-rate-search");
    fireEvent.change(searchInput, { target: { value: "Hollow" } });

    // Hollow Knight is visible, Hades is filtered out
    expect(screen.getByTestId("unrated-row-367520")).toBeInTheDocument();
    expect(screen.queryByTestId("unrated-row-1145360")).not.toBeInTheDocument();
  });

  it("closes the editor panel when clicking cancel", () => {
    const handleSave = vi.fn();
    const handleRemove = vi.fn();

    render(
      <SteamPersonalTierView
        allGames={sampleGames}
        onSaveRating={handleSave}
        onRemoveRating={handleRemove}
      />
    );

    // Open editor for Terraria
    fireEvent.click(screen.getByTestId("tier-card-105600"));
    expect(screen.getByTestId("tier-editor-panel")).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(screen.getByTestId("tier-editor-cancel"));
    expect(screen.queryByTestId("tier-editor-panel")).not.toBeInTheDocument();
  });
});
