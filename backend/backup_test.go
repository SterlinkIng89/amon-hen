package backend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBackupConfigSerialization(t *testing.T) {
	// Legacy config JSON without backup fields should deserialize cleanly.
	legacyJSON := `{"folders":["C:/Videos"],"folder_settings":{"C:/Videos":{"recursive":true,"max_duration_secs":60}}}`
	var cfg Config
	if err := json.Unmarshal([]byte(legacyJSON), &cfg); err != nil {
		t.Fatalf("failed to unmarshal legacy config: %v", err)
	}
	if cfg.BackupFolder != "" {
		t.Fatalf("expected empty BackupFolder, got %q", cfg.BackupFolder)
	}
	if cfg.FolderSettings["C:/Videos"].AutoBackup {
		t.Fatalf("expected AutoBackup=false for legacy folder config")
	}

	// Config with backup fields should round-trip cleanly.
	cfg.BackupFolder = "D:/Backups/AmonHen"
	fc := cfg.FolderSettings["C:/Videos"]
	fc.AutoBackup = true
	cfg.FolderSettings["C:/Videos"] = fc

	encoded, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("failed to marshal config: %v", err)
	}
	var decoded Config
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("failed to unmarshal round-tripped config: %v", err)
	}
	if decoded.BackupFolder != "D:/Backups/AmonHen" {
		t.Fatalf("expected BackupFolder %q, got %q", "D:/Backups/AmonHen", decoded.BackupFolder)
	}
	if !decoded.FolderSettings["C:/Videos"].AutoBackup {
		t.Fatalf("expected AutoBackup=true after round-trip")
	}
}

func TestVideoBackupsMigration(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	if err := app.db.migrate(); err != nil {
		t.Fatalf("idempotent migrate() failed: %v", err)
	}

	var tableName string
	if err := app.db.conn.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='video_backups'`).Scan(&tableName); err != nil || tableName != "video_backups" {
		t.Fatalf("expected video_backups table to exist, err=%v", err)
	}

	var idxName string
	if err := app.db.conn.QueryRow(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_video_backups_folder'`).Scan(&idxName); err != nil || idxName != "idx_video_backups_folder" {
		t.Fatalf("expected idx_video_backups_folder index to exist, err=%v", err)
	}
}

func TestBackupSingleFile_PreservesSubfolderAndAtomicCopy(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	sourceRoot := filepath.Join(tmpDir, "Outplayed")
	backupRoot := filepath.Join(tmpDir, "Backups")

	subDir := filepath.Join(sourceRoot, "Valorant", "Ranked")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}

	sourceFile := filepath.Join(subDir, "ace_clip.mp4")
	payload := []byte("fake-mp4-binary-payload-1234567890")
	if err := os.WriteFile(sourceFile, payload, 0644); err != nil {
		t.Fatalf("write source failed: %v", err)
	}

	app.config.BackupFolder = backupRoot

	destPath, err := app.BackupSingleFile(sourceFile, sourceRoot)
	if err != nil {
		t.Fatalf("BackupSingleFile failed: %v", err)
	}

	expectedDest := filepath.Join(backupRoot, "Valorant", "Ranked", "ace_clip.mp4")
	if destPath != expectedDest {
		t.Fatalf("expected destPath %q, got %q", expectedDest, destPath)
	}

	// Verify copied content matches and no .tmp artifact remains.
	copiedBytes, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("failed to read backed up file: %v", err)
	}
	if string(copiedBytes) != string(payload) {
		t.Fatalf("backed up content mismatch: got %q, want %q", string(copiedBytes), string(payload))
	}
	if _, err := os.Stat(destPath + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("expected no lingering .tmp file, stat err=%v", err)
	}

	// Verify source file was never modified or deleted.
	origBytes, err := os.ReadFile(sourceFile)
	if err != nil || string(origBytes) != string(payload) {
		t.Fatalf("source file was altered or deleted: err=%v", err)
	}
}

