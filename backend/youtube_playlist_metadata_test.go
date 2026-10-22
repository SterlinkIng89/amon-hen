package backend

import (
	"strings"
	"testing"
)

func TestUpdatePlaylistMetadataValidation(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// 1. Empty playlist ID
	err := app.UpdatePlaylistMetadata("", "New Title", "Description", "public")
	if err == nil || !strings.Contains(err.Error(), "playlist ID cannot be empty") {
		t.Fatalf("expected playlist ID cannot be empty error, got: %v", err)
	}

	// 2. Whitespace playlist ID
	err = app.UpdatePlaylistMetadata("   ", "New Title", "Description", "public")
	if err == nil || !strings.Contains(err.Error(), "playlist ID cannot be empty") {
		t.Fatalf("expected playlist ID cannot be empty error, got: %v", err)
	}

	// 3. Empty title
	err = app.UpdatePlaylistMetadata("pl-123", "", "Description", "public")
	if err == nil || !strings.Contains(err.Error(), "playlist title cannot be empty") {
		t.Fatalf("expected playlist title cannot be empty error, got: %v", err)
	}

	// 4. Whitespace title
	err = app.UpdatePlaylistMetadata("pl-123", "   \t\n  ", "Description", "public")
	if err == nil || !strings.Contains(err.Error(), "playlist title cannot be empty") {
		t.Fatalf("expected playlist title cannot be empty error, got: %v", err)
	}

	// 5. Invalid privacy status
	err = app.UpdatePlaylistMetadata("pl-123", "Valid Title", "Description", "unknown_privacy")
	if err == nil || !strings.Contains(err.Error(), "invalid privacy status") {
		t.Fatalf("expected invalid privacy status error, got: %v", err)
	}

	// 6. Unauthenticated attempt fails with not authenticated
	err = app.UpdatePlaylistMetadata("pl-123", "Valid Title", "Description", "public")
	if err == nil || !strings.Contains(err.Error(), "not authenticated") {
		t.Fatalf("expected not authenticated error, got: %v", err)
	}
}

func TestUpdatePlaylistMetadataLocal(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Seed an initial playlist
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, privacy)
		VALUES ('pl-metadata-1', 'Original Title', 'Original Desc', 5, 'https://example.com/thumb.jpg', '2026-01-01T00:00:00Z', 'public');
	`)
	if err != nil {
		t.Fatalf("failed to seed yt_playlists: %v", err)
	}

	// Call updatePlaylistMetadataLocal
	err = app.updatePlaylistMetadataLocal("pl-metadata-1", "Updated Title", "Updated Description", "unlisted")
	if err != nil {
		t.Fatalf("expected updatePlaylistMetadataLocal to succeed, got: %v", err)
	}

	// Verify SQLite record updated
	var title, desc, privacy string
	err = app.db.conn.QueryRow("SELECT title, description, privacy FROM yt_playlists WHERE id = 'pl-metadata-1'").Scan(&title, &desc, &privacy)
	if err != nil {
		t.Fatalf("failed to query updated playlist: %v", err)
	}

	if title != "Updated Title" {
		t.Errorf("expected title 'Updated Title', got %q", title)
	}
	if desc != "Updated Description" {
		t.Errorf("expected description 'Updated Description', got %q", desc)
	}
	if privacy != "unlisted" {
		t.Errorf("expected privacy 'unlisted', got %q", privacy)
	}
}
