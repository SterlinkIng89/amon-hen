package backend

import (
	"database/sql"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type SteamGameItem struct {
	AppID           int     `json:"appid"`
	Name            string  `json:"name"`
	PlaytimeHours   float64 `json:"playtimeHours"`
	PlaytimeForever int     `json:"playtimeForever"` // in minutes
	Playtime2Weeks  int     `json:"playtime2Weeks"`  // in minutes
	HeaderURL       string  `json:"headerUrl"`
	AchievementsPct float64 `json:"achievementsPct"`
}

type SteamDevPubStats struct {
	Name        string  `json:"name"`
	TotalHours  int     `json:"totalHours"`
	GamesCount  int     `json:"gamesCount"`
	PlayedCount int     `json:"playedCount"`
	AvgHours    float64 `json:"avgHours"`
}

type SteamTagStats struct {
	Tag        string  `json:"tag"`
	Category   string  `json:"category"` // "genre" | "feature"
	TotalHours int     `json:"totalHours"`
	GamesCount int     `json:"gamesCount"`
	AvgHours   float64 `json:"avgHours"`
}

type SteamOverallStats struct {
	TotalGames           int `json:"totalGames"`
	TotalHours           int `json:"totalHours"`
	TotalAchievements    int `json:"totalAchievements"`
	UnlockedAchievements int `json:"unlockedAchievements"`
}

type SteamLibraryPulse struct {
	TotalGames           int     `json:"totalGames"`
	TotalHours           int     `json:"totalHours"`
	UnplayedGames        int     `json:"unplayedGames"`
	TriedGames           int     `json:"triedGames"`     // >0m and <120m
	PlayedGames          int     `json:"playedGames"`    // >=120m and <3000m (2h..50h)
	ObsessionGames       int     `json:"obsessionGames"` // >=3000m (50h+)
	Top10SharePct        float64 `json:"top10SharePct"`
	TotalAchievements    int     `json:"totalAchievements"`
	UnlockedAchievements int     `json:"unlockedAchievements"`
	PerfectGamesCount    int     `json:"perfectGamesCount"`
	AlmostThereCount     int     `json:"almostThereCount"`
	RecordedGamesCount   int     `json:"recordedGamesCount"`
}

type EnrichedSteamGameItem struct {
	AppID           int     `json:"appid"`
	Name            string  `json:"name"`
	PlaytimeHours   float64 `json:"playtimeHours"`
	PlaytimeForever int     `json:"playtimeForever"`
	Playtime2Weeks  int     `json:"playtime2Weeks"`
	HeaderURL       string  `json:"headerUrl"`
	PosterURL       string  `json:"posterUrl"`
	AchievementsPct float64 `json:"achievementsPct"`
	Developers      string  `json:"developers"`
	Publishers      string  `json:"publishers"`
	Genres          string  `json:"genres"`
	IsUtility       bool    `json:"isUtility"`
	YTVideosCount   int     `json:"ytVideosCount"`
	YTRecordedHours float64 `json:"ytRecordedHours"`
	BacklogStatus   string  `json:"backlogStatus,omitempty"`
	BacklogRank     int     `json:"backlogRank,omitempty"`
	BacklogNotes    string  `json:"backlogNotes,omitempty"`
	PersonalTier    string  `json:"personalTier,omitempty"`
	PersonalScore   int     `json:"personalScore,omitempty"`
	PersonalNotes   string  `json:"personalNotes,omitempty"`
}

func utilityAppIDsFilter() string {
	ids := steamUtilityAppIDs()
	if len(ids) == 0 {
		return "0"
	}
	strIDs := make([]string, len(ids))
	for i, id := range ids {
		strIDs[i] = strconv.Itoa(id)
	}
	return strings.Join(strIDs, ",")
}

func resolveStatsOrderClause(sortBy string) string {
	switch sortBy {
	case "games":
		return "games_count DESC, total_hours DESC"
	case "avg":
		return "avg_hours DESC, total_hours DESC"
	default:
		return "total_hours DESC"
	}
}

func scanSteamGameItems(rows *sql.Rows) []SteamGameItem {
	var items []SteamGameItem
	for rows.Next() {
		var item SteamGameItem
		if err := rows.Scan(&item.AppID, &item.Name, &item.PlaytimeForever, &item.Playtime2Weeks, &item.HeaderURL, &item.AchievementsPct); err == nil {
			item.PlaytimeHours = float64(item.PlaytimeForever) / 60.0
			items = append(items, item)
		}
	}
	return items
}

// GetSteamDeveloperStats returns the top developers
func (a *App) GetSteamDeveloperStats(sortBy string) ([]SteamDevPubStats, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	// Check if steam_developers is empty, and backfill if necessary
	var count int
	_ = a.db.conn.QueryRow("SELECT COUNT(*) FROM steam_developers").Scan(&count)
	if count == 0 {
		dRows, err := a.db.conn.Query("SELECT appid, developers FROM steam_game_details WHERE developers != ''")
		if err == nil {
			type backfillItem struct {
				appid int
				devs  string
			}
			var items []backfillItem
			for dRows.Next() {
				var appid int
				var devs string
				if err := dRows.Scan(&appid, &devs); err == nil {
					items = append(items, backfillItem{appid: appid, devs: devs})
				}
			}
			dRows.Close()

			for _, item := range items {
				for _, d := range splitSteamCompanies(item.devs) {
					if d != "" {
						a.db.conn.Exec("INSERT OR IGNORE INTO steam_developers (appid, developer) VALUES (?, ?)", item.appid, d)
					}
				}
			}
		}
	}

	orderClause := resolveStatsOrderClause(sortBy)

	utilFilter := utilityAppIDsFilter()
	query := fmt.Sprintf(`
		SELECT 
			d.developer, 
			COALESCE(SUM(g.playtime_forever)/60, 0) as total_hours, 
			COUNT(DISTINCT g.appid) as games_count,
			COUNT(DISTINCT CASE WHEN g.playtime_forever > 0 THEN g.appid END) as played_count,
			COALESCE(ROUND(CAST(SUM(g.playtime_forever) AS REAL) / 60.0 / NULLIF(COUNT(DISTINCT g.appid), 0), 1), 0.0) as avg_hours
		FROM steam_developers d
		JOIN steam_games g ON d.appid = g.appid
		WHERE d.developer != '' AND g.appid NOT IN (%s)
		GROUP BY d.developer
		ORDER BY %s
	`, utilFilter, orderClause)

	rows, err := a.db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %v", err)
	}
	defer rows.Close()

	var stats []SteamDevPubStats
	for rows.Next() {
		var stat SteamDevPubStats
		if err := rows.Scan(&stat.Name, &stat.TotalHours, &stat.GamesCount, &stat.PlayedCount, &stat.AvgHours); err == nil {
			stats = append(stats, stat)
		}
	}
	return stats, nil
}

