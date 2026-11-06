import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ThumbnailCanvasToolbar from "../ThumbnailCanvasToolbar";

describe("ThumbnailCanvasToolbar", () => {
  const defaultProps = {
    hasBaseImage: true,
    canUndo: true,
    canRedo: true,
    snapEnabled: true,
    showGrid: false,
    showSafeZone: false,
    onCenterArtwork: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onToggleSnap: vi.fn(),
    onToggleGrid: vi.fn(),
    onToggleSafeZone: vi.fn(),
  };

  it("renders toolbar buttons and handles clicks", () => {
    const { getByRole } = render(<ThumbnailCanvasToolbar {...defaultProps} />);

    const centerBtn = getByRole("button", { name: /center artwork/i });
    fireEvent.click(centerBtn);
    expect(defaultProps.onCenterArtwork).toHaveBeenCalledTimes(1);

    const undoBtn = getByRole("button", { name: "Undo" });
    fireEvent.click(undoBtn);
    expect(defaultProps.onUndo).toHaveBeenCalledTimes(1);

    const redoBtn = getByRole("button", { name: "Redo" });
    fireEvent.click(redoBtn);
    expect(defaultProps.onRedo).toHaveBeenCalledTimes(1);

    const snapBtn = getByRole("button", { name: /toggle magnetic grid snap/i });
    fireEvent.click(snapBtn);
    expect(defaultProps.onToggleSnap).toHaveBeenCalledTimes(1);

    const gridBtn = getByRole("button", { name: /show or hide 3x3 alignment grid/i });
    fireEvent.click(gridBtn);
    expect(defaultProps.onToggleGrid).toHaveBeenCalledTimes(1);

    const safeZoneBtn = getByRole("button", { name: /toggle youtube timestamp safe zone overlay/i });
    fireEvent.click(safeZoneBtn);
    expect(defaultProps.onToggleSafeZone).toHaveBeenCalledTimes(1);
  });

  it("disables actions when conditions are not met", () => {
    const { getByRole } = render(
      <ThumbnailCanvasToolbar
        {...defaultProps}
        hasBaseImage={false}
        canUndo={false}
        canRedo={false}
      />
    );

    expect(getByRole("button", { name: /center artwork/i })).toBeDisabled();
    expect(getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(getByRole("button", { name: "Redo" })).toBeDisabled();
  });
});
