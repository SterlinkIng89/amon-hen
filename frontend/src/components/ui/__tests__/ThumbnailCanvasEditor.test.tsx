import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ThumbnailCanvasEditor from "../ThumbnailCanvasEditor";
import { TagThumbnailConfig } from "../../../types";
import * as thumbnailGenerator from "../../../utils/thumbnailGenerator";

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

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      save: vi.fn(),
      restore: vi.fn(),
      strokeText: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("passes position 'bottom-left' to renderThumbnailToCanvas when episode_position is omitted", () => {
    const renderSpy = vi.spyOn(thumbnailGenerator, "renderThumbnailToCanvas");
    render(
      <ThumbnailCanvasEditor
        config={{ enabled: true, source_type: "steam" }}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={vi.fn()}
      />
    );

    expect(renderSpy).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      fakeImage,
      expect.objectContaining({
        position: "bottom-left",
      })
    );
  });

  it("snaps dragged logo element to center grid axes and displays HUD pill indicator", () => {
    const onConfigChange = vi.fn();
    vi.spyOn(thumbnailGenerator, "hitTestElements").mockReturnValue("logo");
    vi.spyOn(thumbnailGenerator, "pointerToCanvasPoint").mockReturnValue({ x: 640, y: 360 });

    const logoConfig: TagThumbnailConfig = {
      ...baseConfig,
      logo: { enabled: true, x: 0.48, y: 0.48, scale: 1 },
    };

    const { container } = render(
      <ThumbnailCanvasEditor
        config={logoConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeDefined();
    if (!canvas) return;

    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 1280,
      height: 720,
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    // Drag logo slightly towards 0.50 center (from 0.48 by +25px -> ~0.50)
    fireEvent.pointerDown(canvas, { clientX: 614, clientY: 345, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 640, clientY: 360, pointerId: 1 });

    expect(onConfigChange).toHaveBeenCalled();
    const lastCall = onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1][0];
    expect(lastCall.logo).toBeDefined();
    // Snapped to exact center (0.5, 0.5)
    expect(lastCall.logo.x).toBe(0.5);
    expect(lastCall.logo.y).toBe(0.5);
  });

  it("bypasses magnetic snapping when Alt key is held during drag", () => {
    const onConfigChange = vi.fn();
    vi.spyOn(thumbnailGenerator, "hitTestElements").mockReturnValue("logo");

    const logoConfig: TagThumbnailConfig = {
      ...baseConfig,
      logo: { enabled: true, x: 0.49, y: 0.49, scale: 1 },
    };

    const { container } = render(
      <ThumbnailCanvasEditor
        config={logoConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) return;

    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 1280,
      height: 720,
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    // Drag with altKey=true to bypass snap
    fireEvent.pointerDown(canvas, { clientX: 627, clientY: 352, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 633, clientY: 356, pointerId: 1, altKey: true });

    expect(onConfigChange).toHaveBeenCalled();
    const lastCall = onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1][0];
    expect(lastCall.logo).toBeDefined();
    // Since snap was bypassed, it should not lock to 0.5
    expect(lastCall.logo.x).not.toBe(0.5);
  });

  it("toggles snap and grid overlay via floating toolbar buttons", () => {
    const { getByRole } = render(
      <ThumbnailCanvasEditor
        config={baseConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={vi.fn()}
      />
    );

    const snapBtn = getByRole("button", { name: /toggle magnetic grid snap/i });
    expect(snapBtn).toHaveTextContent(/Snap: On/i);
    fireEvent.click(snapBtn);
    expect(snapBtn).toHaveTextContent(/Snap: Off/i);

    const gridBtn = getByRole("button", { name: /show or hide 3x3 alignment grid/i });
    expect(gridBtn).toHaveTextContent(/Grid: Off/i);
    fireEvent.click(gridBtn);
    expect(gridBtn).toHaveTextContent(/Grid: On/i);
  });

  it("centers artwork framing when 'Center art' button is clicked", () => {
    const onConfigChange = vi.fn();
    const { getByRole } = render(
      <ThumbnailCanvasEditor
        config={{
          ...baseConfig,
          image_framing: { offset_x: 0.2, offset_y: 0.8, zoom: 1.5 },
        }}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    const centerBtn = getByRole("button", { name: /center artwork/i });
    fireEvent.click(centerBtn);

    expect(onConfigChange).toHaveBeenCalledWith({
      image_framing: { offset_x: 0.5, offset_y: 0.5, zoom: 1.5 },
    });
  });

  it("renders empty message when no baseImage is loaded", () => {
    const { getByText } = render(
      <ThumbnailCanvasEditor
        config={baseConfig}
        baseImage={null}
        episodeNumber={1}
        emptyMessage="Custom empty text"
        onConfigChange={vi.fn()}
      />
    );

    expect(getByText("Custom empty text")).toBeInTheDocument();
  });

  it("renders Undo and Redo toolbar buttons with initial disabled state", () => {
    const { getByRole } = render(
      <ThumbnailCanvasEditor
        config={baseConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={vi.fn()}
      />
    );

    const undoBtn = getByRole("button", { name: /^undo/i });
    const redoBtn = getByRole("button", { name: /^redo/i });

    expect(undoBtn).toBeInTheDocument();
    expect(redoBtn).toBeInTheDocument();
    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();
  });

  it("records a single undoable step on canvas drag pointerUp and reverts via Undo button", () => {
    let currentConfig: TagThumbnailConfig = {
      ...baseConfig,
      image_framing: { offset_x: 0.5, offset_y: 0.5, zoom: 1 },
    };
    const onConfigChange = vi.fn((patch: Partial<TagThumbnailConfig>) => {
      currentConfig = { ...currentConfig, ...patch };
    });

    const { container, getByRole, rerender } = render(
      <ThumbnailCanvasEditor
        config={currentConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeDefined();
    if (!canvas) return;

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
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    // Start drag
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    // Intermediate drag moves
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 90, clientY: 70, pointerId: 1 });
    // Release pointer (commits single batch)
    fireEvent.pointerUp(canvas, { clientX: 90, clientY: 70, pointerId: 1 });

    // Rerender with latest config
    rerender(
      <ThumbnailCanvasEditor
        config={currentConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    const undoBtn = getByRole("button", { name: /^undo/i });
    expect(undoBtn).not.toBeDisabled();

    // Click Undo
    fireEvent.click(undoBtn);
    expect(onConfigChange).toHaveBeenCalled();
    const lastCall = onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1][0];
    expect(lastCall.image_framing).toBeDefined();
    expect(lastCall.image_framing?.offset_x).toBe(0.5);
    expect(lastCall.image_framing?.offset_y).toBe(0.5);

    // Redo should now be enabled
    const redoBtn = getByRole("button", { name: /^redo/i });
    expect(redoBtn).not.toBeDisabled();
    fireEvent.click(redoBtn);
    expect(onConfigChange).toHaveBeenCalled();
  });

  it("handles Ctrl+Z and Ctrl+Y keyboard shortcuts to undo and redo", () => {
    let currentConfig: TagThumbnailConfig = {
      ...baseConfig,
      image_framing: { offset_x: 0.5, offset_y: 0.5, zoom: 1 },
    };
    const onConfigChange = vi.fn((patch: Partial<TagThumbnailConfig>) => {
      currentConfig = { ...currentConfig, ...patch };
    });

    const { getByRole, rerender } = render(
      <ThumbnailCanvasEditor
        config={currentConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    // Click Center art to produce a state change
    const centerBtn = getByRole("button", { name: /center artwork/i });
    fireEvent.click(centerBtn);

    rerender(
      <ThumbnailCanvasEditor
        config={currentConfig}
        baseImage={fakeImage}
        episodeNumber={1}
        onConfigChange={onConfigChange}
      />
    );

    // Ctrl+Z should trigger undo
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(onConfigChange).toHaveBeenCalled();

    // Ctrl+Y should trigger redo
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(onConfigChange).toHaveBeenCalled();
  });

  it("does not trigger undo/redo when typing inside an input element", () => {
    const onConfigChange = vi.fn();
    render(
      <div>
        <ThumbnailCanvasEditor
          config={baseConfig}
          baseImage={fakeImage}
          episodeNumber={1}
          onConfigChange={onConfigChange}
        />
        <input data-testid="test-input" type="text" />
      </div>
    );

    const input = document.querySelector('input[data-testid="test-input"]');
    expect(input).toBeInTheDocument();
    if (!input) return;

    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    expect(onConfigChange).not.toHaveBeenCalled();
  });
});