// GetSteamPublisherStats returns the top publishers
func (a *App) GetSteamPublisherStats(sortBy string) ([]SteamDevPubStats, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	// Check if steam_publishers is empty, and backfill if necessary
	var count int
	_ = a.db.conn.QueryRow("SELECT COUNT(*) FROM steam_publishers").Scan(&count)
	if count == 0 {
		pRows, err := a.db.conn.Query("SELECT appid, publishers FROM steam_game_details WHERE publishers != ''")
		if err == nil {
			type backfillItem struct {
				appid int
				pubs  string
			}
			var items []backfillItem
			for pRows.Next() {
				var appid int
				var pubs string
				if err := pRows.Scan(&appid, &pubs); err == nil {
					items = append(items, backfillItem{appid: appid, pubs: pubs})
				}
			}
			pRows.Close() // Close BEFORE inserting

			for _, item := range items {
				for _, p := range splitSteamCompanies(item.pubs) {
					if p != "" {
						a.db.conn.Exec("INSERT OR IGNORE INTO steam_publishers (appid, publisher) VALUES (?, ?)", item.appid, p)
					}
				}
			}
		}
	}

	orderClause := resolveStatsOrderClause(sortBy)

	utilFilter := utilityAppIDsFilter()
	query := fmt.Sprintf(`
		SELECT 
			p.publisher, 
			COALESCE(SUM(g.playtime_forever)/60, 0) as total_hours, 
			COUNT(DISTINCT g.appid) as games_count,
			COUNT(DISTINCT CASE WHEN g.playtime_forever > 0 THEN g.appid END) as played_count,
			COALESCE(ROUND(CAST(SUM(g.playtime_forever) AS REAL) / 60.0 / NULLIF(COUNT(DISTINCT g.appid), 0), 1), 0.0) as avg_hours
		FROM steam_publishers p
		JOIN steam_games g ON p.appid = g.appid
		WHERE p.publisher != '' AND g.appid NOT IN (%s)
		GROUP BY p.publisher
		ORDER BY %s
	`, utilFilter, orderClause)

	rows, err := a.db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %v", err)
	}
	defer rows.Close()

	var stats []SteamDevPubStats
	for rows.Next() {
		var stat SteamDevPubStats
		if err := rows.Scan(&stat.Name, &stat.TotalHours, &stat.GamesCount, &stat.PlayedCount, &stat.AvgHours); err == nil {
			stats = append(stats, stat)
		}
	}
	return stats, nil
}

