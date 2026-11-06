import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BatchDescriptionProgress } from "../BatchDescriptionProgress";
import { useAppStore } from "../../../../store/useAppStore";
import * as AppBindings from "../../../../../wailsjs/go/backend/App";
import { backend } from "../../../../../wailsjs/go/models";

vi.mock("../../../../../wailsjs/go/backend/App", () => ({
  UpdateYouTubeVideoMetadata: vi.fn(),
}));

describe("BatchDescriptionProgress", () => {
  const sampleVideos: backend.CatalogVideoDraft[] = [
    backend.CatalogVideoDraft.createFrom({
      videoId: "v1",
      title: "Video 1",
      description: "Default description test",
      episode: 1,
    }),
    backend.CatalogVideoDraft.createFrom({
      videoId: "v2",
      title: "Video 2",
      description: "Custom different description",
      episode: 2,
    }),
    backend.CatalogVideoDraft.createFrom({
      videoId: "v3",
      title: "Video 3",
      description: "",
      episode: 3,
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      defaultVideoDescription: "Default description test",
    });
  });

  it("initializes description from defaultVideoDescription in app store", () => {
    render(
      <BatchDescriptionProgress
        playlistId="pl-1"
        videos={sampleVideos}
      />
    );

    const textarea = screen.getByPlaceholderText(/Enter description template to apply/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Default description test");
    expect(screen.getByText(/Synced:/i)).toBeInTheDocument();
    expect(screen.getByText(/Needs desc:/i)).toBeInTheDocument();
  });

  it("shows 'Use default config' when description is edited and restores default on click", () => {
    render(
      <BatchDescriptionProgress
        playlistId="pl-1"
        videos={sampleVideos}
      />
    );

    const textarea = screen.getByPlaceholderText(/Enter description template to apply/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Modified custom description" } });

    expect(textarea.value).toBe("Modified custom description");
    const useDefaultBtn = screen.getByRole("button", { name: /Use default config/i });
    expect(useDefaultBtn).toBeInTheDocument();

    fireEvent.click(useDefaultBtn);
    expect(textarea.value).toBe("Default description test");
  });

  it("opens confirmation modal when clicking Update unsynced and calls API on confirm", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockResolvedValue(undefined as any);
    const onVideoUpdated = vi.fn();

    render(
      <BatchDescriptionProgress
        playlistId="pl-1"
        videos={sampleVideos}
        onVideoUpdated={onVideoUpdated}
      />
    );

    // v1 is synced, v2 and v3 are unsynced (2 videos)
    const updateUnsyncedBtn = screen.getByRole("button", { name: /Update unsynced/i });
    fireEvent.click(updateUnsyncedBtn);

    // Modal should appear
    expect(screen.getByText(/Confirm Description Update/i)).toBeInTheDocument();
    expect(screen.getByText(/2 videos/i)).toBeInTheDocument();

    // Confirm
    const confirmBtn = screen.getByRole("button", { name: /Apply & update YouTube/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(2);
    });

    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v2", "", "Default description test", "");
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v3", "", "Default description test", "");
    expect(onVideoUpdated).toHaveBeenCalledWith("v2", "Default description test");
  });

  it("allows updating only selected videos when selectedVideoIds is provided", async () => {
    vi.mocked(AppBindings.UpdateYouTubeVideoMetadata).mockResolvedValue(undefined as any);
    const selected = new Set(["v2"]);

    render(
      <BatchDescriptionProgress
        playlistId="pl-1"
        videos={sampleVideos}
        selectedVideoIds={selected}
      />
    );

    const updateSelectedBtn = screen.getByRole("button", { name: /Update selected/i });
    fireEvent.click(updateSelectedBtn);

    expect(screen.getByText(/Confirm Description Update/i)).toBeInTheDocument();
    expect(screen.getByText(/1 video/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Apply & update YouTube/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(1);
    });
    expect(AppBindings.UpdateYouTubeVideoMetadata).toHaveBeenCalledWith("v2", "", "Default description test", "");
  });
});
