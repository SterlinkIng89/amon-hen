import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ThumbnailElementControls from "../ThumbnailElementControls";
import { TagThumbnailConfig } from "../../../types";

describe("ThumbnailElementControls", () => {
  const baseConfig: TagThumbnailConfig = {
    enabled: true,
    source_type: "steam",
    steam_asset_type: "hero",
    episode_position: "bottom-right",
    episode_format: "pad2",
    logo: {
      enabled: true,
      x: 0.2,
      y: 0.2,
      scale: 1,
    },
    title: {
      enabled: true,
      x: 0.5,
      y: 0.85,
      scale: 1,
      color: "#ffffff",
    },
  };

  it("calls onChange with top-left preset coordinates when clicking Top Left in Logo matrix", () => {
    const onChange = vi.fn();
    render(
      <ThumbnailElementControls
        config={baseConfig}
        hasLogo={true}
        defaultTitle="Control"
        onChange={onChange}
      />
    );

    const tlBtn = screen.getByRole("button", { name: /Logo Top Left/i });
    expect(tlBtn).toBeInTheDocument();
    fireEvent.click(tlBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        logo: expect.objectContaining({
          x: 0.18,
          y: 0.18,
        }),
      })
    );
  });

  it("calls onChange with centered coordinates when clicking Center X and Center Both", () => {
    const onChange = vi.fn();
    render(
      <ThumbnailElementControls
        config={baseConfig}
        hasLogo={true}
        defaultTitle="Control"
        onChange={onChange}
      />
    );

    const centerXBtn = screen.getByRole("button", { name: /Logo Center X/i });
    fireEvent.click(centerXBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        logo: expect.objectContaining({
          x: 0.5,
          y: 0.2,
        }),
      })
    );

    const centerBothBtn = screen.getByRole("button", { name: /Logo Center Both/i });
    fireEvent.click(centerBothBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        logo: expect.objectContaining({
          x: 0.5,
          y: 0.5,
        }),
      })
    );
  });

  it("renders 9-point matrix and centering controls for Title overlay", () => {
    const onChange = vi.fn();
    render(
      <ThumbnailElementControls
        config={baseConfig}
        hasLogo={true}
        defaultTitle="Control"
        onChange={onChange}
      />
    );

    const titleBottomCenterBtn = screen.getByRole("button", { name: /Title Bottom Center/i });
    fireEvent.click(titleBottomCenterBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.objectContaining({
          x: 0.5,
          y: 0.82,
        }),
      })
    );
  });

  it("renders centering and corner alignment controls for Episode badge when episode_layout is active", () => {
    const onChange = vi.fn();
    const configWithEpisode: TagThumbnailConfig = {
      ...baseConfig,
      episode_layout: {
        x: 0.85,
        y: 0.85,
        scale: 1,
      },
    };

    render(
      <ThumbnailElementControls
        config={configWithEpisode}
        hasLogo={true}
        defaultTitle="Control"
        onChange={onChange}
      />
    );

    const epTopRightBtn = screen.getByRole("button", { name: /Episode Top Right/i });
    fireEvent.click(epTopRightBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        episode_layout: expect.objectContaining({
          x: 0.82,
          y: 0.18,
        }),
      })
    );
  });
});
