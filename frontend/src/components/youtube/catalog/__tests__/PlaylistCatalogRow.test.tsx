import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlaylistCatalogRow } from "../PlaylistCatalogRow";
import { backend } from "../../../../../wailsjs/go/models";

describe("PlaylistCatalogRow", () => {
  it("renders unlinked playlist summary and responds to click", () => {
    const onSelect = vi.fn();
    const playlist = {
      playlistId: "pl-1",
      title: "Control Walkthrough",
      videoCount: 12,
      linked: false,
      tag: "",
    } as backend.CatalogPlaylistSummary;

    render(
      <PlaylistCatalogRow
        playlist={playlist}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("Control Walkthrough")).toBeInTheDocument();
    expect(screen.getByText("12 videos")).toBeInTheDocument();
    expect(screen.getByText("Unlinked")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("renders linked playlist summary with current tag", () => {
    const playlist = {
      playlistId: "pl-2",
      title: "Alan Wake 2 Playthrough",
      videoCount: 8,
      linked: true,
      tag: "alan_wake_2",
    } as backend.CatalogPlaylistSummary;

    render(
      <PlaylistCatalogRow
        playlist={playlist}
        isSelected={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Alan Wake 2 Playthrough")).toBeInTheDocument();
    expect(screen.getByText("alan_wake_2")).toBeInTheDocument();
  });
});