// GetSteamTagStats returns the top tags/genres
func (a *App) GetSteamTagStats(sortBy string) ([]SteamTagStats, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	orderClause := resolveStatsOrderClause(sortBy)

	utilFilter := utilityAppIDsFilter()
	query := fmt.Sprintf(`
		SELECT 
			t.tag, 
			COALESCE(SUM(g.playtime_forever)/60, 0) as total_hours, 
			COUNT(DISTINCT g.appid) as games_count,
			COALESCE(ROUND(CAST(SUM(g.playtime_forever) AS REAL) / 60.0 / NULLIF(COUNT(DISTINCT g.appid), 0), 1), 0.0) as avg_hours
		FROM steam_tags t
		JOIN steam_games g ON t.appid = g.appid
		WHERE g.appid NOT IN (%s)
		GROUP BY t.tag
		ORDER BY %s
	`, utilFilter, orderClause)

	rows, err := a.db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %v", err)
	}
	defer rows.Close()

	var stats []SteamTagStats
	for rows.Next() {
		var stat SteamTagStats
		if err := rows.Scan(&stat.Tag, &stat.TotalHours, &stat.GamesCount, &stat.AvgHours); err == nil {
			if isSteamStoreFeature(stat.Tag) {
				stat.Category = "feature"
			} else {
				stat.Category = "genre"
			}
			stats = append(stats, stat)
		}
	}
	return stats, nil
}

// GetSteamOverallStats returns summary statistics
func (a *App) GetSteamOverallStats() (SteamOverallStats, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	var stats SteamOverallStats
	
	// Total games and hours
	_ = a.db.conn.QueryRow(`
		SELECT COUNT(appid), COALESCE(SUM(playtime_forever)/60, 0)
		FROM steam_games
	`).Scan(&stats.TotalGames, &stats.TotalHours)

	// Total achievements
	_ = a.db.conn.QueryRow(`
		SELECT COALESCE(SUM(total_achievements), 0), COALESCE(SUM(achieved), 0)
		FROM steam_achievements
	`).Scan(&stats.TotalAchievements, &stats.UnlockedAchievements)

	return stats, nil
}

