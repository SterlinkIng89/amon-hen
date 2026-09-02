package backend_test

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTagPlaylistRetroactiveUpdate(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	err := app.InitTestDB(dbPath)
	if err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()

	// Insert test videos with tags
	_, err = db.Exec(`
		INSERT INTO yt_videos (id, title, game_tag, synced_at)
		VALUES 
			('V1', 'Video 1', 'GameA', 1000),
			('V2', 'Video 2', 'GameB', 1000),
			('V3', 'Video 3', 'GameA', 1000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert test videos: %v", err)
	}

	// 1. Test GetAllGameTags
	tags, err := app.GetAllGameTags()
	if err != nil {
		t.Fatalf("GetAllGameTags error: %v", err)
	}

	foundGameA := false
	foundGameB := false
	for _, tag := range tags {
		if tag == "GameA" {
			foundGameA = true
		}
		if tag == "GameB" {
			foundGameB = true
		}
	}
	if !foundGameA || !foundGameB {
		t.Errorf("Expected GameA and GameB in tags, got: %v", tags)
	}

	// 2. Test SetTagPlaylist (retroactive update)
	err = app.SetTagPlaylist("GameA", "PL_TEST_A")
	if err != nil {
		t.Logf("SetTagPlaylist returned error (expected if no auth): %v", err)
	}

	// Verify config was updated
	cfg := app.LoadConfig()
	if cfg.TagPlaylists["GameA"] != "PL_TEST_A" {
		t.Errorf("Expected config TagPlaylists['GameA'] to be PL_TEST_A, got %v", cfg.TagPlaylists["GameA"])
	}
}
