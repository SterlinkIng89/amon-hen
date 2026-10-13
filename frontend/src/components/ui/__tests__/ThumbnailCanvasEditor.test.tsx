import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ThumbnailCanvasEditor from "../ThumbnailCanvasEditor";
import { TagThumbnailConfig } from "../../../types";

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillStyle: "",
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
  save: vi.fn(),
  restore: vi.fn(),
  strokeText: vi.fn(),
  fillText: vi.fn(),
}) as any;

describe("ThumbnailCanvasEditor", () => {
  const baseConfig: TagThumbnailConfig = {
    enabled: true,
    source_type: "steam",
    episode_position: "bottom-right",
    episode_format: "pad2",
  };

  const fakeImage = {
    complete: true,
    naturalWidth: 1000,
    naturalHeight: 1000,
  } as unknown as HTMLImageElement;

  it("renders a canvas and calls onConfigChange with new image_framing when dragged", () => {
    const onConfigChange = vi.fn();
    const { container } = render(
      <ThumbnailCanvasEditor
        config={baseConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeDefined();
    if (!canvas) return;

    // Mock getBoundingClientRect
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 180,
      height: 101.25,
      left: 0,
      top: 0,
      right: 180,
      bottom: 101.25,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Mock pointer capture
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    // Start drag
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    // Move pointer
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 60, pointerId: 1 });
    // Release pointer
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 60, pointerId: 1 });

    expect(onConfigChange).toHaveBeenCalled();
    const callArg = onConfigChange.mock.calls[0][0];
    expect(callArg.image_framing).toBeDefined();
    expect(typeof callArg.image_framing.offset_x).toBe("number");
    expect(typeof callArg.image_framing.offset_y).toBe("number");
  });

  it("does not trigger framing change on drag if no baseImage is loaded", () => {
    const onConfigChange = vi.fn();
    const { container } = render(
      <ThumbnailCanvasEditor
        config={baseConfig}
        baseImage={null}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) return;

    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 60 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 60 });

    expect(onConfigChange).not.toHaveBeenCalled();
  });
});
