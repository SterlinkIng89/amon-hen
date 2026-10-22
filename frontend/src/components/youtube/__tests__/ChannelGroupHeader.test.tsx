import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ChannelGroupHeader from "../ChannelGroupHeader";
import { VideoGroupYT } from "../../../types";

describe("ChannelGroupHeader", () => {
  const mockGroup: VideoGroupYT = {
    label: "October 21, 2026",
    dateKey: "2026-10-21",
    videos: [
      {
        id: "v1",
        title: "Video 1",
        description: "",
        publishedAt: "2026-10-21T10:00:00Z",
        thumbnailUrl: "",
        viewCount: 1200,
        likeCount: 10,
        duration: "PT5M",
        privacy: "public",
      },
      {
        id: "v2",
        title: "Video 2",
        description: "",
        publishedAt: "2026-10-21T11:00:00Z",
        thumbnailUrl: "",
        viewCount: 3800,
        likeCount: 20,
        duration: "PT10M",
        privacy: "public",
      },
    ],
  };

  it("renders group label, count, and total view count badge", () => {
    render(
      <ChannelGroupHeader
        group={mockGroup}
        allSelected={false}
        partiallySelected={false}
        collapsed={false}
        onToggleSelectGroup={vi.fn()}
        onToggleCollapse={vi.fn()}
      />,
    );

    expect(screen.getByText("October 21, 2026")).toBeInTheDocument();
    expect(screen.getByText("2 videos")).toBeInTheDocument();
    expect(screen.getByText("5,000 views")).toBeInTheDocument();
  });

  it("handles selection callbacks and renders checkmark when allSelected", () => {
    const onToggleSelect = vi.fn();
    const { rerender } = render(
      <ChannelGroupHeader
        group={mockGroup}
        allSelected={false}
        partiallySelected={false}
        collapsed={false}
        onToggleSelectGroup={onToggleSelect}
        onToggleCollapse={vi.fn()}
      />,
    );

    const selectBtn = screen.getByRole("button", {
      name: "Select all videos in October 21, 2026",
    });
    fireEvent.click(selectBtn);
    expect(onToggleSelect).toHaveBeenCalledTimes(1);

    rerender(
      <ChannelGroupHeader
        group={mockGroup}
        allSelected={true}
        partiallySelected={false}
        collapsed={false}
        onToggleSelectGroup={onToggleSelect}
        onToggleCollapse={vi.fn()}
      />,
    );

    expect(selectBtn).toHaveAttribute("title", "Deselect group");
    expect(selectBtn.querySelector("polyline")).toBeInTheDocument();
  });

  it("renders indeterminate dash icon when partiallySelected", () => {
    render(
      <ChannelGroupHeader
        group={mockGroup}
        allSelected={false}
        partiallySelected={true}
        collapsed={false}
        onToggleSelectGroup={vi.fn()}
        onToggleCollapse={vi.fn()}
      />,
    );

    const selectBtn = screen.getByRole("button", {
      name: "Select all videos in October 21, 2026",
    });
    expect(selectBtn.querySelector("line")).toBeInTheDocument();
  });

  it("handles collapse toggle callback and aria-label", () => {
    const onToggleCollapse = vi.fn();
    const { rerender } = render(
      <ChannelGroupHeader
        group={mockGroup}
        allSelected={false}
        partiallySelected={false}
        collapsed={false}
        onToggleSelectGroup={vi.fn()}
        onToggleCollapse={onToggleCollapse}
      />,
    );

    const collapseBtn = screen.getByRole("button", {
      name: "Collapse October 21, 2026",
    });
    fireEvent.click(collapseBtn);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    rerender(
      <ChannelGroupHeader
        group={mockGroup}
        allSelected={false}
        partiallySelected={false}
        collapsed={true}
        onToggleSelectGroup={vi.fn()}
        onToggleCollapse={onToggleCollapse}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Expand October 21, 2026" }),
    ).toBeInTheDocument();
  });
});
