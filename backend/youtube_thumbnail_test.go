package backend

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"google.golang.org/api/googleapi"
	"google.golang.org/api/youtube/v3"
)

func TestValidateThumbnailFile(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. Non-existent file
	missingPath := filepath.Join(tmpDir, "missing.jpg")
	err := validateThumbnailFile(missingPath)
	if err == nil {
		t.Errorf("expected error for non-existent file, got nil")
	}

	// 2. Unsupported extension (.gif)
	gifPath := filepath.Join(tmpDir, "test.gif")
	_ = os.WriteFile(gifPath, []byte("fake gif content"), 0644)
	err = validateThumbnailFile(gifPath)
	if err == nil || !strings.Contains(err.Error(), "unsupported format") {
		t.Errorf("expected unsupported format error for .gif, got: %v", err)
	}

	// 3. Oversized file (> 2MB)
	bigPath := filepath.Join(tmpDir, "large.jpg")
	bigData := make([]byte, 2*1024*1024+1)
	_ = os.WriteFile(bigPath, bigData, 0644)
	err = validateThumbnailFile(bigPath)
	if err == nil || !strings.Contains(err.Error(), "exceeds maximum allowed size") {
		t.Errorf("expected size limit error for >2MB file, got: %v", err)
	}

	// 4. Valid JPEG file (< 2MB)
	validJpg := filepath.Join(tmpDir, "valid.jpg")
	_ = os.WriteFile(validJpg, []byte("fake jpeg content"), 0644)
	err = validateThumbnailFile(validJpg)
	if err != nil {
		t.Errorf("expected valid jpg to pass validation, got: %v", err)
	}

	// 5. Valid PNG file (< 2MB)
	validPng := filepath.Join(tmpDir, "valid.png")
	_ = os.WriteFile(validPng, []byte("fake png content"), 0644)
	err = validateThumbnailFile(validPng)
	if err != nil {
		t.Errorf("expected valid png to pass validation, got: %v", err)
	}
}

func TestPickThumbnailURL(t *testing.T) {
	// Nil response
	if url := pickThumbnailURL(nil); url != "" {
		t.Errorf("expected empty string for nil response, got %s", url)
	}

	// Empty items
	if url := pickThumbnailURL(&youtube.ThumbnailSetResponse{Items: []*youtube.ThumbnailDetails{}}); url != "" {
		t.Errorf("expected empty string for empty items, got %s", url)
	}

	// Maxres preferred
	resp1 := &youtube.ThumbnailSetResponse{
		Items: []*youtube.ThumbnailDetails{
			{
				Maxres:   &youtube.Thumbnail{Url: "https://example.com/maxres.jpg"},
				Standard: &youtube.Thumbnail{Url: "https://example.com/standard.jpg"},
				High:     &youtube.Thumbnail{Url: "https://example.com/high.jpg"},
			},
		},
	}
	if url := pickThumbnailURL(resp1); url != "https://example.com/maxres.jpg" {
		t.Errorf("expected maxres url, got: %s", url)
	}

	// Fallback to Standard when Maxres is nil
	resp2 := &youtube.ThumbnailSetResponse{
		Items: []*youtube.ThumbnailDetails{
			{
				Standard: &youtube.Thumbnail{Url: "https://example.com/standard.jpg"},
				Default:  &youtube.Thumbnail{Url: "https://example.com/default.jpg"},
			},
		},
	}
	if url := pickThumbnailURL(resp2); url != "https://example.com/standard.jpg" {
		t.Errorf("expected standard url, got: %s", url)
	}

	// Fallback down to Default
	resp3 := &youtube.ThumbnailSetResponse{
		Items: []*youtube.ThumbnailDetails{
			{
				Default: &youtube.Thumbnail{Url: "https://example.com/default.jpg"},
			},
		},
	}
	if url := pickThumbnailURL(resp3); url != "https://example.com/default.jpg" {
		t.Errorf("expected default url, got: %s", url)
	}
}

func TestFriendlyThumbnailError(t *testing.T) {
	// Quota error
	quotaErr := &googleapi.Error{
		Code: http.StatusForbidden,
		Errors: []googleapi.ErrorItem{
			{Reason: "quotaExceeded"},
		},
		Message: "quota exceeded",
	}
	res := friendlyThumbnailError(quotaErr)
	if !strings.Contains(res.Error(), "quota") {
		t.Errorf("expected friendly message to contain 'quota', got: %v", res)
	}

	// Auth 401 error
	authErr := &googleapi.Error{
		Code:    http.StatusUnauthorized,
		Message: "Invalid Credentials",
	}
	res = friendlyThumbnailError(authErr)
	if !strings.Contains(res.Error(), "authenticate") {
		t.Errorf("expected friendly message to contain 'authenticate', got: %v", res)
	}

	// Video not found 404
	notFoundErr := &googleapi.Error{
		Code:    http.StatusNotFound,
		Message: "Video not found",
	}
	res = friendlyThumbnailError(notFoundErr)
	if !strings.Contains(res.Error(), "not found") {
		t.Errorf("expected friendly message to contain 'not found', got: %v", res)
	}

	// Other 403 (e.g. channel not verified)
	forbiddenErr := &googleapi.Error{
		Code:    http.StatusForbidden,
		Message: "Forbidden",
	}
	res = friendlyThumbnailError(forbiddenErr)
	if !strings.Contains(res.Error(), "verified") {
		t.Errorf("expected friendly message to contain 'verified', got: %v", res)
	}

	// Generic error
	genericErr := fmt.Errorf("network connection dropped")
	res = friendlyThumbnailError(genericErr)
	if !strings.Contains(res.Error(), "network connection dropped") {
		t.Errorf("expected generic error message to be preserved, got: %v", res)
	}
}

func TestPersistThumbnailURL(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Seed video row
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, thumbnail_url)
		VALUES ('vid-test-1', 'Test Video', '')
	`)
	if err != nil {
		t.Fatalf("failed to insert video row: %v", err)
	}

	targetURL := "https://example.com/thumb_updated.jpg?v=12345"
	err = app.persistThumbnailURL("vid-test-1", targetURL)
	if err != nil {
		t.Fatalf("persistThumbnailURL failed: %v", err)
	}

	var savedURL string
	err = app.db.conn.QueryRow("SELECT thumbnail_url FROM yt_videos WHERE id = 'vid-test-1'").Scan(&savedURL)
	if err != nil {
		t.Fatalf("failed to query thumbnail_url: %v", err)
	}
	if savedURL != targetURL {
		t.Errorf("expected %s, got %s", targetURL, savedURL)
	}

	// Non-existent video does not error out
	err = app.persistThumbnailURL("non-existent-id", "https://example.com/another.jpg")
	if err != nil {
		t.Errorf("expected non-existent video update to succeed without error, got: %v", err)
	}
}

func TestUpdateYouTubeThumbnail_RejectsEmptyArgs(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.UpdateYouTubeThumbnail("", "some/path.jpg")
	if err == nil || !strings.Contains(err.Error(), "videoID cannot be empty") {
		t.Errorf("expected error for empty videoID, got: %v", err)
	}

	_, err = app.UpdateYouTubeThumbnail("vid-1", "")
	if err == nil || !strings.Contains(err.Error(), "imagePath cannot be empty") {
		t.Errorf("expected error for empty imagePath, got: %v", err)
	}
}
