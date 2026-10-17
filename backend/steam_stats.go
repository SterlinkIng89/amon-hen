package backend

import (
	"database/sql"
	"fmt"
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