// GetSteamGamesByDeveloper returns all games by a specific developer
func (a *App) GetSteamGamesByDeveloper(dev string) ([]SteamGameItem, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`
		SELECT g.appid, g.name, g.playtime_forever, g.playtime_2weeks, g.header_url, COALESCE(ach.progress_percent, 0)
		FROM steam_games g
		JOIN steam_developers d ON g.appid = d.appid
		LEFT JOIN steam_achievements ach ON g.appid = ach.appid
		WHERE d.developer = ?
		ORDER BY g.playtime_forever DESC
	`, dev)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := scanSteamGameItems(rows)

	// Fallback to steam_game_details if no items found in steam_developers
	if len(items) == 0 {
		fbRows, fbErr := a.db.conn.Query(`
			SELECT g.appid, g.name, g.playtime_forever, g.playtime_2weeks, g.header_url, COALESCE(ach.progress_percent, 0)
			FROM steam_games g
			JOIN steam_game_details d ON g.appid = d.appid
			LEFT JOIN steam_achievements ach ON g.appid = ach.appid
			WHERE d.developers = ? OR d.developers LIKE ?
			ORDER BY g.playtime_forever DESC
		`, dev, "%"+dev+"%")
		if fbErr == nil {
			defer fbRows.Close()
			items = scanSteamGameItems(fbRows)
		}
	}

	return items, nil
}

// GetSteamGamesByPublisher returns all games by a specific publisher
func (a *App) GetSteamGamesByPublisher(pub string) ([]SteamGameItem, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`
		SELECT g.appid, g.name, g.playtime_forever, g.playtime_2weeks, g.header_url, COALESCE(ach.progress_percent, 0)
		FROM steam_games g
		JOIN steam_publishers p ON g.appid = p.appid
		LEFT JOIN steam_achievements ach ON g.appid = ach.appid
		WHERE p.publisher = ?
		ORDER BY g.playtime_forever DESC
	`, pub)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSteamGameItems(rows), nil
}

// GetSteamGamesByTag returns all games associated with a specific tag
func (a *App) GetSteamGamesByTag(tag string) ([]SteamGameItem, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`
		SELECT g.appid, g.name, g.playtime_forever, g.playtime_2weeks, g.header_url, COALESCE(ach.progress_percent, 0)
		FROM steam_games g
		JOIN steam_tags t ON g.appid = t.appid
		LEFT JOIN steam_achievements ach ON g.appid = ach.appid
		WHERE t.tag = ?
		ORDER BY g.playtime_forever DESC
	`, tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSteamGameItems(rows), nil
}

// Suffix list for corporate names
var steamCorporateSuffixes = map[string]bool{
	"inc.":                     true,
	"inc":                      true,
	"ltd.":                     true,
	"ltd":                      true,
	"llc":                      true,
	"l.l.c.":                   true,
	"s.a.":                     true,
	"s.a":                      true,
	"gmbh":                     true,
	"co.":                      true,
	"co":                       true,
	"corp.":                    true,
	"corp":                     true,
	"corporation":              true,
	"interactive entertainment": true,
}

// splitSteamCompanies parses comma-separated studio names while re-attaching corporate suffixes.
func splitSteamCompanies(raw string) []string {
	tokens := strings.Split(raw, ",")
	var result []string
	for _, tok := range tokens {
		t := strings.TrimSpace(tok)
		if t == "" {
			continue
		}
		lower := strings.ToLower(t)
		if steamCorporateSuffixes[lower] {
			if len(result) > 0 {
				if lower == "interactive entertainment" {
					result[len(result)-1] = result[len(result)-1] + " " + t
				} else {
					result[len(result)-1] = result[len(result)-1] + ", " + t
				}
			}
			// Standalone suffix without preceding company is ignored
			continue
		}
		result = append(result, t)
	}
	if result == nil {
		return []string{}
	}
	return result
}

