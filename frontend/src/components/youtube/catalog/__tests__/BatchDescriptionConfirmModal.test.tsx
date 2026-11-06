import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchDescriptionConfirmModal } from "../BatchDescriptionConfirmModal";

describe("BatchDescriptionConfirmModal", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BatchDescriptionConfirmModal
        isOpen={false}
        targetCount={5}
        quotaUnits={250}
        descriptionPreview="Some description"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders video count, quota units, and description preview when open", () => {
    render(
      <BatchDescriptionConfirmModal
        isOpen={true}
        targetCount={5}
        quotaUnits={250}
        descriptionPreview="Detailed description preview\nLine 2"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Confirm Description Update/i)).toBeInTheDocument();
    expect(screen.getByText(/5 videos/i)).toBeInTheDocument();
    expect(screen.getByText(/250 units/i)).toBeInTheDocument();
    expect(screen.getByText(/Detailed description preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Line 2/i)).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <BatchDescriptionConfirmModal
        isOpen={true}
        targetCount={2}
        quotaUnits={100}
        descriptionPreview="My preview"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: /Apply & update YouTube/i });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <BatchDescriptionConfirmModal
        isOpen={true}
        targetCount={2}
        quotaUnits={100}
        descriptionPreview="My preview"
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key press", () => {
    const onClose = vi.fn();
    render(
      <BatchDescriptionConfirmModal
        isOpen={true}
        targetCount={2}
        quotaUnits={100}
        descriptionPreview="My preview"
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
