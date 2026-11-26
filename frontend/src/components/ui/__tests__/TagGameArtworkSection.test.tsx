import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TagGameArtworkSection } from "../TagGameArtworkSection";
import * as AppBindings from "../../../../wailsjs/go/backend/App";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  SetTagGameArtwork: vi.fn(),
  UploadTagGameArtworkFile: vi.fn(),
}));

describe("TagGameArtworkSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AppBindings.SetTagGameArtwork).mockResolvedValue(undefined);
  });

  it("renders both poster and hero slots with empty state", () => {
    render(
      <TagGameArtworkSection
        tag="League of Legends"
        onArtworkChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Card Poster (2:3)")).toBeInTheDocument();
    expect(screen.getByText("Banner / Hero (16:9)")).toBeInTheDocument();
    expect(screen.getAllByText("No custom artwork")).toHaveLength(2);
  });

  it("uploads a local image file for the poster slot", async () => {
    const onArtworkChange = vi.fn();
    vi.mocked(AppBindings.UploadTagGameArtworkFile).mockResolvedValue(
      "/cache/game_artwork/lol_poster.png",
    );

    render(
      <TagGameArtworkSection
        tag="League of Legends"
        artwork={{ hero_url: "https://example.com/hero.jpg" }}
        onArtworkChange={onArtworkChange}
      />,
    );

    const uploadButtons = screen.getAllByRole("button", { name: "Upload Image" });
    fireEvent.click(uploadButtons[0]);

    await waitFor(() => {
      expect(AppBindings.UploadTagGameArtworkFile).toHaveBeenCalledWith(
        "League of Legends",
        "poster",
      );
    });

    expect(onArtworkChange).toHaveBeenCalledWith({
      poster_url: "/cache/game_artwork/lol_poster.png",
      hero_url: "https://example.com/hero.jpg",
    });
  });

  it("applies a custom URL for the hero slot", async () => {
    const onArtworkChange = vi.fn();

    render(
      <TagGameArtworkSection
        tag="League of Legends"
        artwork={{ poster_url: "https://example.com/poster.jpg" }}
        onArtworkChange={onArtworkChange}
      />,
    );

    const heroInput = screen.getByLabelText("Banner / Hero (16:9) URL");
    fireEvent.change(heroInput, {
      target: { value: "https://example.com/new-hero.jpg" },
    });

    const applyButtons = screen.getAllByRole("button", { name: "Apply" });
    fireEvent.click(applyButtons[1]);

    await waitFor(() => {
      expect(AppBindings.SetTagGameArtwork).toHaveBeenCalledWith(
        "League of Legends",
        "https://example.com/poster.jpg",
        "https://example.com/new-hero.jpg",
      );
    });

    expect(onArtworkChange).toHaveBeenCalledWith({
      poster_url: "https://example.com/poster.jpg",
      hero_url: "https://example.com/new-hero.jpg",
    });
  });

  it("clears custom artwork for a slot", async () => {
    const onArtworkChange = vi.fn();

    render(
      <TagGameArtworkSection
        tag="League of Legends"
        artwork={{
          poster_url: "https://example.com/poster.jpg",
          hero_url: "https://example.com/hero.jpg",
        }}
        onArtworkChange={onArtworkChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear Card Poster (2:3)" }));

    await waitFor(() => {
      expect(AppBindings.SetTagGameArtwork).toHaveBeenCalledWith(
        "League of Legends",
        "",
        "https://example.com/hero.jpg",
      );
    });

    expect(onArtworkChange).toHaveBeenCalledWith({
      poster_url: undefined,
      hero_url: "https://example.com/hero.jpg",
    });
  });

  it("displays an inline error if backend rejects an invalid URL", async () => {
    vi.mocked(AppBindings.SetTagGameArtwork).mockRejectedValue(
      new Error("poster URL: invalid artwork URL scheme"),
    );

    render(
      <TagGameArtworkSection
        tag="League of Legends"
        onArtworkChange={vi.fn()}
      />,
    );

    const posterInput = screen.getByLabelText("Card Poster (2:3) URL");
    fireEvent.change(posterInput, {
      target: { value: "ftp://invalid.example/poster.jpg" },
    });

    const applyButtons = screen.getAllByRole("button", { name: "Apply" });
    fireEvent.click(applyButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "poster URL: invalid artwork URL scheme",
      );
    });
  });
});
