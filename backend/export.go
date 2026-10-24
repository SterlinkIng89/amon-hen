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
	PlaylistTitle string   `json:"playlistTitle"`
	Privacy       string   `json:"privacy"`
	Tags          []string `json:"tags"`
}

// ExportResult contains execution metrics and resulting files from bulk export.
type ExportResult struct {
	SuccessCount  int      `json:"successCount"`
	FailedCount   int      `json:"failedCount"`
	ExportedPaths []string `json:"exportedPaths"`
	Errors        []string `json:"errors"`
}

var (
	forbiddenCharsRegex = regexp.MustCompile(`[\\/:*?"<>|\r\n\t\x00-\x1f]`)
	multiDashRegex      = regexp.MustCompile(`-+`)
	multiSpaceRegex     = regexp.MustCompile(`\s+`)
)

// sanitizeFilename strips and transforms characters forbidden on Windows, macOS, and Linux filesystems.
func sanitizeFilename(name string) string {
	cleaned := forbiddenCharsRegex.ReplaceAllString(name, "-")
	cleaned = multiDashRegex.ReplaceAllString(cleaned, "-")
	cleaned = multiSpaceRegex.ReplaceAllString(cleaned, " ")
	cleaned = strings.Trim(cleaned, " .-")
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

// ExportVideos copies selected videos with sanitized titles and optional metadata to destinationFolder.
func (a *App) ExportVideos(items []ExportItem, destinationFolder string, writeMetadata bool) (ExportResult, error) {
	result := ExportResult{
		ExportedPaths: make([]string, 0),
		Errors:        make([]string, 0),
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
		if item.SourcePath == "" {
			result.FailedCount++
			result.Errors = append(result.Errors, "source path cannot be empty")
			continue
		}

		if _, err := os.Stat(item.SourcePath); os.IsNotExist(err) {
			result.FailedCount++
			result.Errors = append(result.Errors, fmt.Sprintf("source file does not exist: %s", item.SourcePath))
			continue
		}

		ext := filepath.Ext(item.SourcePath)
		titleToUse := item.TargetTitle
		if strings.TrimSpace(titleToUse) == "" {
			titleToUse = strings.TrimSuffix(filepath.Base(item.SourcePath), ext)
		}
		sanitized := sanitizeFilename(titleToUse)
		destPath := resolveUniqueDestination(targetDir, sanitized, ext)

		if err := copyFileNonDestructive(item.SourcePath, destPath); err != nil {
			result.FailedCount++
			result.Errors = append(result.Errors, fmt.Sprintf("failed to copy %s: %v", filepath.Base(item.SourcePath), err))
			continue
		}

		if writeMetadata {
			stem := strings.TrimSuffix(destPath, ext)
			metaPath := stem + ".txt"
			if err := writeMetadataCompanion(metaPath, item); err != nil {
				appLog("[Export] Warning: failed to write metadata companion for %s: %v", filepath.Base(destPath), err)
			}
		}

		result.SuccessCount++
		result.ExportedPaths = append(result.ExportedPaths, destPath)
	}

	return result, nil
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
