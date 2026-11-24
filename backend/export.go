package backend

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	goRuntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ExportItem describes a single video to be exported with metadata.
type ExportItem struct {
	SourcePath    string   `json:"sourcePath"`
	TargetTitle   string   `json:"targetTitle"`
	Description   string   `json:"description"`
	Game          string   `json:"game"`
	PlaylistID    string   `json:"playlistId"`
	PlaylistTitle string   `json:"playlistTitle"`
	Episode       int      `json:"episode"`
	ContentType   string   `json:"contentType"`
	Privacy       string   `json:"privacy"`
	Tags          []string `json:"tags"`
}

// ExportResult contains execution metrics and resulting files from bulk export.
type ExportResult struct {
	SuccessCount  int      `json:"successCount"`
	FailedCount   int      `json:"failedCount"`
	ExportedPaths []string `json:"exportedPaths"`
	ExportIDs     []string `json:"exportIds"`
	Errors        []string `json:"errors"`
}

var (
	forbiddenStripRegex = regexp.MustCompile(`[*?<>\r\n\t\x00-\x1f]`)
	multiEnDashRegex    = regexp.MustCompile(`–+`)
	multiSpaceRegex     = regexp.MustCompile(`\s+`)
)

// sanitizeFilename transforms characters forbidden on Windows, macOS, and Linux filesystems
// and replaces ASCII hyphens with YouTube-safe Unicode equivalents so drag-and-drop uploads
// into YouTube Studio preserve slashes, colons, separators, and single spacing.
func sanitizeFilename(name string) string {
	cleaned := strings.NewReplacer(
		"/", "\u2215",
		"\\", "\u2215",
		":", "\u2236",
		"|", "\u2223",
		"\"", "''",
		"-", "\u2013",
	).Replace(name)
	cleaned = forbiddenStripRegex.ReplaceAllString(cleaned, "")
	cleaned = multiEnDashRegex.ReplaceAllString(cleaned, "\u2013")
	cleaned = multiSpaceRegex.ReplaceAllString(cleaned, " ")
	cleaned = strings.Trim(cleaned, " .–")
	if cleaned == "" {
		return "video"
	}
	return cleaned
}

// resolveUniqueDestination calculates an available file path in dir, appending (1), (2), etc. upon collision.
func resolveUniqueDestination(dir, sanitizedBase, ext string) string {
	candidateName := fmt.Sprintf("%s%s", sanitizedBase, ext)
	candidatePath := filepath.Join(dir, candidateName)
	if _, err := os.Stat(candidatePath); os.IsNotExist(err) {
		return candidatePath
	}

	for i := 1; ; i++ {
		candidateName = fmt.Sprintf("%s (%d)%s", sanitizedBase, i, ext)
		candidatePath = filepath.Join(dir, candidateName)
		if _, err := os.Stat(candidatePath); os.IsNotExist(err) {
			return candidatePath
		}
	}
}

// copyFileNonDestructive streams content from src to dst without altering or deleting the source.
func copyFileNonDestructive(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file: %w", err)
	}
	defer srcFile.Close()

	dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0644)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		return fmt.Errorf("failed to copy file stream: %w", err)
	}

	return dstFile.Sync()
}

// writeMetadataCompanion generates a sidecar .txt file containing video title, tags, and description.
func writeMetadataCompanion(txtPath string, item ExportItem) error {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("Title: %s\n", item.TargetTitle))
	if item.Game != "" {
		builder.WriteString(fmt.Sprintf("Game: %s\n", item.Game))
	}
	if item.PlaylistTitle != "" {
		builder.WriteString(fmt.Sprintf("Playlist: %s\n", item.PlaylistTitle))
	}
	if item.Privacy != "" {
		builder.WriteString(fmt.Sprintf("Privacy: %s\n", item.Privacy))
	}
	if len(item.Tags) > 0 {
		builder.WriteString(fmt.Sprintf("Tags: %s\n", strings.Join(item.Tags, ", ")))
	}
	builder.WriteString("\nDescription:\n")
	builder.WriteString(item.Description)
	builder.WriteString("\n")

	return os.WriteFile(txtPath, []byte(builder.String()), 0644)
}

// GetDefaultExportFolder returns the configured export folder or the default OS Videos/AmonHen path.
func (a *App) GetDefaultExportFolder() (string, error) {
	a.configMu.Lock()
	saved := a.config.ExportFolder
	a.configMu.Unlock()
	if saved != "" {
		return saved, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "AmonHen", "Videos"), nil
	}
	return filepath.Join(home, "Videos", "AmonHen"), nil
}

// SetDefaultExportFolder saves the designated export directory in config.
func (a *App) SetDefaultExportFolder(folder string) error {
	a.configMu.Lock()
	a.config.ExportFolder = folder
	a.configMu.Unlock()
	return a.saveConfig()
}

// SelectExportFolder opens a native OS folder picker to choose an export directory.
func (a *App) SelectExportFolder() (string, error) {
	defaultDir, _ := a.GetDefaultExportFolder()
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Select export destination folder",
		DefaultDirectory: defaultDir,
	})
	if err != nil || dir == "" {
		return "", err
	}
	return dir, nil
}

