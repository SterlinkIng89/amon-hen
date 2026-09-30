import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ContentTypeToggle } from "../ContentTypeToggle";

describe("ContentTypeToggle", () => {
  it("renders all three options with auto indicator", () => {
    render(
      <ContentTypeToggle
        selectedContentType=""
        autoResolvedType="clip"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /auto \(clip\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VOD" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clip" })).toBeInTheDocument();
  });

  it("calls onChange when an option is clicked", () => {
    const onChange = vi.fn();
    render(
      <ContentTypeToggle
        selectedContentType=""
        autoResolvedType="vod"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clip" }));
    expect(onChange).toHaveBeenCalledWith("clip");

    fireEvent.click(screen.getByRole("button", { name: "VOD" }));
    expect(onChange).toHaveBeenCalledWith("vod");

    fireEvent.click(screen.getByRole("button", { name: /auto \(vod\)/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
