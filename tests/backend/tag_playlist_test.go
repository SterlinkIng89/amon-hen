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

func TestTagPlaylistConfigAndRouting(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	// Test SetTagPlaylistConfig
	err := app.SetTagPlaylistConfig("Overwatch", "PL_VOD_OW", "PL_CLIP_OW")
	if err != nil {
		t.Fatalf("SetTagPlaylistConfig failed: %v", err)
	}

	cfg := app.GetTagPlaylistConfig("Overwatch")
	if cfg.VodPlaylistID != "PL_VOD_OW" {
		t.Errorf("Expected VodPlaylistID PL_VOD_OW, got %v", cfg.VodPlaylistID)
	}
	if cfg.ClipPlaylistID != "PL_CLIP_OW" {
		t.Errorf("Expected ClipPlaylistID PL_CLIP_OW, got %v", cfg.ClipPlaylistID)
	}

	// Verify legacy TagPlaylists map has the VOD playlist
	fullCfg := app.LoadConfig()
	if fullCfg.TagPlaylists["Overwatch"] != "PL_VOD_OW" {
		t.Errorf("Expected TagPlaylists['Overwatch'] to be PL_VOD_OW, got %v", fullCfg.TagPlaylists["Overwatch"])
	}

	// Test SetVideoContentType and SetVideosContentType
	testPath1 := filepath.Join(tempDir, "clip1.mp4")
	testPath2 := filepath.Join(tempDir, "vod1.mp4")
	_ = os.WriteFile(testPath1, []byte("fake video content"), 0644)
	_ = os.WriteFile(testPath2, []byte("fake video content"), 0644)

	// Set video games
	err = app.SetVideoGames([]string{testPath1, testPath2}, "Overwatch", "", "", nil)
	if err != nil {
		t.Fatalf("SetVideoGames failed: %v", err)
	}

	// Force testPath1 to clip
	err = app.SetVideoContentType(testPath1, "clip")
	if err != nil {
		t.Fatalf("SetVideoContentType failed: %v", err)
	}

	// Force testPath2 to vod
	err = app.SetVideoContentType(testPath2, "vod")
	if err != nil {
		t.Fatalf("SetVideoContentType failed: %v", err)
	}

	cfgUpdated := app.LoadConfig()
	meta1 := cfgUpdated.VideoMetadata[testPath1]
	meta2 := cfgUpdated.VideoMetadata[testPath2]

	if meta1.ContentType != "clip" {
		t.Errorf("Expected testPath1 contentType to be 'clip', got %v", meta1.ContentType)
	}
	if meta1.PlaylistID != "PL_CLIP_OW" {
		t.Errorf("Expected testPath1 playlist to be 'PL_CLIP_OW', got %v", meta1.PlaylistID)
	}

	if meta2.ContentType != "vod" {
		t.Errorf("Expected testPath2 contentType to be 'vod', got %v", meta2.ContentType)
	}
	if meta2.PlaylistID != "PL_VOD_OW" {
		t.Errorf("Expected testPath2 playlist to be 'PL_VOD_OW', got %v", meta2.PlaylistID)
	}

	// Test SetVideosContentType in bulk
	err = app.SetVideosContentType([]string{testPath1, testPath2}, "vod")
	if err != nil {
		t.Fatalf("SetVideosContentType failed: %v", err)
	}
	cfgBulk := app.LoadConfig()
	if cfgBulk.VideoMetadata[testPath1].ContentType != "vod" || cfgBulk.VideoMetadata[testPath1].PlaylistID != "PL_VOD_OW" {
		t.Errorf("Bulk set failed for testPath1: %+v", cfgBulk.VideoMetadata[testPath1])
	}
}

func TestGetVideosFromFolders_ClipRoutingAndTitles(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	_ = app.InitTestDB(dbPath)

	_ = app.SetTagPlaylistConfig("Halo", "PL_VOD_HALO", "PL_CLIP_HALO")

	// Create 2 test videos: one clip (<120s duration in meta), one VOD (>=120s duration in meta)
	clipFile := filepath.Join(tempDir, "2026-09-29_MyClip.mp4")
	vodFile := filepath.Join(tempDir, "2026-09-29_LongMatch.mp4")
	_ = os.WriteFile(clipFile, []byte("clip data"), 0644)
	_ = os.WriteFile(vodFile, []byte("vod data"), 0644)

	// Save metadata with duration: clip=45s, vod=600s
	_ = app.SaveVideoMetadata(clipFile, "Halo", "", "", "unlisted", "", 0, "Triple Kill", "", nil)
	_ = app.SaveVideoMetadata(vodFile, "Halo", "", "", "unlisted", "", 0, "", "", nil)

	// Set duration in metadata directly via SetVideoContentType or SaveVideoMetadata
	// Let's force duration via config
	_ = app.SetVideoContentType(clipFile, "clip")
	_ = app.SetVideoContentType(vodFile, "vod")

	videos, err := app.GetVideosFromFolders([]string{tempDir})
	if err != nil {
		t.Fatalf("GetVideosFromFolders failed: %v", err)
	}

	if len(videos) != 2 {
		t.Fatalf("Expected 2 videos, got %d", len(videos))
	}

	for _, v := range videos {
		if filepath.Base(v.Path) == filepath.Base(clipFile) {
			if v.ContentType != "clip" {
				t.Errorf("Expected clipFile to have contentType 'clip', got %s", v.ContentType)
			}
			if v.Episode != 0 {
				t.Errorf("Expected clipFile to have episode 0, got %d", v.Episode)
			}
			if v.PlaylistID != "PL_CLIP_HALO" {
				t.Errorf("Expected clipFile to route to PL_CLIP_HALO, got %s", v.PlaylistID)
			}
			if v.YouTubeTitle != "Halo - 29/09/26 - Triple Kill" {
				t.Errorf("Expected clip title 'Halo - 29/09/26 - Triple Kill', got '%s'", v.YouTubeTitle)
			}
		} else if filepath.Base(v.Path) == filepath.Base(vodFile) {
			if v.ContentType != "vod" {
				t.Errorf("Expected vodFile to have contentType 'vod', got %s", v.ContentType)
			}
			if v.Episode != 1 {
				t.Errorf("Expected vodFile to have episode 1, got %d", v.Episode)
			}
			if v.PlaylistID != "PL_VOD_HALO" {
				t.Errorf("Expected vodFile to route to PL_VOD_HALO, got %s", v.PlaylistID)
			}
			if v.YouTubeTitle != "Halo - 29/09/26 - 1" {
				t.Errorf("Expected vod title 'Halo - 29/09/26 - 1', got '%s'", v.YouTubeTitle)
			}
		}
	}
}
