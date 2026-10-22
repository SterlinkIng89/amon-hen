import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import LibrarySubHeader from "../LibrarySubHeader";
import { VideoFile } from "../../../types";

describe("LibrarySubHeader", () => {
  const dummyProps = {
    folders: ["C:\\videos"],
    activeFolders: [],
    filteredVideos: [],
    searchQuery: "",
    sortMode: "date" as const,
    groupMode: "date" as const,
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
    onGroupChange: vi.fn(),
    onToggleFolder: vi.fn(),
    onOpenFolderSettings: vi.fn(),
    filterUploaded: false,
    onToggleFilterUploaded: vi.fn(),
    advancedFilters: { dateFrom: "", dateTo: "", excludeWords: [] },
    onAdvancedFiltersChange: vi.fn(),
    onOpenTagManagement: vi.fn(),
    availableTags: ["Elden Ring", "Hollow Knight"],
    tagFilter: "",
    onTagFilterChange: vi.fn(),
  };

  it("renders a responsive subheader without fixed height h-14", () => {
    const { container } = render(<LibrarySubHeader {...dummyProps} />);
    const stickyHeaderInner = container.querySelector(
      ".sticky.top-0 > div:first-child",
    );

    expect(stickyHeaderInner).toBeInTheDocument();
    expect(stickyHeaderInner).not.toHaveClass("h-14");
    expect(stickyHeaderInner).toHaveClass("min-h-14");
    expect(stickyHeaderInner).toHaveClass("py-2");
  });

  it("renders tag filter dropdown with default and available tag options and triggers onTagFilterChange", () => {
    const onTagFilterChange = vi.fn();
    render(
      <LibrarySubHeader
        {...dummyProps}
        availableTags={["Elden Ring", "Hollow Knight"]}
        tagFilter=""
        onTagFilterChange={onTagFilterChange}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Filter by tag" });
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole("option");
    const optionValues = options.map((opt) => (opt as HTMLOptionElement).value);

    expect(optionValues).toContain("");
    expect(optionValues).toContain("__untagged__");
    expect(optionValues).toContain("__placeholders__");
    expect(optionValues).toContain("Elden Ring");
    expect(optionValues).toContain("Hollow Knight");

    fireEvent.change(select, { target: { value: "__untagged__" } });
    expect(onTagFilterChange).toHaveBeenCalledWith("__untagged__");

    fireEvent.change(select, { target: { value: "Elden Ring" } });
    expect(onTagFilterChange).toHaveBeenCalledWith("Elden Ring");
  });

  it("renders Duration and Episode sort buttons and triggers onSortChange", () => {
    const onSortChange = vi.fn();
    render(
      <LibrarySubHeader
        {...dummyProps}
        sortMode="date"
        onSortChange={onSortChange}
      />,
    );

    const durationBtn = screen.getByRole("button", { name: "Duration" });
    const episodeBtn = screen.getByRole("button", { name: "Episode" });

    expect(durationBtn).toBeInTheDocument();
    expect(episodeBtn).toBeInTheDocument();

    fireEvent.click(durationBtn);
    expect(onSortChange).toHaveBeenCalledWith("duration");

    fireEvent.click(episodeBtn);
    expect(onSortChange).toHaveBeenCalledWith("episode");
  });

  it("renders Group control buttons and triggers onGroupChange", () => {
    const onGroupChange = vi.fn();
    render(
      <LibrarySubHeader
        {...dummyProps}
        groupMode="date"
        onGroupChange={onGroupChange}
      />,
    );

    const gameBtn = screen.getByRole("button", { name: "Game" });
    const statusBtn = screen.getByRole("button", { name: "Status" });
    const folderBtn = screen.getByRole("button", { name: "Folder" });
    const noneBtn = screen.getByRole("button", { name: "None" });

    expect(gameBtn).toBeInTheDocument();
    expect(statusBtn).toBeInTheDocument();
    expect(folderBtn).toBeInTheDocument();
    expect(noneBtn).toBeInTheDocument();

    fireEvent.click(gameBtn);
    expect(onGroupChange).toHaveBeenCalledWith("game");

    fireEvent.click(statusBtn);
    expect(onGroupChange).toHaveBeenCalledWith("status");

    fireEvent.click(folderBtn);
    expect(onGroupChange).toHaveBeenCalledWith("folder");

    fireEvent.click(noneBtn);
    expect(onGroupChange).toHaveBeenCalledWith("none");
  });

  it("passes onToggleFilterUploaded to StatsBar and triggers toggle when clicked", () => {
    const onToggleFilterUploaded = vi.fn();
    const mockVideos: VideoFile[] = [
      {
        name: "vid1.mp4",
        path: "C:\\videos\\vid1.mp4",
        size: 1000,
        modTime: 1234567,
        folder: "C:\\videos",
        game: "Elden Ring",
      },
      {
        name: "vid2.mp4",
        path: "C:\\videos\\vid2.mp4",
        size: 2000,
        modTime: 1234568,
        folder: "C:\\videos",
        game: "Elden Ring",
        youtubeId: "yt123",
      },
    ];

    render(
      <LibrarySubHeader
        {...dummyProps}
        filteredVideos={mockVideos}
        onToggleFilterUploaded={onToggleFilterUploaded}
      />,
    );

    const pendingBtn = screen.getByRole("button", {
      name: /pending upload/i,
    });
    expect(pendingBtn).toBeInTheDocument();

    fireEvent.click(pendingBtn);
    expect(onToggleFilterUploaded).toHaveBeenCalledTimes(1);
  });
});

