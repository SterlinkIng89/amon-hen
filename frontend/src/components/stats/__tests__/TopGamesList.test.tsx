import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TopGamesList } from "../TopGamesList";

vi.mock("../../../hooks/useSteamGameData", () => ({
  useSteamGameData: vi.fn((gameName: string) => ({
    appId: "123",
    headerUrl: `https://example.com/${encodeURIComponent(gameName)}-header.jpg`,
    heroUrl: null,
    posterUrl: null,
    achievementsPct: 50,
  })),
}));

describe("TopGamesList", () => {
  const sampleGames = [
    { game: "Mina the Hollower", hours: 7.66 },
    { game: "CONTROL Resonant", hours: 7.3 },
    { game: "SOS OPS!", hours: 1.13 },
  ];

  it("renders empty state message when games list is empty", () => {
    render(
      <TopGamesList
        games={[]}
        selectedGameName={null}
        onSelectGame={vi.fn()}
        maxHours={0}
        listTitle="Top games in October 2026"
      />
    );

    expect(screen.getByText("No playtime recorded")).toBeDefined();
    expect(screen.getByText("Top games in October 2026")).toBeDefined();
  });

  it("renders game titles, playtime hours, and header banners", () => {
    const { container } = render(
      <TopGamesList
        games={sampleGames}
        selectedGameName="Mina the Hollower"
        onSelectGame={vi.fn()}
        maxHours={7.66}
        listTitle="Top games in October 2026"
      />
    );

    expect(screen.getByText("Mina the Hollower")).toBeDefined();
    expect(screen.getByText("CONTROL Resonant")).toBeDefined();
    expect(screen.getByText("SOS OPS!")).toBeDefined();

    // Verify 3 games count badge
    expect(screen.getByText("3 games")).toBeDefined();

    // Verify images rendered
    const images = container.querySelectorAll("img");
    expect(images.length).toBe(3);
    expect(images[0].getAttribute("src")).toContain("Mina%20the%20Hollower");
  });

  it("invokes onSelectGame when clicking a game row", () => {
    const handleSelect = vi.fn();
    render(
      <TopGamesList
        games={sampleGames}
        selectedGameName={null}
        onSelectGame={handleSelect}
        maxHours={7.66}
        listTitle="Top games in October 2026"
      />
    );

    const controlRow = screen.getByText("CONTROL Resonant");
    fireEvent.click(controlRow);

    expect(handleSelect).toHaveBeenCalledWith("CONTROL Resonant");
  });

  it("invokes onSelectGame when pressing Enter on a focused row", () => {
    const handleSelect = vi.fn();
    render(
      <TopGamesList
        games={sampleGames}
        selectedGameName={null}
        onSelectGame={handleSelect}
        maxHours={7.66}
        listTitle="Top games in October 2026"
      />
    );

    const rows = screen.getAllByRole("button");
    fireEvent.keyDown(rows[0], { key: "Enter" });

    expect(handleSelect).toHaveBeenCalledWith("Mina the Hollower");
  });

  it("applies semantic warm-neutral tokens to selected/unselected rows and progress track", () => {
    const { container } = render(
      <TopGamesList
        games={sampleGames}
        selectedGameName="Mina the Hollower"
        onSelectGame={vi.fn()}
        maxHours={7.66}
        listTitle="Top games in October 2026"
      />
    );

    const rows = screen.getAllByRole("button");
    const selectedRow = rows[0];
    const unselectedRow = rows[1];

    // Selected row uses bg-card border-border-medium
    expect(selectedRow.className).toContain("bg-card");
    expect(selectedRow.className).toContain("border-border-medium");
    expect(selectedRow.className).not.toContain("#1c1c24");

    // Unselected row uses hover:bg-card/60 border-transparent
    expect(unselectedRow.className).toContain("hover:bg-card/60");
    expect(unselectedRow.className).not.toContain("#16161c");

    // Progress bar track uses bg-elevated
    const progressTrack = container.querySelector(".bg-elevated");
    expect(progressTrack).not.toBeNull();
    expect(container.innerHTML).not.toContain("#23232c");
  });
});
