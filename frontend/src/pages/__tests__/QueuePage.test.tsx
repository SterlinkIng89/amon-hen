import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import QueuePage from "../QueuePage";
import { QueueItem } from "../../components/youtube/UploadQueue";

const mockResumeUpload = vi.fn().mockResolvedValue(undefined);
const mockDiscardUploadSession = vi.fn().mockResolvedValue(undefined);
const mockCancelUpload = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../wailsjs/go/backend/App", () => ({
  ResumeUpload: (...args: any[]) => mockResumeUpload(...args),
  DiscardUploadSession: (...args: any[]) => mockDiscardUploadSession(...args),
  CancelUpload: (...args: any[]) => mockCancelUpload(...args),
}));

describe("QueuePage - Resumable Uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const interruptedItem: QueueItem = {
    id: "session-1",
    videoPath: "C:/videos/epic_gameplay.mp4",
    videoName: "epic_gameplay.mp4",
    size: 104857600,
    title: "Epic Gameplay Part 1",
    description: "Cool description",
    privacy: "unlisted",
    status: "interrupted",
    progress: 42,
    resumable: true,
    resumedFrom: 44040192,
  };

  it("renders interrupted status and resume/discard controls", () => {
    const handleUpdateQueue = vi.fn();
    render(
      <QueuePage
        queue={[interruptedItem]}
        running={false}
        onUpdateQueue={handleUpdateQueue}
        onSetRunning={vi.fn()}
        onStart={vi.fn()}
      />
    );

    expect(screen.getByText("Epic Gameplay Part 1")).toBeInTheDocument();
    expect(screen.getAllByText(/interrupted/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/42%/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("calls ResumeUpload and updates status when clicking Resume", async () => {
    const handleUpdateQueue = vi.fn();
    render(
      <QueuePage
        queue={[interruptedItem]}
        running={false}
        onUpdateQueue={handleUpdateQueue}
        onSetRunning={vi.fn()}
        onStart={vi.fn()}
      />
    );

    const resumeBtn = screen.getByRole("button", { name: /resume/i });
    fireEvent.click(resumeBtn);

    expect(mockResumeUpload).toHaveBeenCalledWith("C:/videos/epic_gameplay.mp4");
    expect(handleUpdateQueue).toHaveBeenCalled();
  });

  it("calls DiscardUploadSession and removes item when clicking Discard", async () => {
    const handleUpdateQueue = vi.fn();
    render(
      <QueuePage
        queue={[interruptedItem]}
        running={false}
        onUpdateQueue={handleUpdateQueue}
        onSetRunning={vi.fn()}
        onStart={vi.fn()}
      />
    );

    const discardBtn = screen.getByRole("button", { name: /discard/i });
    fireEvent.click(discardBtn);

    expect(mockDiscardUploadSession).toHaveBeenCalledWith("C:/videos/epic_gameplay.mp4");
    await vi.waitFor(() => {
      expect(handleUpdateQueue).toHaveBeenCalledWith([]);
    });
  });
});
