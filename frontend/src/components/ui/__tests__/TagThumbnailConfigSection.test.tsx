import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TagThumbnailConfigSection from "../TagThumbnailConfigSection";
import { TagThumbnailConfig } from "../../../types";

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
      expect.objectContaining({ enabled: true })
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
});

