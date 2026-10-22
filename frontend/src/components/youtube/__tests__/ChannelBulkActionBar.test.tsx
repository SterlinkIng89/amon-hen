import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ChannelBulkActionBar from "../ChannelBulkActionBar";
import { YTPlaylist } from "../../../types";

const mockPlaylists: YTPlaylist[] = [
  {
    id: "pl-1",
    title: "Dark Souls VODs",
    description: "",
    videoCount: 5,
    thumbnailUrl: "",
    publishedAt: "2026-01-01T00:00:00Z",
    privacy: "public",
  },
  {
    id: "pl-2",
    title: "Elden Ring Bosses",
    description: "",
    videoCount: 12,
    thumbnailUrl: "",
    publishedAt: "2026-01-02T00:00:00Z",
    privacy: "unlisted",
  },
];

describe("ChannelBulkActionBar", () => {
  it("renders nothing when selectedCount is 0", () => {
    const { container } = render(
      <ChannelBulkActionBar
        selectedCount={0}
        playlists={mockPlaylists}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders selection count badge and text for single and multiple items", () => {
    const { rerender } = render(
      <ChannelBulkActionBar
        selectedCount={1}
        playlists={mockPlaylists}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("video selected")).toBeInTheDocument();

    rerender(
      <ChannelBulkActionBar
        selectedCount={3}
        playlists={mockPlaylists}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("videos selected")).toBeInTheDocument();
  });

  it("opens playlist dropdown, filters playlists, and selects one", () => {
    const onAddToPlaylist = vi.fn();
    render(
      <ChannelBulkActionBar
        selectedCount={2}
        playlists={mockPlaylists}
        onClearSelection={vi.fn()}
        onAddToPlaylist={onAddToPlaylist}
      />,
    );

    const addBtn = screen.getByRole("button", { name: /add to playlist/i });
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText(/search playlists/i)).toBeInTheDocument();
    expect(screen.getByText("Dark Souls VODs")).toBeInTheDocument();
    expect(screen.getByText("Elden Ring Bosses")).toBeInTheDocument();

    // Filter
    fireEvent.change(screen.getByPlaceholderText(/search playlists/i), {
      target: { value: "Elden" },
    });
    expect(screen.queryByText("Dark Souls VODs")).not.toBeInTheDocument();
    expect(screen.getByText("Elden Ring Bosses")).toBeInTheDocument();

    // Select
    fireEvent.click(screen.getByText("Elden Ring Bosses"));
    expect(onAddToPlaylist).toHaveBeenCalledWith("pl-2");
  });

  it("triggers inline playlist creation via onCreateAndAddToPlaylist", async () => {
    const onCreateAndAddToPlaylist = vi.fn().mockResolvedValue(undefined);
    render(
      <ChannelBulkActionBar
        selectedCount={2}
        playlists={mockPlaylists}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
        onCreateAndAddToPlaylist={onCreateAndAddToPlaylist}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add to playlist/i }));

    const newPlaylistInput = screen.getByPlaceholderText(/new playlist title/i);
    fireEvent.change(newPlaylistInput, { target: { value: "Bloodborne Run" } });

    const createBtn = screen.getByRole("button", { name: /create & add/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(onCreateAndAddToPlaylist).toHaveBeenCalledWith("Bloodborne Run");
    });
  });

  it("triggers privacy updates from Set Visibility dropdown", () => {
    const onBulkUpdatePrivacy = vi.fn();
    render(
      <ChannelBulkActionBar
        selectedCount={2}
        playlists={mockPlaylists}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
        onBulkUpdatePrivacy={onBulkUpdatePrivacy}
      />,
    );

    const visibilityBtn = screen.getByRole("button", { name: /set visibility/i });
    fireEvent.click(visibilityBtn);

    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Unlisted")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Unlisted"));
    expect(onBulkUpdatePrivacy).toHaveBeenCalledWith("unlisted");
  });

  it("triggers onOpenBulkEditModal when Edit Metadata button is clicked", () => {
    const onOpenBulkEditModal = vi.fn();
    render(
      <ChannelBulkActionBar
        selectedCount={2}
        playlists={mockPlaylists}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
        onOpenBulkEditModal={onOpenBulkEditModal}
      />,
    );

    const editBtn = screen.getByRole("button", { name: /edit metadata/i });
    fireEvent.click(editBtn);
    expect(onOpenBulkEditModal).toHaveBeenCalled();
  });

  it("renders Remove from Playlist button only when isInsidePlaylist is true", () => {
    const onRemoveFromPlaylist = vi.fn();
    const { rerender } = render(
      <ChannelBulkActionBar
        selectedCount={2}
        playlists={mockPlaylists}
        isInsidePlaylist={false}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
        onRemoveFromPlaylist={onRemoveFromPlaylist}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /remove from playlist/i }),
    ).not.toBeInTheDocument();

    rerender(
      <ChannelBulkActionBar
        selectedCount={2}
        playlists={mockPlaylists}
        isInsidePlaylist={true}
        onClearSelection={vi.fn()}
        onAddToPlaylist={vi.fn()}
        onRemoveFromPlaylist={onRemoveFromPlaylist}
      />,
    );

    const removeBtn = screen.getByRole("button", { name: /remove from playlist/i });
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);
    expect(onRemoveFromPlaylist).toHaveBeenCalledTimes(1);
  });

  it("handles clear selection and delete from YouTube", () => {
    const onClearSelection = vi.fn();
    const onDeleteFromYouTube = vi.fn();

    render(
      <ChannelBulkActionBar
        selectedCount={2}
        playlists={mockPlaylists}
        onClearSelection={onClearSelection}
        onAddToPlaylist={vi.fn()}
        onDeleteFromYouTube={onDeleteFromYouTube}
      />,
    );

    fireEvent.click(screen.getByTitle("Delete selected videos from YouTube"));
    expect(onDeleteFromYouTube).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Clear selection"));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});
