package backend

import (
	"bytes"
	"context"
	"crypto/md5"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// initCache sets up the on-disk cache directory and the thumbnail semaphore.
func (a *App) initCache() {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}
	a.cacheDir = filepath.Join(base, "AmonHen", "cache")
	os.MkdirAll(filepath.Join(a.cacheDir, "thumbs"), 0755)
	os.MkdirAll(filepath.Join(a.cacheDir, "previews"), 0755)
	os.MkdirAll(filepath.Join(a.cacheDir, "durations"), 0755)
	fmt.Println("Cache directory:", a.cacheDir)

	// Limit concurrent ffmpeg/ffprobe processes to half the available CPU cores
	// (minimum 2) so opening a large folder doesn't saturate the CPU.
	workers := runtime.NumCPU() / 2
	if workers < 2 {
		workers = 2
	}
	a.thumbSem = make(chan struct{}, workers)
	fmt.Printf("Thumbnail worker limit: %d (of %d CPUs)\n", workers, runtime.NumCPU())
}

// cacheKey builds a unique filename from path + mod time
func cacheKey(path string, modTime time.Time) string {
	raw := fmt.Sprintf("%s|%d", path, modTime.UnixNano())
	sum := md5.Sum([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// GetCacheDir exposes the cache directory path to the frontend
func (a *App) GetCacheDir() string {
	return a.cacheDir
}


// GetThumbnail returns a local cache URL for a video file thumbnail.
// It respects the global thumbSem semaphore to cap concurrent ffmpeg processes.
func (a *App) GetThumbnail(path string) (string, error) {
	start := time.Now()
	info, err := os.Stat(path)
	if err != nil {
		appLog("[Media] GetThumbnail failed (file not found): %s", path)
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	cachePath := filepath.Join(a.cacheDir, "thumbs", key+".jpg")
	urlPath := "/cache/thumbs/" + key + ".jpg"

	// Cache hit — no ffmpeg needed, skip semaphore.
	if _, err := os.Stat(cachePath); err == nil {
		appLog("[Media] GetThumbnail CACHE HIT for %s in %v", filepath.Base(path), time.Since(start))
		return urlPath, nil
	}

	appLog("[Media] GetThumbnail CACHE MISS for %s (queued for generation)", filepath.Base(path))

	// Acquire a worker slot before spawning ffmpeg.
	a.thumbSem <- struct{}{}
	defer func() { <-a.thumbSem }()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-y",
		"-ss", "00:00:01",
		"-i", path,
		"-vframes", "1",
		"-vf", "scale=320:-1",
		"-q:v", "5",
		"-f", "image2",
		"-c:v", "mjpeg",
		cachePath,
	)
	hideWindow(cmd)
	if err := cmd.Run(); err != nil {
		appLog("[Media] GetThumbnail failed for %s: ffmpeg error: %v", filepath.Base(path), err)
		return "", fmt.Errorf("failed to generate thumbnail: %w", err)
	}
	appLog("[Media] GetThumbnail GENERATED for %s in %v", filepath.Base(path), time.Since(start))
	return urlPath, nil
}

// RegenerateThumbnail deletes the cached thumbnail and preview for a file,
// then generates and returns a fresh thumbnail. Call this when the user wants
// to force a new frame capture.
func (a *App) RegenerateThumbnail(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	thumbPath := filepath.Join(a.cacheDir, "thumbs", key+".jpg")
	previewPath := filepath.Join(a.cacheDir, "previews", key+".jpg")

	// Delete cached files so GetThumbnail / GetVideoPreview re-generate
	os.Remove(thumbPath)
	os.Remove(previewPath)

	// Generate fresh thumbnail
	return a.GetThumbnail(path)
}

// GetVideoPreview generates a 5x5 sprite sheet preview for a video file.
// It respects the global thumbSem semaphore to cap concurrent ffmpeg processes.
func (a *App) GetVideoPreview(path string) (string, error) {
	start := time.Now()
	info, err := os.Stat(path)
	if err != nil {
		appLog("[Media] GetVideoPreview failed (file not found): %s", path)
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	cachePath := filepath.Join(a.cacheDir, "previews", key+".jpg")
	urlPath := "/cache/previews/" + key + ".jpg"

	// Cache hit — no ffmpeg needed, skip semaphore.
	if _, err := os.Stat(cachePath); err == nil {
		appLog("[Media] GetVideoPreview CACHE HIT for %s in %v", filepath.Base(path), time.Since(start))
		return urlPath, nil
	}

	appLog("[Media] GetVideoPreview CACHE MISS for %s (queued for generation)", filepath.Base(path))

	// Acquire a worker slot before spawning ffmpeg.
	a.thumbSem <- struct{}{}
	defer func() { <-a.thumbSem }()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-y",
		"-i", path,
		"-vf", "select='not(mod(n,100))',scale=160:-1,tile=5x5",
		"-frames:v", "1",
		"-q:v", "5",
		"-f", "image2",
		"-c:v", "mjpeg",
		cachePath,
	)
	hideWindow(cmd)
	if err := cmd.Run(); err != nil {
		appLog("[Media] GetVideoPreview failed for %s: ffmpeg error: %v", filepath.Base(path), err)
		return "", fmt.Errorf("failed to generate preview: %w", err)
	}
	appLog("[Media] GetVideoPreview GENERATED for %s in %v", filepath.Base(path), time.Since(start))
	return urlPath, nil
}

// GetVideoDuration returns the duration of the video in seconds using ffprobe.
// Results are cached to disk so repeated calls (e.g. after rescan) are free.
func (a *App) GetVideoDuration(path string) (float64, error) {
	start := time.Now()
	info, err := os.Stat(path)
	if err != nil {
		return 0, fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	cachePath := filepath.Join(a.cacheDir, "durations", key+".txt")

	// Cache hit — skip ffprobe entirely.
	if data, readErr := os.ReadFile(cachePath); readErr == nil {
		if dur, parseErr := strconv.ParseFloat(strings.TrimSpace(string(data)), 64); parseErr == nil {
			appLog("[Media] GetVideoDuration CACHE HIT for %s in %v (%.2fs)", filepath.Base(path), time.Since(start), dur)
			return dur, nil
		}
	}

	appLog("[Media] GetVideoDuration CACHE MISS for %s (running ffprobe)", filepath.Base(path))

	// Acquire a worker slot before spawning ffprobe.
	a.thumbSem <- struct{}{}
	defer func() { <-a.thumbSem }()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path)
	hideWindow(cmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		appLog("[Media] GetVideoDuration failed for %s: ffprobe error: %v", filepath.Base(path), err)
		return 0, err
	}
	durStr := strings.TrimSpace(out.String())
	if durStr == "N/A" || durStr == "" {
		return 0, fmt.Errorf("duration N/A")
	}
	duration, err := strconv.ParseFloat(durStr, 64)
	if err != nil {
		return 0, err
	}
	// Persist to disk for future calls.
	_ = os.WriteFile(cachePath, []byte(durStr), 0644)
	appLog("[Media] GetVideoDuration GENERATED for %s in %v (%.2fs)", filepath.Base(path), time.Since(start), duration)
	return duration, nil
}
