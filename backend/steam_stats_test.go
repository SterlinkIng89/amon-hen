package backend

import (
	"reflect"
	"testing"
)

func TestSplitSteamCompanies(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "Single company with corporate suffix",
			input:    "FromSoftware, Inc.",
			expected: []string{"FromSoftware, Inc."},
		},
		{
			name:     "Multiple companies with suffixes and simple names",
			input:    "FromSoftware, Inc., Bandai Namco Entertainment, Valve",
			expected: []string{"FromSoftware, Inc.", "Bandai Namco Entertainment", "Valve"},
		},
		{
			name:     "Multiple companies with Ltd. and LLC",
			input:    "Feral Interactive (Mac), CREATIVE ASSEMBLY, Sega Europe Ltd.",
			expected: []string{"Feral Interactive (Mac)", "CREATIVE ASSEMBLY", "Sega Europe Ltd."},
		},
		{
			name:     "Company with GmbH and Co. KG",
			input:    "Daedalic Entertainment GmbH, Ravenscourt",
			expected: []string{"Daedalic Entertainment GmbH", "Ravenscourt"},
		},
		{
			name:     "Company with Interactive Entertainment suffix",
			input:    "Sony, Interactive Entertainment, Guerrilla Games",
			expected: []string{"Sony Interactive Entertainment", "Guerrilla Games"},
		},
		{
			name:     "Empty and whitespace only string",
			input:    "  ,  ",
			expected: []string{},
		},
		{
			name:     "Never emit standalone suffix as company",
			input:    "Inc., Ltd., LLC",
			expected: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := splitSteamCompanies(tt.input)
			if len(result) == 0 && len(tt.expected) == 0 {
				return
			}
			if !reflect.DeepEqual(result, tt.expected) {
				t.Errorf("splitSteamCompanies(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestIsSteamStoreFeature(t *testing.T) {
	featureTests := []struct {
		tag      string
		expected bool
	}{
		{"Steam Cloud", true},
		{"Steam Achievements", true},
		{"Steam Trading Cards", true},
		{"Family Sharing", true},
		{"Full controller support", true},
		{"Partial Controller Support", true},
		{"Single-player", true},
		{"Multi-player", true},
		{"Co-op", true},
		{"Online Co-op", true},
		{"Online PvP", true},
		{"Shared/Split Screen", true},
		{"Custom Volume Controls", true},
		{"Playable without Timed Input", true},
		{"HDR available", true},
		{"VR Supported", true},
		// Actual game genres should return false
		{"Action", false},
		{"RPG", false},
		{"Indie", false},
		{"Strategy", false},
		{"Adventure", false},
		{"Simulation", false},
		{"Casual", false},
		{"Cyberpunk", false},
		{"Open World", false},
	}

	for _, tt := range featureTests {
		t.Run(tt.tag, func(t *testing.T) {
			got := isSteamStoreFeature(tt.tag)
			if got != tt.expected {
				t.Errorf("isSteamStoreFeature(%q) = %v, want %v", tt.tag, got, tt.expected)
			}
		})
	}
}

func TestIsSteamUtilityApp(t *testing.T) {
	tests := []struct {
		appID    int
		name     string
		expected bool
	}{
		{431960, "Wallpaper Engine", true},
		{629520, "Soundpad", true},
		{993090, "Lossless Scaling", true},
		{223850, "3DMark", true},
		{1905180, "OBS Studio", true},
		{365670, "Blender", true},
		{1366800, "Crosshair X", true},
		{400040, "ShareX", true},
		{250820, "SteamVR", true},
		// By name
		{999999, "Wallpaper Engine", true},
		{999998, "Lossless Scaling v2", true},
		// Normal games should return false
		{1091500, "Cyberpunk 2077", false},
		{1145360, "Hades", false},
		{1245620, "ELDEN RING", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isSteamUtilityApp(tt.appID, tt.name)
			if got != tt.expected {
				t.Errorf("isSteamUtilityApp(%d, %q) = %v, want %v", tt.appID, tt.name, got, tt.expected)
			}
		})
	}
}

func TestSteamStatsQueries(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// 1. Insert test games
	// Game 1: Elden Ring (AppID 1245620) - 120 hours (7200 mins), dev: "FromSoftware, Inc.", pub: "Bandai Namco, FromSoftware, Inc."
	// Game 2: Armored Core VI (AppID 1888160) - 0 hours (0 mins, unplayed), dev: "FromSoftware, Inc.", pub: "Bandai Namco"
	// Game 3: Cyberpunk 2077 (AppID 1091500) - 50 hours (3000 mins), dev: "CD PROJEKT RED", pub: "CD PROJEKT RED"
	// Game 4: Wallpaper Engine (AppID 431960) - 500 hours (30000 mins utility), dev: "Wallpaper Engine Team", pub: "Wallpaper Engine Team"
	_, err := app.db.conn.Exec(`
		INSERT INTO steam_games (appid, name, playtime_forever, playtime_2weeks, header_url)
		VALUES 
			(1245620, 'ELDEN RING', 7200, 0, 'http://header/1245620.jpg'),
			(1888160, 'ARMORED CORE VI', 0, 0, 'http://header/1888160.jpg'),
			(1091500, 'Cyberpunk 2077', 3000, 0, 'http://header/1091500.jpg'),
			(431960, 'Wallpaper Engine', 30000, 0, 'http://header/431960.jpg');
	`)
	if err != nil {
		t.Fatalf("failed to insert steam_games: %v", err)
	}

	// 2. Insert game details with multi-studios and corporate suffixes
	_, err = app.db.conn.Exec(`
		INSERT INTO steam_game_details (appid, developers, publishers, synced_at)
		VALUES 
			(1245620, 'FromSoftware, Inc.', 'Bandai Namco Entertainment, FromSoftware, Inc.', 1700000000),
			(1888160, 'FromSoftware, Inc.', 'Bandai Namco Entertainment', 1700000000),
			(1091500, 'CD PROJEKT RED', 'CD PROJEKT RED', 1700000000),
			(431960, 'Wallpaper Engine Team', 'Wallpaper Engine Team', 1700000000);
	`)
	if err != nil {
		t.Fatalf("failed to insert steam_game_details: %v", err)
	}

	// 3. Insert tags (both genres and store features)
	_, err = app.db.conn.Exec(`
		INSERT INTO steam_tags (appid, tag)
		VALUES 
			(1245620, 'RPG'),
			(1245620, 'Steam Cloud'),
			(1245620, 'Action'),
			(1091500, 'RPG'),
			(1091500, 'Steam Cloud'),
			(431960, 'Utilities'),
			(431960, 'Steam Workshop');
	`)
	if err != nil {
		t.Fatalf("failed to insert steam_tags: %v", err)
	}

	// 4. Test Developer Stats
	devStats, err := app.GetSteamDeveloperStats("hours")
	if err != nil {
		t.Fatalf("GetSteamDeveloperStats failed: %v", err)
	}

	// Utility app "Wallpaper Engine Team" MUST be excluded
	for _, dev := range devStats {
		if dev.Name == "Wallpaper Engine Team" {
			t.Errorf("expected utility app developer 'Wallpaper Engine Team' to be filtered out, but was present")
		}
		if dev.Name == "Inc." || dev.Name == "Ltd." {
			t.Errorf("bogus corporate suffix found as developer name: %s", dev.Name)
		}
	}

	// FromSoftware should be top with 120 hours, 2 games total, 1 played game, and 60.0 avg hours
	if len(devStats) < 2 {
		t.Fatalf("expected at least 2 developers, got %d", len(devStats))
	}
	topDev := devStats[0]
	if topDev.Name != "FromSoftware, Inc." {
		t.Errorf("expected top developer to be 'FromSoftware, Inc.', got %q", topDev.Name)
	}
	if topDev.TotalHours != 120 {
		t.Errorf("expected FromSoftware hours to be 120, got %d", topDev.TotalHours)
	}
	if topDev.GamesCount != 2 {
		t.Errorf("expected FromSoftware games count to be 2, got %d", topDev.GamesCount)
	}
	if topDev.PlayedCount != 1 {
		t.Errorf("expected FromSoftware played count to be 1, got %d", topDev.PlayedCount)
	}
	if topDev.AvgHours != 60.0 {
		t.Errorf("expected FromSoftware avg hours to be 60.0, got %f", topDev.AvgHours)
	}

	// Test Developer Stats sorting by avg
	devStatsAvg, err := app.GetSteamDeveloperStats("avg")
	if err != nil {
		t.Fatalf("GetSteamDeveloperStats('avg') failed: %v", err)
	}
	if devStatsAvg[0].Name != "FromSoftware, Inc." {
		t.Errorf("expected 'FromSoftware, Inc.' (60.0 avg) top for avg sort, got %q", devStatsAvg[0].Name)
	}

	// 5. Test Publisher Stats
	pubStats, err := app.GetSteamPublisherStats("hours")
	if err != nil {
		t.Fatalf("GetSteamPublisherStats failed: %v", err)
	}
	for _, pub := range pubStats {
		if pub.Name == "Wallpaper Engine Team" {
			t.Errorf("expected utility publisher to be filtered out, but was present")
		}
		if pub.Name == "Inc." || pub.Name == "Ltd." {
			t.Errorf("bogus corporate suffix found as publisher: %s", pub.Name)
		}
	}

	// 6. Test Tag Stats and Category Classification
	tagStats, err := app.GetSteamTagStats("hours")
	if err != nil {
		t.Fatalf("GetSteamTagStats failed: %v", err)
	}
	for _, tag := range tagStats {
		if tag.Tag == "Utilities" || tag.Tag == "Steam Workshop" {
			t.Errorf("expected utility app tags to be excluded, but got: %s", tag.Tag)
		}
		if tag.Tag == "Steam Cloud" && tag.Category != "feature" {
			t.Errorf("expected 'Steam Cloud' category to be 'feature', got %q", tag.Category)
		}
		if tag.Tag == "RPG" && tag.Category != "genre" {
			t.Errorf("expected 'RPG' category to be 'genre', got %q", tag.Category)
		}
	}

	// 7. Test GetSteamGamesByDeveloper
	games, err := app.GetSteamGamesByDeveloper("FromSoftware, Inc.")
	if err != nil {
		t.Fatalf("GetSteamGamesByDeveloper failed: %v", err)
	}
	if len(games) != 2 {
		t.Errorf("expected 2 games for FromSoftware, got %d", len(games))
	}
}

