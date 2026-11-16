import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import TagThumbnailConfigSection from "../TagThumbnailConfigSection";
import { TagThumbnailConfig } from "../../../types";

// Mock useThumbnailAssets so canvas assets are immediately ready
vi.mock("../../../hooks/useThumbnailAssets", () => ({
  useThumbnailAssets: vi.fn().mockReturnValue({
    steamAssets: {
      heroUrl: "https://steam.cdn/hero.jpg",
      headerUrl: "https://steam.cdn/header.jpg",
      posterUrl: "https://steam.cdn/poster.jpg",
    },
    loadingAssets: false,
    baseImage: {} as HTMLImageElement,
    logoImage: null,
    gameTitle: "Cyberpunk 2077",
  }),
}));

// Mock Wails backend App functions
vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetSteamAppID: vi.fn().mockResolvedValue("1091500"),
  GetSteamGameAssets: vi.fn().mockResolvedValue({
    heroUrl: "https://steam.cdn/hero.jpg",
    headerUrl: "https://steam.cdn/header.jpg",
    posterUrl: "https://steam.cdn/poster.jpg",
  }),
  SelectCustomThumbnailImage: vi.fn().mockResolvedValue("C:/images/custom.png"),
  SaveCustomThumbnail: vi.fn().mockResolvedValue("C:/cache/thumbs/custom.jpg"),
  SetYouTubePlaylistThumbnail: vi.fn().mockResolvedValue("/cache/yt_thumbs/custom.jpg?v=1"),
}));

describe("TagThumbnailConfigSection", () => {
  const defaultConfig: TagThumbnailConfig = {
    enabled: true,
    source_type: "steam",
    steam_asset_type: "hero",
    episode_position: "bottom-right",
    episode_format: "hash",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,123");
  });

  it("renders disabled state toggle correctly", () => {
    const onChange = vi.fn();
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={{ ...defaultConfig, enabled: false }}
        onChange={onChange}
      />
    );

    const toggle = screen.getByRole("checkbox");
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        episode_position: "bottom-right",
      })
    );
  });

  it("defaults episode_position to bottom-left when enabling without existing position", () => {
    const onChange = vi.fn();
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={{ enabled: false, source_type: "steam" }}
        onChange={onChange}
      />
    );

    const toggle = screen.getByRole("checkbox");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        episode_position: "bottom-left",
      })
    );
  });

  it("allows switching artwork source between Steam and custom image", async () => {
    const onChange = vi.fn();
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={defaultConfig}
        onChange={onChange}
      />
    );

    // Click Custom Image tab
    const customTab = screen.getByRole("button", { name: /custom image/i });
    fireEvent.click(customTab);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: "custom" })
    );
  });

  it("allows selecting episode position corner", () => {
    const onChange = vi.fn();
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={defaultConfig}
        onChange={onChange}
      />
    );

    const topLeftBtn = screen.getByRole("button", { name: /top left/i });
    fireEvent.click(topLeftBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ episode_position: "top-left" })
    );
  });

  it("allows changing episode number format", () => {
    const onChange = vi.fn();
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={defaultConfig}
        onChange={onChange}
      />
    );

    const formatSelect = screen.getByLabelText(/episode format/i);
    fireEvent.change(formatSelect, { target: { value: "ep" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ episode_format: "ep" })
    );
  });

  it("renders cover upload button and triggers upload when vodPlaylistId is provided", async () => {
    const onPlaylistCoverUpdated = vi.fn();
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={defaultConfig}
        onChange={vi.fn()}
        vodPlaylistId="vod-pl-123"
        onPlaylistCoverUpdated={onPlaylistCoverUpdated}
      />
    );

    const uploadVodBtn = screen.getByRole("button", { name: /upload to vod/i });
    expect(uploadVodBtn).toBeInTheDocument();

    await waitFor(() => {
      expect(uploadVodBtn).not.toBeDisabled();
    });

    fireEvent.click(uploadVodBtn);

    await waitFor(() => {
      expect(onPlaylistCoverUpdated).toHaveBeenCalledWith(
        "vod-pl-123",
        expect.any(String)
      );
    });
  });

  it("renders embedded preview canvas when hidePreviewCanvas is false or omitted", () => {
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={defaultConfig}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("Thumbnail Preview")).toBeInTheDocument();
    expect(screen.getByLabelText(/Thumbnail canvas preview with interactive elements/i)).toBeInTheDocument();
  });

  it("omits embedded preview canvas when hidePreviewCanvas is true while preserving controls", () => {
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={defaultConfig}
        onChange={vi.fn()}
        hidePreviewCanvas={true}
      />
    );

    expect(screen.queryByText("Thumbnail Preview")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Thumbnail canvas preview with interactive elements/i)).not.toBeInTheDocument();

    // Framing controls and element controls remain accessible
    expect(screen.getByText(/zoom framing/i)).toBeInTheDocument();
    expect(screen.getByText("Title & Logo Layers")).toBeInTheDocument();
  });

  it("renders episode font selector and persists chosen font to localStorage and config", () => {
    localStorage.clear();
    const onChange = vi.fn();
    render(
      <TagThumbnailConfigSection
        tag="Cyberpunk 2077"
        value={defaultConfig}
        onChange={onChange}
      />
    );

    const fontSelect = screen.getByLabelText("Episode Font");
    expect(fontSelect).toBeInTheDocument();
    expect(fontSelect).toHaveValue("Montserrat");

    fireEvent.change(fontSelect, { target: { value: "Nunito" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        font_family: "Nunito",
      })
    );
    expect(localStorage.getItem("amon_hen_thumbnail_font_family")).toBe("Nunito");
  });

  it("does not trigger an infinite render loop when switching episode position with nested framing and layout config", () => {
    const onChange = vi.fn();
    const configWithNestedObjects: TagThumbnailConfig = {
      ...defaultConfig,
      image_framing: { offset_x: 0.5, offset_y: 0.5, zoom: 1.2 },
      episode_layout: { x: 0.15, y: 0.85, scale: 1 },
      logo: { enabled: true, x: 0.2, y: 0.2, scale: 1 },
      title: { enabled: true, x: 0.5, y: 0.85, scale: 1 },
    };

    const { rerender } = render(
      <TagThumbnailConfigSection
        tag="Death Stranding"
        value={configWithNestedObjects}
        onChange={onChange}
      />
    );

    const topLeftBtn = screen.getByRole("button", { name: "Top Left" });
    fireEvent.click(topLeftBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0] as TagThumbnailConfig;
    expect(updated.episode_position).toBe("top-left");

    rerender(
      <TagThumbnailConfigSection
        tag="Death Stranding"
        value={updated}
        onChange={onChange}
      />
    );

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});


