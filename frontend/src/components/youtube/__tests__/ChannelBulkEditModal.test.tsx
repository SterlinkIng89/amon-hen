import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChannelBulkEditModal from "../ChannelBulkEditModal";
import { YTVideo } from "../../../types";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  UpdateYouTubeVideoMetadata: vi.fn().mockResolvedValue(undefined),
}));

const mockVideos: YTVideo[] = [
  {
    id: "vid-1",
    title: "Dark Souls VOD 01",
    description: "First stream session",
    publishedAt: "2026-01-01T00:00:00Z",
    thumbnailUrl: "",
    viewCount: 10,
    likeCount: 2,
    duration: "1:00:00",
    privacy: "public",
  },
  {
    id: "vid-2",
    title: "Dark Souls VOD 02",
    description: "Second stream session",
    publishedAt: "2026-01-02T00:00:00Z",
    thumbnailUrl: "",
    viewCount: 15,
    likeCount: 3,
    duration: "1:15:00",
    privacy: "unlisted",
  },
];

describe("ChannelBulkEditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <ChannelBulkEditModal
        open={false}
        selectedVideos={mockVideos}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal header with count of selected videos", () => {
    render(
      <ChannelBulkEditModal
        open={true}
        selectedVideos={mockVideos}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText(/bulk edit 2 videos/i)).toBeInTheDocument();
  });

  it("shows live title preview with find and replace", () => {
    render(
      <ChannelBulkEditModal
        open={true}
        selectedVideos={mockVideos}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    const findInput = screen.getByPlaceholderText(/text to find/i);
    const replaceInput = screen.getByPlaceholderText(/replacement text/i);

    fireEvent.change(findInput, { target: { value: "VOD" } });
    fireEvent.change(replaceInput, { target: { value: "Part" } });

    expect(screen.getByText("Dark Souls Part 01")).toBeInTheDocument();
    expect(screen.getByText("Dark Souls Part 02")).toBeInTheDocument();
  });

  it("respects case-insensitive matching toggle", () => {
    render(
      <ChannelBulkEditModal
        open={true}
        selectedVideos={mockVideos}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    const findInput = screen.getByPlaceholderText(/text to find/i);
    const replaceInput = screen.getByPlaceholderText(/replacement text/i);
    const matchCaseCheckbox = screen.getByLabelText(/match case/i);

    // lowercase 'vod' with matchCase unchecked (case-insensitive)
    fireEvent.change(findInput, { target: { value: "vod" } });
    fireEvent.change(replaceInput, { target: { value: "Episode" } });
    expect(screen.getByText("Dark Souls Episode 01")).toBeInTheDocument();

    // toggle match case (case-sensitive)
    fireEvent.click(matchCaseCheckbox);
    expect(screen.queryByText("Dark Souls Episode 01")).not.toBeInTheDocument();
    expect(screen.getAllByText("Dark Souls VOD 01").length).toBeGreaterThan(0);
  });

  it("applies changes and calls UpdateYouTubeVideoMetadata with updated metadata", async () => {
    const { UpdateYouTubeVideoMetadata } = await import(
      "../../../../wailsjs/go/backend/App"
    );
    const onCompleted = vi.fn();

    render(
      <ChannelBulkEditModal
        open={true}
        selectedVideos={mockVideos}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    // 1. Change title find/replace
    fireEvent.change(screen.getByPlaceholderText(/text to find/i), {
      target: { value: "VOD" },
    });
    fireEvent.change(screen.getByPlaceholderText(/replacement text/i), {
      target: { value: "Ep" },
    });

    // 2. Change privacy to private
    fireEvent.change(screen.getByLabelText(/visibility \/ privacy/i), {
      target: { value: "private" },
    });

    // 3. Append to description
    fireEvent.click(screen.getByLabelText(/append to description/i));
    fireEvent.change(screen.getByPlaceholderText(/description text/i), {
      target: { value: "Check out links in bio" },
    });

    // Click Apply Changes
    const applyBtn = screen.getByRole("button", { name: /apply changes/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(UpdateYouTubeVideoMetadata).toHaveBeenCalledTimes(2);
      expect(UpdateYouTubeVideoMetadata).toHaveBeenNthCalledWith(
        1,
        "vid-1",
        "Dark Souls Ep 01",
        "First stream session\n\nCheck out links in bio",
        "private",
      );
      expect(UpdateYouTubeVideoMetadata).toHaveBeenNthCalledWith(
        2,
        "vid-2",
        "Dark Souls Ep 02",
        "Second stream session\n\nCheck out links in bio",
        "private",
      );
      expect(onCompleted).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ChannelBulkEditModal
        open={true}
        selectedVideos={mockVideos}
        onClose={onClose}
        onCompleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
