package backend

import (
	"encoding/base64"
	"os"
	"strings"
	"testing"
)

func TestCustomThumbnail_SaveGetDelete(t *testing.T) {
	tmpDir := t.TempDir()
	app := &App{
		cacheDir: tmpDir,
	}

	videoPath := "C:/videos/my_gameplay.mp4"

	// 1. Initially, GetCustomThumbnail returns empty
	existing, err := app.GetCustomThumbnail(videoPath)
	if err != nil {
		t.Fatalf("unexpected error getting non-existent thumbnail: %v", err)
	}
	if existing != "" {
		t.Fatalf("expected empty custom thumbnail url, got: %s", existing)
	}

	// 2. Prepare sample base64 jpeg data
	sampleBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46}
	b64Data := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(sampleBytes)

	// 3. Save custom thumbnail
	savedAbsPath, err := app.SaveCustomThumbnail(videoPath, b64Data)
	if err != nil {
		t.Fatalf("failed to save custom thumbnail: %v", err)
	}
	if savedAbsPath == "" {
		t.Fatalf("expected non-empty saved path")
	}
	if !strings.HasSuffix(savedAbsPath, ".jpg") {
		t.Fatalf("expected saved path to end with .jpg, got: %s", savedAbsPath)
	}

	// Verify file exists on disk with correct contents
	fileBytes, err := os.ReadFile(savedAbsPath)
	if err != nil {
		t.Fatalf("failed to read saved thumbnail file: %v", err)
	}
	if len(fileBytes) != len(sampleBytes) {
		t.Fatalf("saved bytes length %d != sample bytes length %d", len(fileBytes), len(sampleBytes))
	}

	// 4. Get custom thumbnail returns valid URL
	thumbUrl, err := app.GetCustomThumbnail(videoPath)
	if err != nil {
		t.Fatalf("failed to get custom thumbnail: %v", err)
	}
	if !strings.HasPrefix(thumbUrl, "/cache/yt_thumbs/") {
		t.Fatalf("expected url to start with /cache/yt_thumbs/, got: %s", thumbUrl)
	}

	// 5. Delete custom thumbnail
	if err := app.DeleteCustomThumbnail(videoPath); err != nil {
		t.Fatalf("failed to delete custom thumbnail: %v", err)
	}
	if _, err := os.Stat(savedAbsPath); !os.IsNotExist(err) {
		t.Fatalf("expected file to be deleted, but it still exists")
	}

	// 6. After delete, GetCustomThumbnail is empty again
	afterDel, err := app.GetCustomThumbnail(videoPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if afterDel != "" {
		t.Fatalf("expected empty url after delete, got: %s", afterDel)
	}
}
