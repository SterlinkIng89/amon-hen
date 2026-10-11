import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ExportModal from "../ExportModal";
import * as appBackend from "../../../../wailsjs/go/backend/App";
import { VideoFile } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetDefaultExportFolder: vi.fn().mockResolvedValue("/default/videos/amonhen"),
  SetDefaultExportFolder: vi.fn().mockResolvedValue(undefined),
  SelectExportFolder: vi.fn().mockResolvedValue("/custom/chosen/export"),
  ExportVideos: vi.fn().mockResolvedValue({
    successCount: 2,
    failedCount: 0,
    exportedPaths: ["/custom/chosen/export/Valorant - 10-10-26 - 1.mp4"],
    errors: [],
  }),
  OpenFolderInExplorer: vi.fn().mockResolvedValue(undefined),
}));

const mockVideos: VideoFile[] = [
  {
    name: "clip1.mp4",
    path: "/source/clip1.mp4",
    size: 1024,
    modTime: 1787754600000,
    folder: "/source",
    game: "Valorant",
    episode: 1,
  },
  {
    name: "clip2.mp4",
    path: "/source/clip2.mp4",
    size: 2048,
    modTime: 1787754600000,
    folder: "/source",
    game: "Valorant",
    youtubeTitle: "Custom Manual Title",
  },
];

describe("ExportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads default destination folder and renders title preview list", async () => {
    render(
      <ExportModal
        open={true}
        selectedVideos={mockVideos}
        profiles={{}}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Export Videos")).toBeInTheDocument();

    await waitFor(() => {
      expect(appBackend.GetDefaultExportFolder).toHaveBeenCalled();
      const input = screen.getByPlaceholderText(
        "Select destination folder...",
      ) as HTMLInputElement;
      expect(input.value).toBe("/default/videos/amonhen");
    });

    expect(screen.getByText("Custom Manual Title.mp4")).toBeInTheDocument();
  });

  it("allows selecting a custom destination directory", async () => {
    render(
      <ExportModal
        open={true}
        selectedVideos={mockVideos}
        profiles={{}}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(appBackend.GetDefaultExportFolder).toHaveBeenCalled();
    });

    const browseBtn = screen.getByRole("button", { name: "Browse..." });
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(appBackend.SelectExportFolder).toHaveBeenCalled();
      const input = screen.getByPlaceholderText(
        "Select destination folder...",
      ) as HTMLInputElement;
      expect(input.value).toBe("/custom/chosen/export");
    });
  });

  it("calls ExportVideos with metadata flag and shows completion feedback", async () => {
    const onExportComplete = vi.fn();
    render(
      <ExportModal
        open={true}
        selectedVideos={mockVideos}
        profiles={{}}
        onClose={vi.fn()}
        onExportComplete={onExportComplete}
      />,
    );

    await waitFor(() => {
      expect(appBackend.GetDefaultExportFolder).toHaveBeenCalled();
    });

    // Toggle save as default
    const saveCheckbox = screen.getByLabelText(
      "Remember as default export destination",
    );
    fireEvent.click(saveCheckbox);

    const exportBtn = screen.getByRole("button", { name: "Export 2 Videos" });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(appBackend.SetDefaultExportFolder).toHaveBeenCalledWith(
        "/default/videos/amonhen",
      );
      expect(appBackend.ExportVideos).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            sourcePath: "/source/clip1.mp4",
          }),
          expect.objectContaining({
            sourcePath: "/source/clip2.mp4",
            targetTitle: "Custom Manual Title",
          }),
        ]),
        "/default/videos/amonhen",
        true,
      );
      expect(screen.getByText("Export Finished")).toBeInTheDocument();
      expect(onExportComplete).toHaveBeenCalled();
    });

    const openFolderBtn = screen.getByRole("button", { name: "Open Folder" });
    fireEvent.click(openFolderBtn);

    expect(appBackend.OpenFolderInExplorer).toHaveBeenCalledWith(
      "/default/videos/amonhen",
    );
  });
});
