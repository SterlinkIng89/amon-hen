import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FieldInput from "../FieldInput";

const mockAddRecentValue = vi.fn();
const mockRemoveRecentValue = vi.fn();
let mockSuggestions: string[] = ["Cuadrakill", "Pentakill"];

vi.mock("../../../hooks/useRecentFieldValues", () => ({
  useRecentFieldValues: () => ({
    getRecentValues: (key: string) => mockSuggestions,
    addRecentValue: mockAddRecentValue,
    removeRecentValue: mockRemoveRecentValue,
  }),
}));

describe("FieldInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestions = ["Cuadrakill", "Pentakill"];
  });

  it("renders with placeholder and value", () => {
    render(
      <FieldInput
        fieldKey="event"
        value="Highlight 1"
        onChange={vi.fn()}
        placeholder="Enter event..."
      />,
    );

    const input = screen.getByPlaceholderText("Enter event...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Highlight 1");
  });

  it("shows suggestions matching the typed text", () => {
    render(
      <FieldInput
        fieldKey="event"
        value="Cuad"
        onChange={vi.fn()}
        placeholder="Enter event..."
      />,
    );

    const input = screen.getByPlaceholderText("Enter event...");
    fireEvent.focus(input);

    expect(screen.getByText("Cuadrakill")).toBeInTheDocument();
    expect(screen.queryByText("Pentakill")).not.toBeInTheDocument();
  });

  it("does not save partial typed input to recent values when selecting a suggestion", () => {
    const onChange = vi.fn();
    render(
      <FieldInput
        fieldKey="event"
        value="Cuad"
        onChange={onChange}
        placeholder="Enter event..."
      />,
    );

    const input = screen.getByPlaceholderText("Enter event...");
    fireEvent.focus(input);

    const suggestionItem = screen.getByText("Cuadrakill");
    fireEvent.mouseDown(suggestionItem);
    fireEvent.click(suggestionItem);

    // Should call onChange with selected suggestion
    expect(onChange).toHaveBeenCalledWith("Cuadrakill");
    // Should save selected suggestion, NOT the partial text "Cuad"
    expect(mockAddRecentValue).toHaveBeenCalledWith("event", "Cuadrakill");
    expect(mockAddRecentValue).not.toHaveBeenCalledWith("event", "Cuad");
  });

  it("does not save partial typed input to recent values on blur", () => {
    const onBlur = vi.fn();
    render(
      <FieldInput
        fieldKey="event"
        value="Cuad"
        onChange={vi.fn()}
        onBlur={onBlur}
        placeholder="Enter event..."
      />,
    );

    const input = screen.getByPlaceholderText("Enter event...");
    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onBlur).toHaveBeenCalled();
    expect(mockAddRecentValue).not.toHaveBeenCalledWith("event", "Cuad");
  });

  it("saves confirmed value and triggers onEnter when Enter is pressed", () => {
    const onEnter = vi.fn();
    render(
      <FieldInput
        fieldKey="event"
        value="Triple Kill"
        onChange={vi.fn()}
        onEnter={onEnter}
        placeholder="Enter event..."
      />,
    );

    const input = screen.getByPlaceholderText("Enter event...");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(mockAddRecentValue).toHaveBeenCalledWith("event", "Triple Kill");
    expect(onEnter).toHaveBeenCalled();
  });

  it("allows removing an existing suggestion from the dropdown without selecting it", () => {
    const onChange = vi.fn();
    render(
      <FieldInput
        fieldKey="event"
        value=""
        onChange={onChange}
        placeholder="Enter event..."
      />,
    );

    const input = screen.getByPlaceholderText("Enter event...");
    fireEvent.focus(input);

    const removeBtns = screen.getAllByRole("button", {
      name: /remove suggestion/i,
    });
    expect(removeBtns.length).toBe(2);

    fireEvent.mouseDown(removeBtns[0]);
    fireEvent.click(removeBtns[0]);

    expect(mockRemoveRecentValue).toHaveBeenCalledWith("event", "Cuadrakill");
    expect(onChange).not.toHaveBeenCalled();
    expect(mockAddRecentValue).not.toHaveBeenCalled();
  });
});
