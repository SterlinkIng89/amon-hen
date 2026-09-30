package backend

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var sanitizeRegex = regexp.MustCompile(`[\\/:*?"<>|]`)

// sanitizeClipTitle cleans user-provided title for safe filesystem usage.
func sanitizeClipTitle(title string) string {
	cleaned := sanitizeRegex.ReplaceAllString(title, "_")
	cleaned = strings.TrimSpace(cleaned)
	return cleaned
}

// CreateVideoClip extracts a segment from sourcePath using FFmpeg stream copy.
// startSec and endSec are in seconds. The new clip inherits the parent video's timeline/date and metadata.
// Returns the absolute path of the generated clip.
func (a *App) CreateVideoClip(sourcePath string, startSec float64, endSec float64, clipTitle string) (string, error) {
	start := time.Now()

	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		appLog("[Clip] CreateVideoClip failed (source not found): %s", sourcePath)
		return "", fmt.Errorf("source video not found: %w", err)
	}

	if startSec < 0 {
		startSec = 0
	}
	if endSec <= startSec || (endSec-startSec) < 1.0 {
		return "", fmt.Errorf("invalid clip range: duration must be at least 1 second")
	}

	sourceDir := filepath.Dir(sourcePath)
	sourceExt := filepath.Ext(sourcePath)
	if sourceExt == "" {
		sourceExt = ".mp4"
	}
	sourceBase := strings.TrimSuffix(filepath.Base(sourcePath), sourceExt)

	safeTitle := sanitizeClipTitle(clipTitle)
	if safeTitle == "" {
		safeTitle = fmt.Sprintf("%s_clip_%d", sourceBase, time.Now().Unix())
	}

	outFileName := safeTitle + sourceExt
	outPath := filepath.Join(sourceDir, outFileName)

	collisionIndex := 1
	for {
		if _, err := os.Stat(outPath); os.IsNotExist(err) {
			break
		}
		outFileName = fmt.Sprintf("%s (%d)%s", safeTitle, collisionIndex, sourceExt)
		outPath = filepath.Join(sourceDir, outFileName)
		collisionIndex++
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-y",
		"-ss", fmt.Sprintf("%.3f", startSec),
		"-to", fmt.Sprintf("%.3f", endSec),
		"-i", sourcePath,
		"-c", "copy",
		"-avoid_negative_ts", "make_zero",
		outPath,
	)
	hideWindow(cmd)

	if output, err := cmd.CombinedOutput(); err != nil {
		appLog("[Clip] FFmpeg clip failed for %s -> %s: %v | Output: %s", sourcePath, outPath, err, string(output))
		_ = os.Remove(outPath)
		return "", fmt.Errorf("ffmpeg clip error: %w", err)
	}

	// Preserve original recording timestamp from parent video
	parentModTime := sourceInfo.ModTime()
	if err := os.Chtimes(outPath, parentModTime, parentModTime); err != nil {
		appLog("[Clip] Warning: failed to set modification time on clip: %v", err)
	}

	appLog("[Clip] Created clip %s (%.2fs - %.2fs) in %v", outPath, startSec, endSec, time.Since(start))

	a.configMu.Lock()
	if a.config.VideoMetadata == nil {
		a.config.VideoMetadata = make(map[string]VideoMeta)
	}
	if a.config.VideoGames == nil {
		a.config.VideoGames = make(map[string]string)
	}

	parentMeta, exists := a.config.VideoMetadata[sourcePath]
	if exists {
		var clonedVars map[string]string
		if parentMeta.CustomVars != nil {
			clonedVars = make(map[string]string, len(parentMeta.CustomVars))
			for k, v := range parentMeta.CustomVars {
				clonedVars[k] = v
			}
		}

		clipMeta := VideoMeta{
			Game:         parentMeta.Game,
			YouTubeTitle: safeTitle,
			Description:  parentMeta.Description,
			Privacy:      parentMeta.Privacy,
			PlaylistID:   parentMeta.PlaylistID,
			Episode:      parentMeta.Episode,
			Event:        safeTitle,
			GameMode:     parentMeta.GameMode,
			CustomVars:   clonedVars,
		}

		a.config.VideoMetadata[outPath] = clipMeta
		if parentMeta.Game != "" {
			a.config.VideoGames[outPath] = parentMeta.Game
		}
	} else {
		a.config.VideoMetadata[outPath] = VideoMeta{
			YouTubeTitle: safeTitle,
			Event:        safeTitle,
		}
	}
	a.configMu.Unlock()

	_ = a.saveConfig()

	return outPath, nil
}
