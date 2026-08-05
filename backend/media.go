package backend

import (
	"bytes"
	"crypto/md5"
	"encoding/base64"
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

// readCached reads a cached image file and returns it as a base64 data URL
func readCached(cachePath string, mimeType string) (string, bool) {
	data, err := os.ReadFile(cachePath)
	if err != nil {
		return "", false
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	return "data:" + mimeType + ";base64," + encoded, true
}

// writeCached writes raw image bytes to a cache file
func writeCached(cachePath string, data []byte) {
	if err := os.WriteFile(cachePath, data, 0644); err != nil {
		fmt.Println("Cache write error:", err)
	}
}

// GetThumbnail returns a base64 PNG thumbnail for a video file.
// It respects the global thumbSem semaphore to cap concurrent ffmpeg processes.
func (a *App) GetThumbnail(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	cachePath := filepath.Join(a.cacheDir, "thumbs", key+".png")

	// Cache hit — no ffmpeg needed, skip semaphore.
	if cached, ok := readCached(cachePath, "image/png"); ok {
		return cached, nil
	}

	// Acquire a worker slot before spawning ffmpeg.
	a.thumbSem <- struct{}{}
	defer func() { <-a.thumbSem }()

	cmd := exec.Command(
		"ffmpeg",
		"-ss", "00:00:01",
		"-i", path,
		"-vframes", "1",
		"-vf", "scale=320:-1",
		"-f", "image2",
		"-c:v", "png",
		"-",
	)
	hideWindow(cmd)
	var buffer bytes.Buffer
	cmd.Stdout = &buffer
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate thumbnail: %w", err)
	}
	raw := buffer.Bytes()
	writeCached(cachePath, raw)
	encoded := base64.StdEncoding.EncodeToString(raw)
	return "data:image/png;base64," + encoded, nil
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
	thumbPath := filepath.Join(a.cacheDir, "thumbs", key+".png")
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
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	cachePath := filepath.Join(a.cacheDir, "previews", key+".jpg")

	// Cache hit — no ffmpeg needed, skip semaphore.
	if cached, ok := readCached(cachePath, "image/jpeg"); ok {
		return cached, nil
	}

	// Acquire a worker slot before spawning ffmpeg.
	a.thumbSem <- struct{}{}
	defer func() { <-a.thumbSem }()

	cmd := exec.Command(
		"ffmpeg",
		"-i", path,
		"-vf", "select=not(mod(n,100)),scale=160:-1,tile=5x5",
		"-frames:v", "1",
		"-q:v", "5",
		"-f", "image2",
		"-c:v", "mjpeg",
		"-",
	)
	hideWindow(cmd)
	var buffer bytes.Buffer
	cmd.Stdout = &buffer
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate preview: %w", err)
	}
	raw := buffer.Bytes()
	writeCached(cachePath, raw)
	encoded := base64.StdEncoding.EncodeToString(raw)
	return "data:image/jpeg;base64," + encoded, nil
}

// GetVideoDuration returns the duration of the video in seconds using ffprobe.
// It respects the global thumbSem semaphore to cap concurrent ffprobe processes.
func (a *App) GetVideoDuration(path string) (float64, error) {
	// Acquire a worker slot before spawning ffprobe.
	a.thumbSem <- struct{}{}
	defer func() { <-a.thumbSem }()

	cmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path)
	hideWindow(cmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
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
	return duration, nil
}
