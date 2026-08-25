package backend_test

import (
	"os"
	"path/filepath"
	"testing"

	"amon-hen/backend"
)

func TestValidatePrivacyStatus(t *testing.T) {
	validStatuses := []string{"public", "unlisted", "private", "PUBLIC", "Unlisted", " Private "}
	for _, status := range validStatuses {
		normalized, err := backend.ValidatePrivacyStatus(status)
		if err != nil {
			t.Errorf("Expected status %q to be valid, got error: %v", status, err)
		}
		if normalized != "public" && normalized != "unlisted" && normalized != "private" {
			t.Errorf("Expected normalized status to be lowercase and trimmed, got %q", normalized)
		}
	}

	invalidStatuses := []string{"", "hidden", "secret", "friends_only", "any"}
	for _, status := range invalidStatuses {
		_, err := backend.ValidatePrivacyStatus(status)
		if err == nil {
			t.Errorf("Expected status %q to be invalid, but got nil error", status)
		}
	}
}

func TestGetChannelPlaylists_PrivacyField(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	err := app.InitTestDB(dbPath)
	if err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	// Insert test playlists with different privacy values
	db := app.GetDB()
	_, err = db.Exec(`
		INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, synced_at, privacy)
		VALUES 
			('PL1', 'Public Playlist', 'Desc 1', 5, 'https://example.com/1.jpg', '2026-01-01T00:00:00Z', 1000, 'public'),
			('PL2', 'Unlisted Playlist', 'Desc 2', 10, 'https://example.com/2.jpg', '2026-01-02T00:00:00Z', 1000, 'unlisted'),
			('PL3', 'Private Playlist', 'Desc 3', 0, 'https://example.com/3.jpg', '2026-01-03T00:00:00Z', 1000, 'private')
	`)
	if err != nil {
		t.Fatalf("Failed to insert test playlists: %v", err)
	}

	playlists, err := app.GetChannelPlaylists("recent")
	if err != nil {
		t.Fatalf("GetChannelPlaylists returned error: %v", err)
	}

	if len(playlists) != 3 {
		t.Fatalf("Expected 3 playlists, got %d", len(playlists))
	}

	privacyMap := make(map[string]string)
	for _, p := range playlists {
		privacyMap[p.ID] = p.Privacy
	}

	if privacyMap["PL1"] != "public" {
		t.Errorf("Expected PL1 privacy to be 'public', got %q", privacyMap["PL1"])
	}
	if privacyMap["PL2"] != "unlisted" {
		t.Errorf("Expected PL2 privacy to be 'unlisted', got %q", privacyMap["PL2"])
	}
	if privacyMap["PL3"] != "private" {
		t.Errorf("Expected PL3 privacy to be 'private', got %q", privacyMap["PL3"])
	}
}

func TestUpdatePlaylistVisibility_ValidationAndAuthCheck(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	// Test invalid privacy status returns error immediately before auth check
	err := app.UpdatePlaylistVisibility("PL1", "invalid_status")
	if err == nil {
		t.Errorf("Expected error for invalid privacy status, got nil")
	}

	_, err = app.UpdatePlaylistsVisibility([]string{"PL1", "PL2"}, "invalid_status")
	if err == nil {
		t.Errorf("Expected error for invalid bulk privacy status, got nil")
	}

	// Test unauthenticated app returns "not authenticated" error on valid status
	err = app.UpdatePlaylistVisibility("PL1", "private")
	if err == nil {
		t.Errorf("Expected error when updating playlist without auth, got nil")
	}
}

