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

  it("renders custom thumb badge and accented thumbnail border when hasCustomTemplate is true", () => {
    const playlist = {
      playlistId: "pl-custom",
      title: "Hades VODs",
      videoCount: 5,
      linked: true,
      tag: "Hades",
      hasCustomTemplate: true,
      thumbnailUrl: "https://example.com/custom_preview.jpg",
    } as backend.CatalogPlaylistSummary;

    render(
      <PlaylistCatalogRow
        playlist={playlist}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Custom thumb")).toBeInTheDocument();
    const thumbContainer = screen.getByRole("img", { name: "Hades VODs" }).parentElement;
    expect(thumbContainer).toHaveClass("border-accent/40");
  });

  it("does not render custom thumb badge when hasCustomTemplate is false", () => {
    const playlist = {
      playlistId: "pl-default",
      title: "Hades VODs",
      videoCount: 5,
      linked: true,
      tag: "Hades",
      hasCustomTemplate: false,
    } as backend.CatalogPlaylistSummary;

    render(
      <PlaylistCatalogRow
        playlist={playlist}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByText("Custom thumb")).not.toBeInTheDocument();
  });
});