// Known Steam store categories / platform features that are not game genres
var steamStoreFeatures = map[string]struct{}{
	"steam achievements":           {},
	"steam trading cards":          {},
	"steam cloud":                  {},
	"steam workshop":               {},
	"family sharing":               {},
	"full controller support":      {},
	"partial controller support":   {},
	"single-player":                {},
	"multi-player":                 {},
	"co-op":                        {},
	"online co-op":                 {},
	"online pvp":                   {},
	"shared/split screen":          {},
	"shared/split screen pvp":      {},
	"shared/split screen co-op":    {},
	"cross-platform multiplayer":   {},
	"in-app purchases":             {},
	"captions available":           {},
	"commentary available":         {},
	"stats":                        {},
	"steam leaderboards":           {},
	"remote play on phone":         {},
	"remote play on tablet":        {},
	"remote play on tv":            {},
	"remote play together":         {},
	"custom volume controls":       {},
	"playable without timed input": {},
	"save anytime":                 {},
	"stereo sound":                 {},
	"surround sound":               {},
	"subtitle options":             {},
	"hdr available":                {},
	"tracked controller support":   {},
	"vr only":                      {},
	"vr supported":                 {},
	"vr support":                   {},
	"includes level editor":        {},
	"lan co-op":                    {},
	"lan pvp":                      {},
	"mmo":                          {},
}

// isSteamStoreFeature returns true if the tag represents a store capability or hardware feature rather than a game genre.
func isSteamStoreFeature(tag string) bool {
	lower := strings.ToLower(strings.TrimSpace(tag))
	_, ok := steamStoreFeatures[lower]
	return ok
}

// Known non-game utility AppIDs
var steamUtilityAppIDsList = []int{
	431960,  // Wallpaper Engine
	629520,  // Soundpad
	993090,  // Lossless Scaling
	223850,  // 3DMark
	1905180, // OBS Studio
	365670,  // Blender
	1366800, // Crosshair X
	400040,  // ShareX
	250820,  // SteamVR
}

var steamUtilityNames = []string{
	"wallpaper engine",
	"soundpad",
	"lossless scaling",
	"3dmark",
	"obs studio",
	"steamvr",
	"blender",
	"crosshair x",
	"sharex",
}

func steamUtilityAppIDs() []int {
	return steamUtilityAppIDsList
}

// isSteamUtilityApp returns true if the app is a known utility/non-game application.
func isSteamUtilityApp(appID int, name string) bool {
	for _, id := range steamUtilityAppIDsList {
		if appID == id {
			return true
		}
	}
	lowerName := strings.ToLower(strings.TrimSpace(name))
	for _, utilName := range steamUtilityNames {
		if strings.Contains(lowerName, utilName) {
			return true
		}
	}
	return false
}

var isoDurationRegex = regexp.MustCompile(`(?i)^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$`)

// parseDurationToHours converts ISO 8601, HH:MM:SS, MM:SS, or raw seconds string into fractional hours.
func parseDurationToHours(raw string) float64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}

	// 1. ISO 8601 (PT1H2M3S)
	if match := isoDurationRegex.FindStringSubmatch(raw); match != nil && (match[1] != "" || match[2] != "" || match[3] != "") {
		var h, m, s float64
		if match[1] != "" {
			h, _ = strconv.ParseFloat(match[1], 64)
		}
		if match[2] != "" {
			m, _ = strconv.ParseFloat(match[2], 64)
		}
		if match[3] != "" {
			s, _ = strconv.ParseFloat(match[3], 64)
		}
		return h + (m / 60.0) + (s / 3600.0)
	}

	// 2. Standard timestamp HH:MM:SS or MM:SS
	if strings.Contains(raw, ":") {
		parts := strings.Split(raw, ":")
		if len(parts) == 3 {
			h, err1 := strconv.ParseFloat(parts[0], 64)
			m, err2 := strconv.ParseFloat(parts[1], 64)
			s, err3 := strconv.ParseFloat(parts[2], 64)
			if err1 == nil && err2 == nil && err3 == nil {
				return h + (m / 60.0) + (s / 3600.0)
			}
		} else if len(parts) == 2 {
			m, err1 := strconv.ParseFloat(parts[0], 64)
			s, err2 := strconv.ParseFloat(parts[1], 64)
			if err1 == nil && err2 == nil {
				return (m / 60.0) + (s / 3600.0)
			}
		}
	}

	// 3. Raw seconds
	if secs, err := strconv.ParseFloat(raw, 64); err == nil && secs > 0 {
		return secs / 3600.0
	}

	return 0
}

