package backend_test

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetSteamAppID_Empty(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	if err := app.InitTestDB(dbPath); err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	if id := app.GetSteamAppID(""); id != "" {
		t.Errorf("Expected empty string for empty game name, got %q", id)
	}

	if id := app.GetSteamAppID("   "); id != "" {
		t.Errorf("Expected empty string for whitespace game name, got %q", id)
	}
}

func TestGetSteamAppID_LocalLibraryExact(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	if err := app.InitTestDB(dbPath); err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()
	_, err := db.Exec(`
		INSERT INTO steam_games (appid, name, playtime_forever, playtime_2weeks, header_url)
		VALUES (3349920, 'VHOLUME', 120, 0, 'https://example.com/header.jpg')
	`)
	if err != nil {
		t.Fatalf("Failed to insert test game: %v", err)
	}

	id := app.GetSteamAppID("VHOLUME")
	if id != "3349920" {
		t.Fatalf("Expected AppID '3349920', got %q", id)
	}

	// Verify that result was written to steam_app_cache
	var cachedID string
	err = db.QueryRow(`SELECT app_id FROM steam_app_cache WHERE game_name = ?`, "VHOLUME").Scan(&cachedID)
	if err != nil {
		t.Fatalf("Failed to query steam_app_cache: %v", err)
	}
	if cachedID != "3349920" {
		t.Errorf("Expected cached AppID '3349920', got %q", cachedID)
	}
}

func TestGetSteamAppID_LocalLibraryCaseAndSpacing(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	if err := app.InitTestDB(dbPath); err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()
	_, err := db.Exec(`
		INSERT INTO steam_games (appid, name, playtime_forever, playtime_2weeks, header_url)
		VALUES (3349920, 'VHOLUME', 120, 0, 'https://example.com/header.jpg')
	`)
	if err != nil {
		t.Fatalf("Failed to insert test game: %v", err)
	}

	testCases := []string{
		"vholume",
		"  VHOLUME  ",
		"Vholume",
	}

	for _, tc := range testCases {
		id := app.GetSteamAppID(tc)
		if id != "3349920" {
			t.Errorf("For input %q, expected '3349920', got %q", tc, id)
		}
	}
}

func TestGetSteamAppID_LocalLibraryNormalized(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	if err := app.InitTestDB(dbPath); err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()
	_, err := db.Exec(`
		INSERT INTO steam_games (appid, name, playtime_forever, playtime_2weeks, header_url)
		VALUES 
			(3349920, 'VHOLUME', 120, 0, 'https://example.com/header.jpg'),
			(292030, 'The Witcher 3: Wild Hunt', 3000, 0, 'https://example.com/witcher.jpg'),
			(1091500, 'Cyberpunk 2077®', 5000, 0, 'https://example.com/cyberpunk.jpg')
	`)
	if err != nil {
		t.Fatalf("Failed to insert test games: %v", err)
	}

	testCases := []struct {
		input      string
		expectedID string
	}{
		{"VHOLUME™", "3349920"},
		{"The Witcher 3 - Wild Hunt", "292030"},
		{"The Witcher 3 Wild Hunt", "292030"},
		{"Cyberpunk 2077", "1091500"},
	}

	for _, tc := range testCases {
		id := app.GetSteamAppID(tc.input)
		if id != tc.expectedID {
			t.Errorf("For input %q, expected %q, got %q", tc.input, tc.expectedID, id)
		}
	}
}

func TestGetSteamAppID_OverwritesStaleNotFoundCache(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	if err := app.InitTestDB(dbPath); err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()

	// Simulate previously cached NOT_FOUND
	_, err := db.Exec(`
		INSERT INTO steam_app_cache (game_name, app_id)
		VALUES ('VHOLUME', 'NOT_FOUND')
	`)
	if err != nil {
		t.Fatalf("Failed to insert stale cache: %v", err)
	}

	// Now user syncs steam library and VHOLUME is in steam_games
	_, err = db.Exec(`
		INSERT INTO steam_games (appid, name, playtime_forever, playtime_2weeks, header_url)
		VALUES (3349920, 'VHOLUME', 120, 0, 'https://example.com/header.jpg')
	`)
	if err != nil {
		t.Fatalf("Failed to insert game into steam_games: %v", err)
	}

	// Calling GetSteamAppID should heal/overwrite the stale NOT_FOUND
	id := app.GetSteamAppID("VHOLUME")
	if id != "3349920" {
		t.Fatalf("Expected AppID '3349920', got %q", id)
	}

	var cachedID string
	err = db.QueryRow(`SELECT app_id FROM steam_app_cache WHERE game_name = ?`, "VHOLUME").Scan(&cachedID)
	if err != nil {
		t.Fatalf("Failed to query steam_app_cache: %v", err)
	}
	if cachedID != "3349920" {
		t.Errorf("Expected cache to be updated to '3349920', got %q", cachedID)
	}
}

func TestGetSteamAppID_HitsCache(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	if err := app.InitTestDB(dbPath); err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()
	_, err := db.Exec(`
		INSERT INTO steam_app_cache (game_name, app_id)
		VALUES ('Portal 2', '620')
	`)
	if err != nil {
		t.Fatalf("Failed to insert cache: %v", err)
	}

	id := app.GetSteamAppID("Portal 2")
	if id != "620" {
		t.Fatalf("Expected AppID '620' from cache, got %q", id)
	}
}

func TestGetSteamGameAchievementPct(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	if err := app.InitTestDB(dbPath); err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()
	_, err := db.Exec(`
		INSERT INTO steam_achievements (appid, total_achievements, achieved, progress_percent)
		VALUES (3349920, 10, 8, 80.0)
	`)
	if err != nil {
		t.Fatalf("Failed to insert steam_achievements: %v", err)
	}

	pct := app.GetSteamGameAchievementPct("3349920")
	if pct != 80.0 {
		t.Errorf("Expected achievement pct 80.0, got %f", pct)
	}

	// Check invalid/empty app ID
	if p := app.GetSteamGameAchievementPct(""); p != 0 {
		t.Errorf("Expected 0 for empty app ID, got %f", p)
	}
	if p := app.GetSteamGameAchievementPct("NOT_FOUND"); p != 0 {
		t.Errorf("Expected 0 for NOT_FOUND app ID, got %f", p)
	}
}

func TestGetSteamGameAssets_Empty(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	assets := app.GetSteamGameAssets("")
	if assets.HeroURL != "" || assets.PosterURL != "" || assets.HeaderURL != "" {
		t.Errorf("Expected empty assets for empty app ID, got %+v", assets)
	}

	assets = app.GetSteamGameAssets("NOT_FOUND")
	if assets.HeroURL != "" || assets.PosterURL != "" || assets.HeaderURL != "" {
		t.Errorf("Expected empty assets for NOT_FOUND app ID, got %+v", assets)
	}
}

func TestGetSteamGameAssets_DefaultAndHashed(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	// Fallback/standard CDN test for known app ID
	assets := app.GetSteamGameAssets("620")
	if assets.HeroURL == "" || assets.PosterURL == "" || assets.HeaderURL == "" {
		t.Errorf("Expected non-empty default asset URLs for app ID 620, got %+v", assets)
	}
}