// ExportVideos copies selected videos with sanitized titles or tracking IDs and optional metadata to destinationFolder.
func (a *App) ExportVideos(items []ExportItem, destinationFolder string, writeMetadata bool, useTrackingID bool) (ExportResult, error) {
	result := ExportResult{
		ExportedPaths: make([]string, 0),
		ExportIDs:     make([]string, 0),
		Errors:        make([]string, 0),
	}

	if useTrackingID && (a.db == nil || a.db.conn == nil) {
		return result, fmt.Errorf("database not initialized")
	}

	targetDir := destinationFolder
	if targetDir == "" {
		var err error
		targetDir, err = a.GetDefaultExportFolder()
		if err != nil {
			return result, fmt.Errorf("invalid destination folder: %w", err)
		}
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return result, fmt.Errorf("failed to create destination folder: %w", err)
	}

	for _, item := range items {
		destPath, exportID, err := a.exportSingleVideo(item, targetDir, writeMetadata, useTrackingID)
		if err != nil {
			result.FailedCount++
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		if exportID != "" {
			result.ExportIDs = append(result.ExportIDs, exportID)
		}
		result.SuccessCount++
		result.ExportedPaths = append(result.ExportedPaths, destPath)
	}

	return result, nil
}

func (a *App) exportSingleVideo(item ExportItem, targetDir string, writeMetadata bool, useTrackingID bool) (string, string, error) {
	if item.SourcePath == "" {
		return "", "", fmt.Errorf("source path cannot be empty")
	}
	if _, err := os.Stat(item.SourcePath); os.IsNotExist(err) {
		return "", "", fmt.Errorf("source file does not exist: %s", item.SourcePath)
	}

	ext := filepath.Ext(item.SourcePath)
	baseName, exportID, err := resolveExportBaseName(item, ext, useTrackingID)
	if err != nil {
		return "", "", err
	}

	destPath := resolveUniqueDestination(targetDir, baseName, ext)
	if err := copyFileNonDestructive(item.SourcePath, destPath); err != nil {
		return "", "", fmt.Errorf("failed to copy %s: %v", filepath.Base(item.SourcePath), err)
	}

	if useTrackingID {
		rec := ExportedVideoRecord{
			ExportID:      exportID,
			SourcePath:    item.SourcePath,
			ExportedPath:  destPath,
			TargetTitle:   item.TargetTitle,
			Description:   item.Description,
			Privacy:       item.Privacy,
			GameTag:       item.Game,
			PlaylistID:    item.PlaylistID,
			PlaylistTitle: item.PlaylistTitle,
			Episode:       item.Episode,
			ContentType:   item.ContentType,
			Tags:          strings.Join(item.Tags, ","),
			Status:        "exported",
		}
		if err := a.insertExportedVideo(rec); err != nil {
			_ = os.Remove(destPath)
			return "", "", fmt.Errorf("failed to persist export manifest for %s: %v", filepath.Base(item.SourcePath), err)
		}
	}

	if writeMetadata {
		metaPath := strings.TrimSuffix(destPath, ext) + ".txt"
		if err := writeMetadataCompanion(metaPath, item); err != nil {
			appLog("[Export] Warning: failed to write metadata companion for %s: %v", filepath.Base(destPath), err)
		}
	}

	return destPath, exportID, nil
}

func resolveExportBaseName(item ExportItem, ext string, useTrackingID bool) (string, string, error) {
	if useTrackingID {
		exportID, err := GenerateExportID()
		if err != nil {
			return "", "", fmt.Errorf("failed to generate tracking ID for %s: %v", filepath.Base(item.SourcePath), err)
		}
		if strings.TrimSpace(item.Game) != "" {
			return fmt.Sprintf("%s - %s", exportID, sanitizeFilename(item.Game)), exportID, nil
		}
		return exportID, exportID, nil
	}

	titleToUse := item.TargetTitle
	if strings.TrimSpace(titleToUse) == "" {
		titleToUse = strings.TrimSuffix(filepath.Base(item.SourcePath), ext)
	}
	return sanitizeFilename(titleToUse), "", nil
}

// OpenFolderInExplorer opens the specified folder path or selects the file in the OS file manager.
func (a *App) OpenFolderInExplorer(folderPath string) error {
	if folderPath == "" {
		return fmt.Errorf("folder path cannot be empty")
	}
	cleanPath := filepath.Clean(folderPath)
	info, err := os.Stat(cleanPath)
	if err != nil {
		return fmt.Errorf("path does not exist: %w", err)
	}

	var cmd *exec.Cmd
	switch goRuntime.GOOS {
	case "windows":
		if !info.IsDir() {
			cmd = exec.Command("explorer", "/select,"+cleanPath)
		} else {
			cmd = exec.Command("explorer", cleanPath)
		}
	case "darwin":
		if !info.IsDir() {
			cmd = exec.Command("open", "-R", cleanPath)
		} else {
			cmd = exec.Command("open", cleanPath)
		}
	default:
		if !info.IsDir() {
			cleanPath = filepath.Dir(cleanPath)
		}
		cmd = exec.Command("xdg-open", cleanPath)
	}
	return cmd.Start()
}
