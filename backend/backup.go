package backend

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// BackupStatus summarizes the current backup destination, usage metrics, and enabled folders.
type BackupStatus struct {
	BackupFolder   string   `json:"backupFolder"`
	TotalBackedUp  int      `json:"totalBackedUp"`
	TotalBytes     int64    `json:"totalBytes"`
	LastBackupAt   int64    `json:"lastBackupAt"`
	EnabledFolders []string `json:"enabledFolders"`
}

// BackupRunResult reports the outcome of a folder backup run.
type BackupRunResult struct {
	CopiedCount  int      `json:"copiedCount"`
	SkippedCount int      `json:"skippedCount"`
	FailedCount  int      `json:"failedCount"`
	Errors       []string `json:"errors"`
}

var supportedBackupExtensions = map[string]bool{
	".mp4":  true,
	".mkv":  true,
	".webm": true,
	".mov":  true,
	".avi":  true,
}

// GetBackupFolder returns the configured backup destination folder.
func (a *App) GetBackupFolder() string {
	a.configMu.RLock()
	defer a.configMu.RUnlock()
	return a.config.BackupFolder
}

// SetBackupFolder saves the backup destination folder in config.
func (a *App) SetBackupFolder(folder string) error {
	trimmed := strings.TrimSpace(folder)
	if trimmed != "" {
		trimmed = filepath.Clean(trimmed)
	}
	a.configMu.Lock()
	a.config.BackupFolder = trimmed
	a.configMu.Unlock()
	return a.saveConfig()
}

// SelectBackupFolder opens a native OS folder picker to choose a backup destination directory.
func (a *App) SelectBackupFolder() (string, error) {
	defaultDir := a.GetBackupFolder()
	if defaultDir == "" {
		defaultDir, _ = a.GetDefaultExportFolder()
	}
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Select backup destination folder",
		DefaultDirectory: defaultDir,
	})
	if err != nil || dir == "" {
		return "", err
	}
	return dir, nil
}

// GetBackupStatus returns backup storage statistics and folders with AutoBackup enabled.
func (a *App) GetBackupStatus() (BackupStatus, error) {
	status := BackupStatus{
		EnabledFolders: make([]string, 0),
	}

	a.configMu.RLock()
	status.BackupFolder = a.config.BackupFolder
	seen := make(map[string]bool, len(a.config.Folders))
	for _, folder := range a.config.Folders {
		if cfg, ok := a.config.FolderSettings[folder]; ok && cfg.AutoBackup {
			status.EnabledFolders = append(status.EnabledFolders, folder)
			seen[folder] = true
		}
	}
	for folder, cfg := range a.config.FolderSettings {
		if cfg.AutoBackup && !seen[folder] {
			status.EnabledFolders = append(status.EnabledFolders, folder)
		}
	}
	a.configMu.RUnlock()

	if a.db == nil {
		return status, fmt.Errorf("database is not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	err := a.db.conn.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(file_size), 0), COALESCE(MAX(backed_up_at), 0) FROM video_backups WHERE status = 'backed_up'`,
	).Scan(&status.TotalBackedUp, &status.TotalBytes, &status.LastBackupAt)
	if err != nil {
		return status, fmt.Errorf("failed to query backup status: %w", err)
	}

	return status, nil
}

func normalizePath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		return filepath.Clean(p)
	}
	return abs
}

