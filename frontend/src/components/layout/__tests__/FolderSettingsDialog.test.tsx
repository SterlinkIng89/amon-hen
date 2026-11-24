import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FolderSettingsDialog from "../FolderSettingsDialog";
import * as appBackend from "../../../../wailsjs/go/backend/App";
import { backend } from "../../../../wailsjs/go/models";

vi.mock("../../../../wailsjs/go/backend/App", () => ({
  GetFolderSettings: vi.fn().mockResolvedValue({
    recursive: false,
    max_duration_secs: 0,
    auto_backup: false,
  }),
  SaveFolderSettings: vi.fn().mockResolvedValue(undefined),
  GetBackupFolder: vi.fn().mockResolvedValue("/backups"),
  RunFolderBackup: vi.fn().mockResolvedValue({
    copiedCount: 2,
    skippedCount: 1,
    failedCount: 0,
    errors: [],
  }),
}));

vi.mock("../../../../wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn().mockReturnValue(() => {}),
}));

describe("FolderSettingsDialog (#223)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appBackend.GetFolderSettings).mockResolvedValue(
      backend.FolderConfig.createFrom({
        recursive: false,
        max_duration_secs: 0,
        auto_backup: false,
      })
    );
    vi.mocked(appBackend.GetBackupFolder).mockResolvedValue("/backups");
    vi.mocked(appBackend.RunFolderBackup).mockResolvedValue(
      backend.BackupRunResult.createFrom({
        copiedCount: 2,
        skippedCount: 1,
        failedCount: 0,
        errors: [],
      })
    );
  });

  it("disables auto-backup toggle and Back up now button when global backup folder is unset", async () => {
    vi.mocked(appBackend.GetBackupFolder).mockResolvedValueOnce("");

    render(
      <FolderSettingsDialog
        folder="C:/Clips"
        open={true}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    const toggle = await screen.findByTestId("folder-auto-backup-toggle");
    await waitFor(() => {
      expect(toggle).toBeDisabled();
    });
    expect(screen.getByTestId("folder-backup-now-btn")).toBeDisabled();
    expect(
      screen.getByText(/Configure a global backup destination folder in General Settings first/i)
    ).toBeInTheDocument();
  });

  it("toggles auto_backup and persists it on Save", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <FolderSettingsDialog
        folder="C:/Clips"
        open={true}
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    const toggle = await screen.findByTestId("folder-auto-backup-toggle");
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(appBackend.SaveFolderSettings).toHaveBeenCalledWith(
        "C:/Clips",
        expect.objectContaining({
          recursive: false,
          max_duration_secs: 0,
          auto_backup: true,
        })
      );
      expect(onSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("triggers manual folder backup and displays copied/skipped/failed counts", async () => {
    vi.mocked(appBackend.RunFolderBackup).mockResolvedValueOnce(
      backend.BackupRunResult.createFrom({
        copiedCount: 4,
        skippedCount: 3,
        failedCount: 1,
        errors: ["clip.mp4: disk full"],
      })
    );

    render(
      <FolderSettingsDialog
        folder="C:/Clips"
        open={true}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    const backupBtn = await screen.findByTestId("folder-backup-now-btn");
    await waitFor(() => {
      expect(backupBtn).not.toBeDisabled();
    });

    fireEvent.click(backupBtn);

    const resultEl = await screen.findByTestId("folder-backup-result");
    expect(appBackend.RunFolderBackup).toHaveBeenCalledWith("C:/Clips");
    expect(resultEl).toHaveTextContent("Copied 4, skipped 3, failed 1");
  });
});
