import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PlaylistCard from "../PlaylistCard";
import { YTPlaylist } from "../../../types";
import * as appBackend from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  DeletePlaylist: vi.fn().mockResolvedValue(undefined),
}));

const mockPlaylist: YTPlaylist = {
  id: "pl-test-1",
  title: "Valorant Ranked Highlights",
  description: "Best clips from ranked matches",
  thumbnailUrl: "https://example.com/thumb.jpg",
  videoCount: 12,
  privacy: "public",
  publishedAt: "2026-01-01T00:00:00Z",
};

describe("PlaylistCard", () => {
  it("renders public visibility badge directly below title in grid mode", () => {
    render(<PlaylistCard playlist={mockPlaylist} viewMode="grid" />);

    expect(screen.getByText("Valorant Ranked Highlights")).toBeInTheDocument();
    const badge = screen.getByText("Public").closest("span");
    expect(badge).toBeInTheDocument();
    expect(screen.getByText("12 videos")).toBeInTheDocument();

    const titleGroup = screen.getByTestId("playlist-card-header");
    expect(titleGroup).toContainElement(badge);

    const footer = screen.getByTestId("playlist-card-footer");
    expect(footer).toContainElement(screen.getByText("12 videos"));
    expect(footer).not.toContainElement(badge);
  });

  it("renders unlisted visibility badge directly below title in list mode", () => {
    const unlistedPlaylist: YTPlaylist = {
      ...mockPlaylist,
      privacy: "unlisted",
    };

    render(<PlaylistCard playlist={unlistedPlaylist} viewMode="list" />);

    expect(screen.getByText("Valorant Ranked Highlights")).toBeInTheDocument();
    const badge = screen.getByText("Unlisted").closest("span");
    expect(badge).toBeInTheDocument();

    const titleGroup = screen.getByTestId("playlist-card-header");
    expect(titleGroup).toContainElement(badge);

    const footer = screen.getByTestId("playlist-card-footer");
    expect(footer).toContainElement(screen.getByText("12 videos"));
    expect(footer).not.toContainElement(badge);
  });

  it("renders private visibility badge directly below title", () => {
    const privatePlaylist: YTPlaylist = {
      ...mockPlaylist,
      privacy: "private",
    };

    render(<PlaylistCard playlist={privatePlaylist} />);

    expect(screen.getByText("Private")).toBeInTheDocument();
    const badge = screen.getByText("Private").closest("span");
    const titleGroup = screen.getByTestId("playlist-card-header");
    expect(titleGroup).toContainElement(badge);
  });

  it("falls back to Public when privacy is undefined or empty", () => {
    const noPrivacyPlaylist: YTPlaylist = {
      ...mockPlaylist,
      privacy: "",
    };

    render(<PlaylistCard playlist={noPrivacyPlaylist} />);

    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("handles selection toggle and card click", () => {
    const onClick = vi.fn();
    const onSelectToggle = vi.fn();

    const { container } = render(
      <PlaylistCard
        playlist={mockPlaylist}
        onClick={onClick}
        onSelectToggle={onSelectToggle}
      />
    );

    // Card click
    fireEvent.click(screen.getByText("Valorant Ranked Highlights"));
    expect(onClick).toHaveBeenCalled();

    // Select toggle
    const checkbox = container.querySelector(".select-none > div:first-child > div:first-child");
    if (checkbox) {
      fireEvent.click(checkbox);
      expect(onSelectToggle).toHaveBeenCalled();
    }
  });

  it("handles deletion confirmation and calling DeletePlaylist", async () => {
    const onDeleted = vi.fn();
    render(<PlaylistCard playlist={mockPlaylist} onDeleted={onDeleted} />);

    const deleteBtn = screen.getByTitle("Delete playlist from YouTube");
    fireEvent.click(deleteBtn);

    expect(screen.getByText("Delete from YouTube?")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(appBackend.DeletePlaylist).toHaveBeenCalledWith("pl-test-1");
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it("renders duplicate warning badge when duplicateCount > 0 in grid view", () => {
    const playlistWithDups: YTPlaylist = {
      ...mockPlaylist,
      duplicateCount: 1,
    };

    render(<PlaylistCard playlist={playlistWithDups} viewMode="grid" />);

    const badge = screen.getByTestId("duplicate-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1 duplicate");

    const header = screen.getByTestId("playlist-card-header");
    expect(header).toContainElement(badge);
  });

  it("renders duplicate warning badge with correct pluralization in list view", () => {
    const playlistWithMultipleDups: YTPlaylist = {
      ...mockPlaylist,
      duplicateCount: 3,
    };

    render(<PlaylistCard playlist={playlistWithMultipleDups} viewMode="list" />);

    const badge = screen.getByTestId("duplicate-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3 duplicates");

    const header = screen.getByTestId("playlist-card-header");
    expect(header).toContainElement(badge);
  });

  it("does not render duplicate badge when duplicateCount is 0 or undefined", () => {
    const { rerender } = render(<PlaylistCard playlist={mockPlaylist} viewMode="grid" />);
    expect(screen.queryByTestId("duplicate-badge")).not.toBeInTheDocument();

    const playlistZeroDups: YTPlaylist = {
      ...mockPlaylist,
      duplicateCount: 0,
    };
    rerender(<PlaylistCard playlist={playlistZeroDups} viewMode="grid" />);
    expect(screen.queryByTestId("duplicate-badge")).not.toBeInTheDocument();
  });
});