type ytGameAgg struct {
	count int
	hours float64
}

func extractGameTitleFromVideo(title string, gameTag string) string {
	if strings.TrimSpace(gameTag) != "" {
		return strings.TrimSpace(gameTag)
	}
	title = strings.TrimSpace(title)
	if title == "" {
		return ""
	}
	for _, sep := range []string{" - ", " | ", " — "} {
		if idx := strings.Index(title, sep); idx > 0 {
			prefix := strings.TrimSpace(title[:idx])
			if prefix != "" {
				return prefix
			}
		}
	}
	return title
}

// loadYouTubeGameStats queries yt_videos in a single pass and returns aggregated video counts and hours keyed by normalized game title.
func (a *App) loadYouTubeGameStats() map[string]ytGameAgg {
	aggMap := make(map[string]ytGameAgg)
	rows, err := a.db.conn.Query("SELECT COALESCE(title, ''), COALESCE(game_tag, ''), COALESCE(duration, '') FROM yt_videos")
	if err != nil {
		return aggMap
	}
	defer rows.Close()

	for rows.Next() {
		var title, gameTag, duration string
		if err := rows.Scan(&title, &gameTag, &duration); err == nil {
			gameName := extractGameTitleFromVideo(title, gameTag)
			norm := normalizeGameTitle(gameName)
			if norm == "" {
				continue
			}
			hours := parseDurationToHours(duration)
			cur := aggMap[norm]
			cur.count++
			cur.hours += hours
			aggMap[norm] = cur
		}
	}
	return aggMap
}

