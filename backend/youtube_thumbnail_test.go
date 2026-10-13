package backend

import (
	"fmt"
	"image"
	"image/jpeg"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

	// Aspect ratio 1:1 error
	aspectErr := &googleapi.Error{
		Code:    http.StatusInternalServerError,
		Message: "INVALID_ASPECT_RATIO",
	}
	res = friendlyThumbnailError(aspectErr)
	if !strings.Contains(res.Error(), "1:1 (square)") {
		t.Errorf("expected aspect ratio friendly message, got: %v", res)
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

func TestSetYouTubePlaylistThumbnail_RejectsEmptyArgs(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.SetYouTubePlaylistThumbnail("", "some/path.jpg")
	if err == nil || !strings.Contains(err.Error(), "playlistID cannot be empty") {
		t.Errorf("expected error for empty playlistID, got: %v", err)
	}

	_, err = app.SetYouTubePlaylistThumbnail("pl-1", "")
	if err == nil || !strings.Contains(err.Error(), "imagePath cannot be empty") {
		t.Errorf("expected error for empty imagePath, got: %v", err)
	}
}

func TestPersistPlaylistThumbnailURL(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, privacy)
		VALUES ('pl-test-1', 'Test Playlist', 'Desc', 5, 'https://example.com/old.jpg', '2026-01-01', 'public')
	`)
	if err != nil {
		t.Fatalf("failed to insert test playlist: %v", err)
	}

	targetURL := "/cache/yt_thumbs/yt_custom_pl.jpg?v=12345"
	err = app.persistPlaylistThumbnailURL("pl-test-1", targetURL)
	if err != nil {
		t.Fatalf("persistPlaylistThumbnailURL failed: %v", err)
	}

	var savedURL string
	err = app.db.conn.QueryRow("SELECT thumbnail_url FROM yt_playlists WHERE id = 'pl-test-1'").Scan(&savedURL)
	if err != nil {
		t.Fatalf("failed to query thumbnail_url: %v", err)
	}
	if savedURL != targetURL {
		t.Errorf("expected %s, got %s", targetURL, savedURL)
	}

	// Non-existent playlist does not error out
	err = app.persistPlaylistThumbnailURL("non-existent-pl", "/cache/yt_thumbs/other.jpg")
	if err != nil {
		t.Errorf("expected non-existent playlist update to succeed without error, got: %v", err)
	}
}

func TestEnsureSquareImage(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. Create a 1:1 square JPEG (200x200)
	squarePath := filepath.Join(tmpDir, "square.jpg")
	sqFile, err := os.Create(squarePath)
	if err != nil {
		t.Fatalf("failed to create square file: %v", err)
	}
	sqImg := image.NewRGBA(image.Rect(0, 0, 200, 200))
	if err := jpeg.Encode(sqFile, sqImg, &jpeg.Options{Quality: 90}); err != nil {
		sqFile.Close()
		t.Fatalf("failed to encode square image: %v", err)
	}
	sqFile.Close()

	outPath, cleanup, err := ensureSquareImage(squarePath)
	if err != nil {
		t.Fatalf("ensureSquareImage failed for square image: %v", err)
	}
	defer cleanup()
	if outPath != squarePath {
		t.Errorf("expected square image to return original path %s, got %s", squarePath, outPath)
	}

	// 2. Create a 16:9 rectangular JPEG (320x180)
	rectPath := filepath.Join(tmpDir, "rect.jpg")
	rectFile, err := os.Create(rectPath)
	if err != nil {
		t.Fatalf("failed to create rect file: %v", err)
	}
	rectImg := image.NewRGBA(image.Rect(0, 0, 320, 180))
	if err := jpeg.Encode(rectFile, rectImg, &jpeg.Options{Quality: 90}); err != nil {
		rectFile.Close()
		t.Fatalf("failed to encode rect image: %v", err)
	}
	rectFile.Close()

	outRectPath, cleanupRect, err := ensureSquareImage(rectPath)
	if err != nil {
		t.Fatalf("ensureSquareImage failed for rect image: %v", err)
	}
	defer cleanupRect()

	if outRectPath == rectPath {
		t.Errorf("expected rect image to be cropped to new path, got original %s", rectPath)
	}

	// Verify that the output image is 1:1 square (180x180)
	checkFile, err := os.Open(outRectPath)
	if err != nil {
		t.Fatalf("failed to open output square image: %v", err)
	}
	defer checkFile.Close()

	cfg, _, err := image.DecodeConfig(checkFile)
	if err != nil {
		t.Fatalf("failed to decode config of output square image: %v", err)
	}
	if cfg.Width != 180 || cfg.Height != 180 {
		t.Errorf("expected 180x180 square, got %dx%d", cfg.Width, cfg.Height)
	}
}

func TestLogAPICall_ThumbnailsSet(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, thumbnail_url)
		VALUES ('vid-test-log', 'Elden Ring Episode 1', '')
	`)
	if err != nil {
		t.Fatalf("failed to insert video: %v", err)
	}

	start := time.Now()
	app.logAPICall("thumbnails.set", "vid-test-log", "Elden Ring Episode 1", QuotaThumbnailsSet, start, nil)

	logs, err := app.GetAPILogs(10)
	if err != nil {
		t.Fatalf("GetAPILogs failed: %v", err)
	}
	if len(logs) == 0 {
		t.Fatalf("expected at least 1 log entry, got 0")
	}

	found := false
	for _, l := range logs {
		if l.Operation == "thumbnails.set" && l.ResourceID == "vid-test-log" {
			found = true
			if l.QuotaCost != 50 {
				t.Errorf("expected QuotaCost 50, got %d", l.QuotaCost)
			}
			if l.ResourceTitle != "Elden Ring Episode 1" {
				t.Errorf("expected ResourceTitle 'Elden Ring Episode 1', got %q", l.ResourceTitle)
			}
			if !l.Success {
				t.Errorf("expected success to be true")
			}
			break
		}
	}
	if !found {
		t.Errorf("thumbnails.set operation not found in logs")
	}

	quotaToday, err := app.GetQuotaUsedToday()
	if err != nil {
		t.Fatalf("GetQuotaUsedToday failed: %v", err)
	}
	if quotaToday != 50 {
		t.Errorf("expected quotaToday 50, got %d", quotaToday)
	}
}

func TestQueryResourceTitle(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title) VALUES ('v1', 'Video Alpha');
		INSERT INTO yt_playlists (id, title) VALUES ('p1', 'Playlist Omega');
	`)
	if err != nil {
		t.Fatalf("failed to insert test data: %v", err)
	}

	if got := app.queryResourceTitle("yt_videos", "v1", "fallback"); got != "Video Alpha" {
		t.Errorf("expected 'Video Alpha', got %q", got)
	}
	if got := app.queryResourceTitle("yt_videos", "unknown", "fallback.jpg"); got != "fallback.jpg" {
		t.Errorf("expected 'fallback.jpg', got %q", got)
	}
	if got := app.queryResourceTitle("yt_playlists", "p1", "p1"); got != "Playlist Omega" {
		t.Errorf("expected 'Playlist Omega', got %q", got)
	}
	if got := app.queryResourceTitle("yt_playlists", "unknown", "p_fallback"); got != "p_fallback" {
		t.Errorf("expected 'p_fallback', got %q", got)
	}
}

