package backend_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"amon-hen/backend"
)

func setupTestApp(t *testing.T) (*backend.App, string) {
	tempDir, err := os.MkdirTemp("", "amon-hen-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	app := backend.NewTestApp(tempDir)
	return app, tempDir
}

func TestCacheKey(t *testing.T) {
	path := "C:/Videos/gameplay.mp4"
	t1 := time.Unix(1000, 0)
	t2 := time.Unix(2000, 0)

	key1 := backend.CacheKey(path, t1)
	key1Repeat := backend.CacheKey(path, t1)
	key2 := backend.CacheKey(path, t2)

	if key1 != key1Repeat {
		t.Errorf("Expected identical cache keys for same input, got %s and %s", key1, key1Repeat)
	}

	if key1 == key2 {
		t.Errorf("Expected different cache keys for different mod times, got %s for both", key1)
	}
}

func TestGetThumbnail_FileNotFound(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	_, err := app.GetThumbnail(filepath.Join(tempDir, "non_existent.mp4"))
	if err == nil {
		t.Errorf("Expected error for non-existent file, got nil")
	}
}

func TestGetThumbnail_CacheHit(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	// Create a dummy video file
	videoPath := filepath.Join(tempDir, "video.mp4")
	if err := os.WriteFile(videoPath, []byte("fake video content"), 0644); err != nil {
		t.Fatalf("Failed to create dummy video: %v", err)
	}

	info, err := os.Stat(videoPath)
	if err != nil {
		t.Fatalf("Failed to stat dummy video: %v", err)
	}

	key := backend.CacheKey(videoPath, info.ModTime())
	cachedThumbPath := filepath.Join(tempDir, "thumbs", key+".jpg")
	if err := os.WriteFile(cachedThumbPath, []byte("fake thumbnail image"), 0644); err != nil {
		t.Fatalf("Failed to create cached thumbnail: %v", err)
	}

	url, err := app.GetThumbnail(videoPath)
	if err != nil {
		t.Fatalf("GetThumbnail returned error on cache hit: %v", err)
	}

	expectedURL := "/cache/thumbs/" + key + ".jpg"
	if url != expectedURL {
		t.Errorf("Expected URL %s, got %s", expectedURL, url)
	}
}

func TestGetVideoPreview_CacheHit(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	videoPath := filepath.Join(tempDir, "video.mp4")
	if err := os.WriteFile(videoPath, []byte("fake video content"), 0644); err != nil {
		t.Fatalf("Failed to create dummy video: %v", err)
	}

	info, err := os.Stat(videoPath)
	if err != nil {
		t.Fatalf("Failed to stat dummy video: %v", err)
	}

	key := backend.CacheKey(videoPath, info.ModTime())
	cachedPreviewPath := filepath.Join(tempDir, "previews", key+".jpg")
	if err := os.WriteFile(cachedPreviewPath, []byte("fake preview sheet"), 0644); err != nil {
		t.Fatalf("Failed to create cached preview: %v", err)
	}

	url, err := app.GetVideoPreview(videoPath)
	if err != nil {
		t.Fatalf("GetVideoPreview returned error on cache hit: %v", err)
	}

	expectedURL := "/cache/previews/" + key + ".jpg"
	if url != expectedURL {
		t.Errorf("Expected URL %s, got %s", expectedURL, url)
	}
}

func TestGetVideoDuration_CacheHit(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	videoPath := filepath.Join(tempDir, "video.mp4")
	if err := os.WriteFile(videoPath, []byte("fake video content"), 0644); err != nil {
		t.Fatalf("Failed to create dummy video: %v", err)
	}

	info, err := os.Stat(videoPath)
	if err != nil {
		t.Fatalf("Failed to stat dummy video: %v", err)
	}

	key := backend.CacheKey(videoPath, info.ModTime())
	cachedDurationPath := filepath.Join(tempDir, "durations", key+".txt")
	if err := os.WriteFile(cachedDurationPath, []byte("42.50\n"), 0644); err != nil {
		t.Fatalf("Failed to create cached duration: %v", err)
	}

	dur, err := app.GetVideoDuration(videoPath)
	if err != nil {
		t.Fatalf("GetVideoDuration returned error on cache hit: %v", err)
	}

	if dur != 42.50 {
		t.Errorf("Expected duration 42.50, got %f", dur)
	}
}