// GetSteamLibraryPulse returns aggregated playtime buckets, Top 10 concentration, achievement counts, and YouTube bridge stats.
func (a *App) GetSteamLibraryPulse(hideUtilities bool) (SteamLibraryPulse, error) {
	if a.db == nil {
		return SteamLibraryPulse{}, fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	ytStats := a.loadYouTubeGameStats()

	rows, err := a.db.conn.Query("SELECT appid, name, playtime_forever FROM steam_games ORDER BY playtime_forever DESC")
	if err != nil {
		return SteamLibraryPulse{}, fmt.Errorf("failed to query steam_games: %w", err)
	}
	defer rows.Close()

	var pulse SteamLibraryPulse
	var totalMinutes int
	var top10Sum int
	var top10Count int

	for rows.Next() {
		var appID int
		var name string
		var playtime int
		if err := rows.Scan(&appID, &name, &playtime); err == nil {
			if hideUtilities && isSteamUtilityApp(appID, name) {
				continue
			}
			pulse.TotalGames++
			totalMinutes += playtime

			if top10Count < 10 {
				top10Sum += playtime
				top10Count++
			}

			// Buckets
			if playtime == 0 {
				pulse.UnplayedGames++
			} else if playtime < 120 {
				pulse.TriedGames++
			} else if playtime < 3000 {
				pulse.PlayedGames++
			} else {
				pulse.ObsessionGames++
			}

			// YouTube bridge cross-reference
			norm := normalizeGameTitle(name)
			if yt, exists := ytStats[norm]; exists && yt.count > 0 {
				pulse.RecordedGamesCount++
			}
		}
	}

	pulse.TotalHours = totalMinutes / 60
	if totalMinutes > 0 {
		pulse.Top10SharePct = (float64(top10Sum) / float64(totalMinutes)) * 100.0
	}

	// Achievements aggregation
	achRows, err := a.db.conn.Query(`
		SELECT a.appid, a.total_achievements, a.achieved, a.progress_percent, g.name
		FROM steam_achievements a
		JOIN steam_games g ON a.appid = g.appid
	`)
	if err == nil {
		defer achRows.Close()
		for achRows.Next() {
			var appID int
			var total, achieved int
			var progress float64
			var name string
			if err := achRows.Scan(&appID, &total, &achieved, &progress, &name); err == nil {
				if hideUtilities && isSteamUtilityApp(appID, name) {
					continue
				}
				pulse.TotalAchievements += total
				pulse.UnlockedAchievements += achieved
				if total > 0 && progress >= 100.0 {
					pulse.PerfectGamesCount++
				} else if progress >= 75.0 && progress < 100.0 {
					pulse.AlmostThereCount++
				}
			}
		}
	}

	return pulse, nil
}

// GetEnrichedSteamGames returns all owned games enriched with developers, publishers, genres, vertical poster, YouTube metrics, backlog queue status, and personal ratings.
func (a *App) GetEnrichedSteamGames(hideUtilities bool) ([]EnrichedSteamGameItem, error) {
	if a.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	ytStats := a.loadYouTubeGameStats()

	// Load non-feature genres grouped by appid
	tagRows, err := a.db.conn.Query("SELECT appid, tag FROM steam_tags")
	tagMap := make(map[int][]string)
	if err == nil {
		for tagRows.Next() {
			var appID int
			var tag string
			if err := tagRows.Scan(&appID, &tag); err == nil {
				if !isSteamStoreFeature(tag) {
					tagMap[appID] = append(tagMap[appID], tag)
				}
			}
		}
		tagRows.Close()
	}

	query := `
		SELECT 
			g.appid, 
			g.name, 
			g.playtime_forever, 
			g.playtime_2weeks, 
			COALESCE(g.header_url, ''),
			COALESCE(a.progress_percent, 0.0),
			COALESCE(d.developers, ''),
			COALESCE(d.publishers, ''),
			COALESCE(b.status, ''),
			COALESCE(b.rank_order, 0),
			COALESCE(b.notes, ''),
			COALESCE(r.tier, ''),
			COALESCE(r.score, 0),
			COALESCE(r.notes, '')
		FROM steam_games g
		LEFT JOIN steam_achievements a ON g.appid = a.appid
		LEFT JOIN steam_game_details d ON g.appid = d.appid
		LEFT JOIN steam_backlog_queue b ON g.appid = b.appid
		LEFT JOIN steam_game_ratings r ON g.appid = r.appid
		ORDER BY g.playtime_forever DESC, g.name ASC
	`
	rows, err := a.db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query enriched steam games: %w", err)
	}
	defer rows.Close()

	var items []EnrichedSteamGameItem
	for rows.Next() {
		var item EnrichedSteamGameItem
		err := rows.Scan(
			&item.AppID,
			&item.Name,
			&item.PlaytimeForever,
			&item.Playtime2Weeks,
			&item.HeaderURL,
			&item.AchievementsPct,
			&item.Developers,
			&item.Publishers,
			&item.BacklogStatus,
			&item.BacklogRank,
			&item.BacklogNotes,
			&item.PersonalTier,
			&item.PersonalScore,
			&item.PersonalNotes,
		)
		if err != nil {
			continue
		}

		item.IsUtility = isSteamUtilityApp(item.AppID, item.Name)
		if hideUtilities && item.IsUtility {
			continue
		}

		item.PlaytimeHours = float64(item.PlaytimeForever) / 60.0
		item.PosterURL = fmt.Sprintf("https://cdn.akamai.steamstatic.com/steam/apps/%d/library_600x900_2x.jpg", item.AppID)

		if tags, ok := tagMap[item.AppID]; ok && len(tags) > 0 {
			item.Genres = strings.Join(tags, ", ")
		}

		norm := normalizeGameTitle(item.Name)
		if yt, ok := ytStats[norm]; ok {
			item.YTVideosCount = yt.count
			item.YTRecordedHours = yt.hours
		}

		items = append(items, item)
	}

	return items, nil
}

