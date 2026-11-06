import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import YouTubeSyncButton from "../YouTubeSyncButton";
import {
  SyncRecentVideos,
  SyncChannelData,
} from "../../../../wailsjs/go/backend/App";

type EventCallback = (...args: unknown[]) => void;
const eventHandlers = new Map<string, EventCallback[]>();

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn((event: string, callback: EventCallback) => {
    const list = eventHandlers.get(event) || [];
    list.push(callback);
    eventHandlers.set(event, list);
    return () => {
      const current = eventHandlers.get(event) || [];
      eventHandlers.set(
        event,
        current.filter((cb) => cb !== callback),
      );
    };
  }),
}));

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  SyncRecentVideos: vi.fn(),
  SyncChannelData: vi.fn(),
}));

describe("YouTubeSyncButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    vi.mocked(SyncRecentVideos).mockResolvedValue(undefined as never);
    vi.mocked(SyncChannelData).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders light sync button and sync options trigger", () => {
    render(<YouTubeSyncButton />);
    expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more sync options/i })).toBeInTheDocument();
  });

  it("triggers light sync when clicking the primary action", async () => {
    render(<YouTubeSyncButton />);
    const lightBtn = screen.getByRole("button", { name: /light/i });

    fireEvent.click(lightBtn);

    await waitFor(() => {
      expect(SyncRecentVideos).toHaveBeenCalledWith(20);
    });
    expect(screen.getByText("Quick sync — last 20 videos...")).toBeInTheDocument();
  });

  it("opens sync menu and triggers full sync", async () => {
    render(<YouTubeSyncButton />);
    const menuBtn = screen.getByRole("button", { name: /more sync options/i });

    fireEvent.click(menuBtn);

    const fullSyncOption = screen.getByText("Full sync");
    expect(fullSyncOption).toBeInTheDocument();

    fireEvent.click(fullSyncOption);

    await waitFor(() => {
      expect(SyncChannelData).toHaveBeenCalled();
    });
    expect(screen.getByText("Full sync — fetching entire channel...")).toBeInTheDocument();
  });

  it("updates status label on youtube:sync-progress event", () => {
    render(<YouTubeSyncButton />);
    const progressHandlers = eventHandlers.get("youtube:sync-progress") || [];
    expect(progressHandlers.length).toBeGreaterThan(0);

    act(() => {
      progressHandlers[0]({ stage: "Thumbnails", count: 5, total: 10 });
    });

    expect(screen.getByText("Syncing: Thumbnails (5/10)")).toBeInTheDocument();
  });

  it("notifies onSyncComplete on youtube:sync-done event", () => {
    const onSyncComplete = vi.fn();
    render(<YouTubeSyncButton onSyncComplete={onSyncComplete} />);

    const doneHandlers = eventHandlers.get("youtube:sync-done") || [];
    expect(doneHandlers.length).toBeGreaterThan(0);

    act(() => {
      doneHandlers[0]();
    });

    expect(screen.getByText("Sync complete!")).toBeInTheDocument();
    expect(onSyncComplete).toHaveBeenCalled();
  });
});