func TestBackupSingleFile_DeduplicationAndChangeDetection(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	sourceRoot := filepath.Join(tmpDir, "Captures")
	backupRoot := filepath.Join(tmpDir, "Backups")
	if err := os.MkdirAll(sourceRoot, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}

	sourceFile := filepath.Join(sourceRoot, "match.mkv")
	if err := os.WriteFile(sourceFile, []byte("version-1"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	app.config.BackupFolder = backupRoot

	dest1, skipped1, err := app.backupSingleFile(sourceFile, sourceRoot)
	if err != nil {
		t.Fatalf("first backup failed: %v", err)
	}
	if skipped1 {
		t.Fatalf("expected first backup not to be skipped")
	}

	// Repeat run with unchanged file should skip.
	dest2, skipped2, err := app.backupSingleFile(sourceFile, sourceRoot)
	if err != nil {
		t.Fatalf("repeat backup failed: %v", err)
	}
	if !skipped2 || dest2 != dest1 {
		t.Fatalf("expected repeat backup to be skipped with same path %q, got skipped=%v dest=%q", dest1, skipped2, dest2)
	}

	// Modify source file size and mtime -> should re-copy.
	newTime := time.Now().Add(2 * time.Second)
	if err := os.WriteFile(sourceFile, []byte("version-2-longer"), 0644); err != nil {
		t.Fatalf("rewrite failed: %v", err)
	}
	if err := os.Chtimes(sourceFile, newTime, newTime); err != nil {
		t.Fatalf("chtimes failed: %v", err)
	}

	_, skipped3, err := app.backupSingleFile(sourceFile, sourceRoot)
	if err != nil {
		t.Fatalf("updated backup failed: %v", err)
	}
	if skipped3 {
		t.Fatalf("expected modified file to be re-copied, not skipped")
	}

	updatedBytes, err := os.ReadFile(dest1)
	if err != nil || string(updatedBytes) != "version-2-longer" {
		t.Fatalf("expected updated backup contents, got %q (err=%v)", string(updatedBytes), err)
	}
}

func TestBackupGuardsAgainstRecursiveSelfBackup(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	sourceRoot := filepath.Join(tmpDir, "Outplayed")
	nestedBackup := filepath.Join(sourceRoot, "Backups")
	if err := os.MkdirAll(nestedBackup, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	clip := filepath.Join(sourceRoot, "clip.mp4")
	if err := os.WriteFile(clip, []byte("data"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	// Empty BackupFolder
	app.config.BackupFolder = ""
	if _, err := app.BackupSingleFile(clip, sourceRoot); err == nil {
		t.Fatalf("expected error when BackupFolder is empty")
	}

	// Equal to folderRoot
	app.config.BackupFolder = sourceRoot
	if _, err := app.BackupSingleFile(clip, sourceRoot); err == nil {
		t.Fatalf("expected error when BackupFolder equals folderRoot")
	}

	// Inside folderRoot
	app.config.BackupFolder = nestedBackup
	if _, err := app.BackupSingleFile(clip, sourceRoot); err == nil {
		t.Fatalf("expected error when BackupFolder is inside folderRoot")
	}
}

func TestRunFolderBackup_SelectiveAndRecursive(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	folderA := filepath.Join(tmpDir, "Outplayed")
	folderB := filepath.Join(tmpDir, "OBS")
	backupRoot := filepath.Join(tmpDir, "Backups")

	if err := os.MkdirAll(filepath.Join(folderA, "Hades"), 0755); err != nil {
		t.Fatalf("mkdir A failed: %v", err)
	}
	if err := os.MkdirAll(folderB, 0755); err != nil {
		t.Fatalf("mkdir B failed: %v", err)
	}

	if err := os.WriteFile(filepath.Join(folderA, "root_clip.mp4"), []byte("root"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(folderA, "Hades", "boss.webm"), []byte("nested"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(folderA, "notes.txt"), []byte("ignore"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(folderB, "obs_vod.mkv"), []byte("obs"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	app.config.BackupFolder = backupRoot
	app.config.Folders = []string{folderA, folderB}
	app.config.FolderSettings = map[string]FolderConfig{
		folderA: {Recursive: true, AutoBackup: true},
		folderB: {Recursive: false, AutoBackup: false},
	}

	// Run targeting only folderA -> should copy 2 video files and ignore notes.txt and folderB.
	res, err := app.RunFolderBackup(folderA)
	if err != nil {
		t.Fatalf("RunFolderBackup(folderA) failed: %v", err)
	}
	if res.CopiedCount != 2 || res.SkippedCount != 0 || res.FailedCount != 0 {
		t.Fatalf("unexpected first run result: %+v", res)
	}
	if _, err := os.Stat(filepath.Join(backupRoot, "obs_vod.mkv")); !os.IsNotExist(err) {
		t.Fatalf("expected folderB file not to be backed up when targeting folderA")
	}

	// Repeat run with empty folder (all AutoBackup-enabled folders) -> skips 2 in folderA, ignores disabled folderB.
	res2, err := app.RunFolderBackup("")
	if err != nil {
		t.Fatalf("RunFolderBackup(\"\") failed: %v", err)
	}
	if res2.CopiedCount != 0 || res2.SkippedCount != 2 || res2.FailedCount != 0 {
		t.Fatalf("unexpected second run result: %+v", res2)
	}

	status, err := app.GetBackupStatus()
	if err != nil {
		t.Fatalf("GetBackupStatus failed: %v", err)
	}
	if status.TotalBackedUp != 2 || status.TotalBytes != int64(len("root")+len("nested")) {
		t.Fatalf("unexpected backup status: %+v", status)
	}
	if len(status.EnabledFolders) != 1 || status.EnabledFolders[0] != folderA {
		t.Fatalf("expected EnabledFolders=[%q], got %v", folderA, status.EnabledFolders)
	}
}

func TestResolveBackupPath(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	sourceRoot := filepath.Join(tmpDir, "Outplayed")
	backupRoot := filepath.Join(tmpDir, "Backups")
	if err := os.MkdirAll(sourceRoot, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	sourceFile := filepath.Join(sourceRoot, "highlight.mov")
	if err := os.WriteFile(sourceFile, []byte("mov-data"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	app.config.BackupFolder = backupRoot
	if path, ok := app.ResolveBackupPath(sourceFile); ok || path != "" {
		t.Fatalf("expected ResolveBackupPath to return false before backup")
	}

	destPath, err := app.BackupSingleFile(sourceFile, sourceRoot)
	if err != nil {
		t.Fatalf("BackupSingleFile failed: %v", err)
	}

	resolved, ok := app.ResolveBackupPath(sourceFile)
	if !ok || resolved != destPath {
		t.Fatalf("expected ResolveBackupPath=(%q, true), got (%q, %v)", destPath, resolved, ok)
	}

	// Delete the backup file from disk -> ResolveBackupPath must return false.
	if err := os.Remove(destPath); err != nil {
		t.Fatalf("remove failed: %v", err)
	}
	if path, ok := app.ResolveBackupPath(sourceFile); ok || path != "" {
		t.Fatalf("expected ResolveBackupPath to return false after backup deletion, got (%q, %v)", path, ok)
	}
}

func TestWaitForFileStable_GrowingThenStable(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "recording.mp4")

	// Start with an empty file, then append data in chunks before stabilizing.
	if err := os.WriteFile(filePath, []byte{}, 0644); err != nil {
		t.Fatalf("create failed: %v", err)
	}

	doneWriting := make(chan struct{})
	go func() {
		defer close(doneWriting)
		for i := 0; i < 3; i++ {
			time.Sleep(25 * time.Millisecond)
			f, err := os.OpenFile(filePath, os.O_APPEND|os.O_WRONLY, 0644)
			if err == nil {
				_, _ = f.WriteString("chunk-data-")
				_ = f.Close()
			}
		}
	}()

	err := waitForFileStable(filePath, 20*time.Millisecond, 2, 2*time.Second)
	<-doneWriting
	if err != nil {
		t.Fatalf("expected waitForFileStable to succeed, got: %v", err)
	}
}

func TestWaitForFileStable_StopsOnCancel(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "recording.mp4")
	if err := os.WriteFile(filePath, []byte("initial"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	stopCh := make(chan struct{})
	errCh := make(chan error, 1)
	go func() {
		errCh <- waitForFileStableWithStop(filePath, 200*time.Millisecond, 5, 10*time.Second, stopCh)
	}()

	time.Sleep(30 * time.Millisecond)
	close(stopCh)

	select {
	case err := <-errCh:
		if err == nil {
			t.Fatalf("expected cancellation error, got nil")
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("waitForFileStableWithStop did not exit promptly after stopCh closed")
	}
}

func TestMaybeAutoBackup_IgnoresDisabledFolder(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	disabledRoot := filepath.Join(tmpDir, "Disabled")
	backupRoot := filepath.Join(tmpDir, "Backups")
	if err := os.MkdirAll(disabledRoot, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	clip := filepath.Join(disabledRoot, "clip.mp4")
	if err := os.WriteFile(clip, []byte("video-bytes"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	app.config.Folders = []string{disabledRoot}
	app.config.BackupFolder = backupRoot
	app.config.FolderSettings = map[string]FolderConfig{
		disabledRoot: {AutoBackup: false},
	}

	fw := &FolderWatcher{
		stopCh:                 make(chan struct{}),
		inFlight:               make(map[string]struct{}),
		stabilityCheckInterval: 10 * time.Millisecond,
		stabilityChecks:        1,
		stabilityMaxWait:       500 * time.Millisecond,
	}
	defer close(fw.stopCh)

	app.maybeAutoBackup(fw, clip)
	time.Sleep(60 * time.Millisecond)

	if _, ok := app.ResolveBackupPath(clip); ok {
		t.Fatalf("expected no backup for folder with AutoBackup=false")
	}
}

func TestMaybeAutoBackup_DeduplicatesAndBacksUp(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	enabledRoot := filepath.Join(tmpDir, "Outplayed")
	backupRoot := filepath.Join(tmpDir, "Backups")
	if err := os.MkdirAll(enabledRoot, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	clip := filepath.Join(enabledRoot, "ace.mp4")
	payload := []byte("stable-clip-bytes")
	if err := os.WriteFile(clip, payload, 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	app.config.Folders = []string{enabledRoot}
	app.config.BackupFolder = backupRoot
	app.config.FolderSettings = map[string]FolderConfig{
		enabledRoot: {AutoBackup: true},
	}

	fw := &FolderWatcher{
		stopCh:                 make(chan struct{}),
		inFlight:               make(map[string]struct{}),
		stabilityCheckInterval: 15 * time.Millisecond,
		stabilityChecks:        2,
		stabilityMaxWait:       2 * time.Second,
	}
	defer close(fw.stopCh)

	// Trigger duplicate events rapidly for the same file.
	app.maybeAutoBackup(fw, clip)
	app.maybeAutoBackup(fw, clip)
	app.maybeAutoBackup(fw, clip)

	fw.inFlightMu.Lock()
	inFlightCount := len(fw.inFlight)
	fw.inFlightMu.Unlock()
	if inFlightCount != 1 {
		t.Fatalf("expected exactly 1 in-flight entry after duplicate triggers, got %d", inFlightCount)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if destPath, ok := app.ResolveBackupPath(clip); ok {
			copied, err := os.ReadFile(destPath)
			if err != nil {
				t.Fatalf("read backup failed: %v", err)
			}
			if string(copied) != string(payload) {
				t.Fatalf("backup payload mismatch: got %q, want %q", string(copied), string(payload))
			}
			return
		}
		time.Sleep(15 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for auto-backup to complete")
}

func TestStopWatcher_CancelsPendingStabilityWait(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	enabledRoot := filepath.Join(tmpDir, "Outplayed")
	backupRoot := filepath.Join(tmpDir, "Backups")
	if err := os.MkdirAll(enabledRoot, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	clip := filepath.Join(enabledRoot, "long_recording.mp4")
	if err := os.WriteFile(clip, []byte("recording"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	app.config.Folders = []string{enabledRoot}
	app.config.BackupFolder = backupRoot
	app.config.FolderSettings = map[string]FolderConfig{
		enabledRoot: {AutoBackup: true},
	}

	fw := &FolderWatcher{
		stopCh:                 make(chan struct{}),
		inFlight:               make(map[string]struct{}),
		stabilityCheckInterval: 500 * time.Millisecond,
		stabilityChecks:        10,
		stabilityMaxWait:       30 * time.Second,
	}
	app.watcher = fw

	app.maybeAutoBackup(fw, clip)
	time.Sleep(20 * time.Millisecond)

	app.stopWatcher()

	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		fw.inFlightMu.Lock()
		remaining := len(fw.inFlight)
		fw.inFlightMu.Unlock()
		if remaining == 0 {
			if _, ok := app.ResolveBackupPath(clip); ok {
				t.Fatalf("expected cancelled stability wait not to perform backup")
			}
			return
		}
		time.Sleep(15 * time.Millisecond)
	}
	t.Fatalf("pending stability wait goroutine did not clean up after stopWatcher()")
}
