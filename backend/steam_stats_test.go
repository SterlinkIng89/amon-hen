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

func TestParseDurationToHours(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected float64
	}{
		{"ISO 8601 with H, M, S", "PT1H30M0S", 1.5},
		{"ISO 8601 with M only", "PT45M", 0.75},
		{"ISO 8601 with S only", "PT3600S", 1.0},
		{"HH:MM:SS format", "01:30:00", 1.5},
		{"MM:SS format", "45:00", 0.75},
		{"Raw seconds string", "3600", 1.0},
		{"Empty string", "", 0.0},
		{"Malformed string", "not_a_duration", 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseDurationToHours(tt.input)
			if diff := got - tt.expected; diff > 0.001 || diff < -0.001 {
				t.Errorf("parseDurationToHours(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSteamLibraryPulseAndEnrichedGames(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// 1. Insert games (total 6: 5 games + 1 utility)
	_, err := app.db.conn.Exec(`
		INSERT INTO steam_games (appid, name, playtime_forever, playtime_2weeks, header_url)
		VALUES 
			(1245620, 'ELDEN RING', 7200, 0, 'http://header/1245620.jpg'),
			(1888160, 'ARMORED CORE VI', 0, 0, 'http://header/1888160.jpg'),
			(1091500, 'Cyberpunk 2077', 3000, 0, 'http://header/1091500.jpg'),
			(1145360, 'Hades', 600, 0, 'http://header/1145360.jpg'),
			(2379780, 'Balatro', 60, 0, 'http://header/2379780.jpg'),
			(431960, 'Wallpaper Engine', 30000, 0, 'http://header/431960.jpg');
	`)
	if err != nil {
		t.Fatalf("failed to insert steam_games: %v", err)
	}

	// 2. Insert game details and tags
	_, err = app.db.conn.Exec(`
		INSERT INTO steam_game_details (appid, developers, publishers, synced_at)
		VALUES 
			(1245620, 'FromSoftware, Inc.', 'Bandai Namco Entertainment', 1700000000),
			(1888160, 'FromSoftware, Inc.', 'Bandai Namco Entertainment', 1700000000),
			(1091500, 'CD PROJEKT RED', 'CD PROJEKT RED', 1700000000),
			(1145360, 'Supergiant Games', 'Supergiant Games', 1700000000),
			(2379780, 'LocalThunk', 'Playstack', 1700000000),
			(431960, 'Wallpaper Engine Team', 'Wallpaper Engine Team', 1700000000);
	`)
	if err != nil {
		t.Fatalf("failed to insert steam_game_details: %v", err)
	}

	_, err = app.db.conn.Exec(`
		INSERT INTO steam_tags (appid, tag)
		VALUES 
			(1245620, 'Action RPG'),
			(1245620, 'Steam Cloud'),
			(1091500, 'Cyberpunk'),
			(1091500, 'Open World');
	`)
	if err != nil {
		t.Fatalf("failed to insert steam_tags: %v", err)
	}

	// 3. Insert achievements
	// Elden Ring: 42/42 (100% perfect)
	// Cyberpunk: 32/40 (80% almost there)
	// Hades: 10/50 (20%)
	_, err = app.db.conn.Exec(`
		INSERT INTO steam_achievements (appid, total_achievements, achieved, progress_percent)
		VALUES 
			(1245620, 42, 42, 100.0),
			(1091500, 40, 32, 80.0),
			(1145360, 50, 10, 20.0);
	`)
	if err != nil {
		t.Fatalf("failed to insert steam_achievements: %v", err)
	}

	// 4. Insert YouTube videos
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, game_tag, duration, synced_at)
		VALUES 
			('vid1', 'ELDEN RING - Walkthrough Pt 1', 'ELDEN RING', 'PT1H0M0S', 1700000000),
			('vid2', 'Elden Ring - Exploration and Bosses', '', '01:30:00', 1700000000),
			('vid3', 'ARMORED CORE VI - First Mission', 'ARMORED CORE VI', '1800', 1700000000),
			('vid4', 'Random Unrelated Video', 'Minecraft', 'PT20M', 1700000000);
	`)
	if err != nil {
		t.Fatalf("failed to insert yt_videos: %v", err)
	}

	// 5. Test GetSteamLibraryPulse
	pulse, err := app.GetSteamLibraryPulse(true)
	if err != nil {
		t.Fatalf("GetSteamLibraryPulse failed: %v", err)
	}

	if pulse.TotalGames != 5 {
		t.Errorf("expected 5 total games, got %d", pulse.TotalGames)
	}
	expectedHours := (7200 + 0 + 3000 + 600 + 60) / 60 // 181
	if pulse.TotalHours != expectedHours {
		t.Errorf("expected %d total hours, got %d", expectedHours, pulse.TotalHours)
	}
	if pulse.UnplayedGames != 1 { // Armored Core VI (0m)
		t.Errorf("expected 1 unplayed game, got %d", pulse.UnplayedGames)
	}
	if pulse.TriedGames != 1 { // Balatro (60m: >0 and <120m)
		t.Errorf("expected 1 tried game, got %d", pulse.TriedGames)
	}
	if pulse.PlayedGames != 1 { // Hades (600m: 10h, >=2h and <50h)
		t.Errorf("expected 1 played game, got %d", pulse.PlayedGames)
	}
	if pulse.ObsessionGames != 2 { // Elden Ring (120h), Cyberpunk (50h)
		t.Errorf("expected 2 obsession games, got %d", pulse.ObsessionGames)
	}
	if pulse.Top10SharePct != 100.0 {
		t.Errorf("expected Top10SharePct to be 100.0%%, got %f", pulse.Top10SharePct)
	}
	if pulse.TotalAchievements != 132 {
		t.Errorf("expected 132 total achievements, got %d", pulse.TotalAchievements)
	}
	if pulse.UnlockedAchievements != 84 {
		t.Errorf("expected 84 unlocked achievements, got %d", pulse.UnlockedAchievements)
	}
	if pulse.PerfectGamesCount != 1 {
		t.Errorf("expected 1 perfect game, got %d", pulse.PerfectGamesCount)
	}
	if pulse.AlmostThereCount != 1 {
		t.Errorf("expected 1 almost there game, got %d", pulse.AlmostThereCount)
	}
	if pulse.RecordedGamesCount != 2 { // Elden Ring and Armored Core VI
		t.Errorf("expected 2 recorded games, got %d", pulse.RecordedGamesCount)
	}

	// 6. Test Backlog & Ratings persistence before Enriched Game List
	err = app.UpsertSteamBacklogItem(1245620, "playing", "Must finish DLC")
	if err != nil {
		t.Fatalf("UpsertSteamBacklogItem failed: %v", err)
	}
	err = app.UpsertSteamGameRating(1245620, "S", 10, "Masterpiece")
	if err != nil {
		t.Fatalf("UpsertSteamGameRating failed: %v", err)
	}

	// 7. Test GetEnrichedSteamGames
	enriched, err := app.GetEnrichedSteamGames(true)
	if err != nil {
		t.Fatalf("GetEnrichedSteamGames failed: %v", err)
	}
	if len(enriched) != 5 {
		t.Fatalf("expected 5 enriched games, got %d", len(enriched))
	}

	var eldenItem *EnrichedSteamGameItem
	for i := range enriched {
		if enriched[i].AppID == 1245620 {
			eldenItem = &enriched[i]
			break
		}
	}
	if eldenItem == nil {
		t.Fatalf("Elden Ring item not found in enriched games")
	}

	if eldenItem.PosterURL != "https://cdn.akamai.steamstatic.com/steam/apps/1245620/library_600x900_2x.jpg" {
		t.Errorf("unexpected PosterURL: %s", eldenItem.PosterURL)
	}
	if eldenItem.AchievementsPct != 100.0 {
		t.Errorf("expected 100.0%% achievements, got %f", eldenItem.AchievementsPct)
	}
	if eldenItem.Developers != "FromSoftware, Inc." {
		t.Errorf("unexpected developers: %s", eldenItem.Developers)
	}
	if eldenItem.Publishers != "Bandai Namco Entertainment" {
		t.Errorf("unexpected publishers: %s", eldenItem.Publishers)
	}
	// "Steam Cloud" should be filtered out from genres
	if eldenItem.Genres != "Action RPG" {
		t.Errorf("expected genres 'Action RPG', got %q", eldenItem.Genres)
	}
	if eldenItem.YTVideosCount != 2 {
		t.Errorf("expected 2 YT videos for Elden Ring, got %d", eldenItem.YTVideosCount)
	}
	if eldenItem.YTRecordedHours != 2.5 {
		t.Errorf("expected 2.5 recorded hours, got %f", eldenItem.YTRecordedHours)
	}
	if eldenItem.BacklogStatus != "playing" {
		t.Errorf("expected backlog status 'playing', got %s", eldenItem.BacklogStatus)
	}
	if eldenItem.BacklogRank != 1 {
		t.Errorf("expected backlog rank 1, got %d", eldenItem.BacklogRank)
	}
	if eldenItem.BacklogNotes != "Must finish DLC" {
		t.Errorf("unexpected backlog notes: %s", eldenItem.BacklogNotes)
	}
	if eldenItem.PersonalTier != "S" {
		t.Errorf("expected personal tier 'S', got %s", eldenItem.PersonalTier)
	}
	if eldenItem.PersonalScore != 10 {
		t.Errorf("expected personal score 10, got %d", eldenItem.PersonalScore)
	}
	if eldenItem.PersonalNotes != "Masterpiece" {
		t.Errorf("unexpected personal notes: %s", eldenItem.PersonalNotes)
	}
}


