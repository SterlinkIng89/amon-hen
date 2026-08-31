import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import LibrarySubHeader from "../LibrarySubHeader";

describe("LibrarySubHeader", () => {
  it("renders a responsive subheader without fixed height h-14", () => {
    const dummyProps = {
      folders: ["C:\\videos"],
      activeFolders: [],
      filteredVideos: [],
      searchQuery: "",
      sortMode: "date" as const,
      onSearchChange: vi.fn(),
      onSortChange: vi.fn(),
      onToggleFolder: vi.fn(),
      onOpenFolderSettings: vi.fn(),
      filterUploaded: false,
      onToggleFilterUploaded: vi.fn(),
      advancedFilters: { dateFrom: "", dateTo: "", excludeWords: [] },
      onAdvancedFiltersChange: vi.fn(),
    };

    const { container } = render(<LibrarySubHeader {...dummyProps} />);
    const stickyHeaderInner = container.querySelector(
      ".sticky.top-0 > div:first-child",
    );

    expect(stickyHeaderInner).toBeInTheDocument();
    expect(stickyHeaderInner).not.toHaveClass("h-14");
    expect(stickyHeaderInner).toHaveClass("min-h-14");
    expect(stickyHeaderInner).toHaveClass("py-2");
  });
});