func isPathWithinRoot(absRoot, absPath string, allowEqual bool) bool {
	rel, err := filepath.Rel(strings.ToLower(absRoot), strings.ToLower(absPath))
	if err != nil {
		return false
	}
	if rel == "." {
		return allowEqual
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

// validateBackupTarget prevents empty backup paths and recursive self-backups.
func validateBackupTarget(backupFolder, folderRoot string) (string, string, error) {
	if strings.TrimSpace(backupFolder) == "" {
		return "", "", fmt.Errorf("backup folder is not configured")
	}
	if strings.TrimSpace(folderRoot) == "" {
		return "", "", fmt.Errorf("source folder root is required")
	}

	absBackup := normalizePath(backupFolder)
	absRoot := normalizePath(folderRoot)

	if strings.EqualFold(absBackup, absRoot) {
		return "", "", fmt.Errorf("backup folder cannot be the same as source folder %q", absRoot)
	}

	if isPathWithinRoot(absRoot, absBackup, false) {
		return "", "", fmt.Errorf("backup folder %q cannot be inside source folder %q", absBackup, absRoot)
	}

	return absBackup, absRoot, nil
}

// BackupSingleFile copies a single source video into BackupFolder, preserving its relative
// path under folderRoot, using atomic .tmp -> rename writes and skipping unchanged files.
func (a *App) BackupSingleFile(sourcePath, folderRoot string) (string, error) {
	destPath, _, err := a.backupSingleFile(sourcePath, folderRoot)
	return destPath, err
}

func (a *App) backupSingleFile(sourcePath, folderRoot string) (string, bool, error) {
	if a.db == nil {
		return "", false, fmt.Errorf("database is not initialized")
	}

	absBackup, absRoot, err := validateBackupTarget(a.GetBackupFolder(), folderRoot)
	if err != nil {
		return "", false, err
	}

	absSource := normalizePath(sourcePath)

	info, err := os.Stat(absSource)
	if err != nil {
		return "", false, fmt.Errorf("failed to stat source file: %w", err)
	}
	if info.IsDir() {
		return "", false, fmt.Errorf("source path %q is a directory", absSource)
	}

	rel, err := filepath.Rel(absRoot, absSource)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", false, fmt.Errorf("source path %q is outside folder root %q", absSource, absRoot)
	}

	destPath := filepath.Join(absBackup, rel)
	fileSize := info.Size()
	fileMtime := info.ModTime().Unix()

	if existingPath, ok := a.isAlreadyBackedUp(absSource, destPath, fileSize, fileMtime); ok {
		return existingPath, true, nil
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return "", false, fmt.Errorf("failed to create backup directory: %w", err)
	}

	if err := copyFileAtomic(absSource, destPath); err != nil {
		return "", false, err
	}

	a.db.mu.Lock()
	_, err = a.db.conn.Exec(
		`INSERT INTO video_backups (source_path, backup_path, folder_root, file_size, file_mtime, backed_up_at, status)
		 VALUES (?, ?, ?, ?, ?, ?, 'backed_up')
		 ON CONFLICT(source_path) DO UPDATE SET
			backup_path = excluded.backup_path,
			folder_root = excluded.folder_root,
			file_size = excluded.file_size,
			file_mtime = excluded.file_mtime,
			backed_up_at = excluded.backed_up_at,
			status = excluded.status`,
		absSource, destPath, absRoot, fileSize, fileMtime, time.Now().Unix(),
	)
	a.db.mu.Unlock()
	if err != nil {
		return "", false, fmt.Errorf("failed to record backup in database: %w", err)
	}

	return destPath, false, nil
}

func (a *App) isAlreadyBackedUp(sourcePath, expectedDestPath string, fileSize, fileMtime int64) (string, bool) {
	a.db.mu.Lock()
	var backupPath, status string
	var recordedSize, recordedMtime int64
	err := a.db.conn.QueryRow(
		`SELECT backup_path, file_size, file_mtime, status FROM video_backups WHERE source_path = ?`,
		sourcePath,
	).Scan(&backupPath, &recordedSize, &recordedMtime, &status)
	a.db.mu.Unlock()

	if err != nil {
		return "", false
	}
	if status != "backed_up" || recordedSize != fileSize || recordedMtime != fileMtime {
		return "", false
	}
	if !strings.EqualFold(filepath.Clean(backupPath), filepath.Clean(expectedDestPath)) {
		return "", false
	}
	if statInfo, statErr := os.Stat(backupPath); statErr != nil || statInfo.IsDir() {
		return "", false
	}
	return backupPath, true
}

// copyFileAtomic streams src into a temporary .tmp file next to dst, syncs it, and renames atomically.
func copyFileAtomic(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file: %w", err)
	}
	defer srcFile.Close()

	tmpPath := dst + ".tmp"
	dstFile, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create temporary backup file: %w", err)
	}

	copySuccess := false
	defer func() {
		if !copySuccess {
			dstFile.Close()
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		return fmt.Errorf("failed to copy file stream: %w", err)
	}
	if err := dstFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync temporary backup file: %w", err)
	}
	if err := dstFile.Close(); err != nil {
		return fmt.Errorf("failed to close temporary backup file: %w", err)
	}

	if err := os.Rename(tmpPath, dst); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to finalize atomic backup file: %w", err)
	}

	copySuccess = true
	return nil
}

