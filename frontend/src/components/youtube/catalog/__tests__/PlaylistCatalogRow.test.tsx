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

  it("renders thumbnail image and clips badge when provided", () => {
    const playlist = {
      playlistId: "pl-3",
      title: "Best Moments",
      videoCount: 1,
      linked: false,
      kind: "clip",
      thumbnailUrl: "https://example.com/thumb.jpg",
      tag: "",
    } as backend.CatalogPlaylistSummary;

    render(
      <PlaylistCatalogRow
        playlist={playlist}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    const img = screen.getByRole("img", { name: "Best Moments" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/thumb.jpg");
    expect(screen.getByText("Clips")).toBeInTheDocument();
    expect(screen.getByText("1 video")).toBeInTheDocument();
  });

  it("renders suggested match badge when tagConfidence is known and unlinked", () => {
    const playlist = {
      playlistId: "pl-4",
      title: "Control DLC",
      videoCount: 4,
      linked: false,
      tag: "control",
      tagConfidence: "known",
    } as backend.CatalogPlaylistSummary;

    render(
      <PlaylistCatalogRow
        playlist={playlist}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Suggested: control")).toBeInTheDocument();
  });

  it("does not render a custom thumb badge and shows the template image as the cover", () => {
    const playlist = {
      playlistId: "pl-custom",
      title: "Hades VODs",
      videoCount: 5,
      linked: true,
      tag: "Hades",
      hasCustomTemplate: true,
      thumbnailUrl: "/cache/yt_thumbs/tag_template.jpg?v=1",
    } as backend.CatalogPlaylistSummary;

    render(
      <PlaylistCatalogRow
        playlist={playlist}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByText("Custom thumb")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hades VODs" })).toHaveAttribute(
      "src",
      "/cache/yt_thumbs/tag_template.jpg?v=1"
    );
  });
});