// RunFolderBackup walks the requested folder (or all AutoBackup-enabled folders when folder is empty),
// backing up supported video files and emitting backup:progress / backup:done Wails events.
func (a *App) RunFolderBackup(folder string) (BackupRunResult, error) {
	result := BackupRunResult{
		Errors: make([]string, 0),
	}

	type backupTargetFile struct {
		path string
		root string
	}

	targetFolders := a.resolveBackupTargetFolders(folder)
	var filesToProcess []backupTargetFile

	for _, root := range targetFolders {
		if _, _, err := validateBackupTarget(a.GetBackupFolder(), root); err != nil {
			return result, err
		}

		fSettings := a.GetFolderSettings(root)
		walkErr := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if !fSettings.Recursive && path != root {
					return filepath.SkipDir
				}
				return nil
			}
			ext := strings.ToLower(filepath.Ext(d.Name()))
			if !supportedBackupExtensions[ext] {
				return nil
			}
			filesToProcess = append(filesToProcess, backupTargetFile{path: path, root: root})
			return nil
		})
		if walkErr != nil {
			result.FailedCount++
			result.Errors = append(result.Errors, fmt.Sprintf("failed to walk %s: %v", root, walkErr))
		}
	}

	total := len(filesToProcess)
	for i, item := range filesToProcess {
		_, skipped, err := a.backupSingleFile(item.path, item.root)
		if err != nil {
			result.FailedCount++
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", item.path, err))
		} else if skipped {
			result.SkippedCount++
		} else {
			result.CopiedCount++
		}

		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "backup:progress", map[string]interface{}{
				"current": i + 1,
				"total":   total,
				"file":    item.path,
				"copied":  result.CopiedCount,
				"skipped": result.SkippedCount,
				"failed":  result.FailedCount,
			})
		}
	}

	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "backup:done", result)
	}

	return result, nil
}

func (a *App) resolveBackupTargetFolders(folder string) []string {
	if strings.TrimSpace(folder) != "" {
		return []string{folder}
	}
	a.configMu.RLock()
	defer a.configMu.RUnlock()
	var targets []string
	for _, f := range a.config.Folders {
		if cfg, ok := a.config.FolderSettings[f]; ok && cfg.AutoBackup {
			targets = append(targets, f)
		}
	}
	return targets
}

// ResolveBackupPath looks up the backed-up copy for sourcePath and verifies it exists on disk.
func (a *App) ResolveBackupPath(sourcePath string) (string, bool) {
	if a.db == nil {
		return "", false
	}
	absSource := normalizePath(sourcePath)

	a.db.mu.Lock()
	var backupPath string
	err := a.db.conn.QueryRow(
		`SELECT backup_path FROM video_backups WHERE (source_path = ? OR source_path = ?) AND status = 'backed_up' LIMIT 1`,
		absSource, sourcePath,
	).Scan(&backupPath)
	a.db.mu.Unlock()

	if err != nil || backupPath == "" {
		return "", false
	}

	info, statErr := os.Stat(backupPath)
	if statErr != nil || info.IsDir() {
		return "", false
	}
	return backupPath, true
}

// waitForFileStable polls os.Stat(path) every checkInterval until the file size is non-zero
// and unchanged for stableChecks consecutive checks, or until maxWait elapses or the file disappears.
func waitForFileStable(path string, checkInterval time.Duration, stableChecks int, maxWait time.Duration) error {
	return waitForFileStableWithStop(path, checkInterval, stableChecks, maxWait, nil)
}

func waitForFileStableWithStop(path string, checkInterval time.Duration, stableChecks int, maxWait time.Duration, stopCh <-chan struct{}) error {
	if checkInterval <= 0 {
		checkInterval = 2 * time.Second
	}
	if stableChecks <= 0 {
		stableChecks = 2
	}
	if maxWait <= 0 {
		maxWait = 10 * time.Minute
	}

	deadline := time.NewTimer(maxWait)
	defer deadline.Stop()

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	var lastSize int64 = -1
	consecutiveStable := 0

	for {
		info, err := os.Stat(path)
		if err != nil {
			return fmt.Errorf("file unavailable while waiting for stability: %w", err)
		}
		if info.IsDir() {
			return fmt.Errorf("path %q is a directory", path)
		}

		size := info.Size()
		if size > 0 && size == lastSize {
			consecutiveStable++
			if consecutiveStable >= stableChecks {
				return nil
			}
		} else {
			lastSize = size
			consecutiveStable = 0
		}

		select {
		case <-stopCh:
			return fmt.Errorf("stability wait cancelled")
		case <-deadline.C:
			return fmt.Errorf("timed out waiting for file %q to stabilize", path)
		case <-ticker.C:
		}
	}
}
