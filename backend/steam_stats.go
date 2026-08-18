package backend

import (
	"fmt"
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
	Name        string `json:"name"`
	TotalHours  int    `json:"totalHours"`
	GamesCount  int    `json:"gamesCount"`
}

type SteamTagStats struct {
	Tag         string `json:"tag"`
	TotalHours  int    `json:"totalHours"`
	GamesCount  int    `json:"gamesCount"`
}

type SteamOverallStats struct {
	TotalGames           int `json:"totalGames"`
	TotalHours           int `json:"totalHours"`
	TotalAchievements    int `json:"totalAchievements"`
	UnlockedAchievements int `json:"unlockedAchievements"`
}

// GetSteamDeveloperStats returns the top developers
func (a *App) GetSteamDeveloperStats(sortBy string) ([]SteamDevPubStats, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	orderClause := "total_hours DESC"
	if sortBy == "games" {
		orderClause = "games_count DESC"
	}

	query := fmt.Sprintf(`
		SELECT d.developers, SUM(g.playtime_forever)/60 as total_hours, COUNT(g.appid) as games_count
		FROM steam_game_details d
		JOIN steam_games g ON d.appid = g.appid
		WHERE d.developers != ''
		GROUP BY d.developers
		ORDER BY %s
	`, orderClause)

	rows, err := a.db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %v", err)
	}
	defer rows.Close()

	var stats []SteamDevPubStats
	for rows.Next() {
		var stat SteamDevPubStats
		if err := rows.Scan(&stat.Name, &stat.TotalHours, &stat.GamesCount); err == nil {
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
				for _, p := range strings.Split(item.pubs, ",") {
					p = strings.TrimSpace(p)
					if p != "" {
						a.db.conn.Exec("INSERT OR IGNORE INTO steam_publishers (appid, publisher) VALUES (?, ?)", item.appid, p)
					}
				}
			}
		}
	}

	orderClause := "total_hours DESC"
	if sortBy == "games" {
		orderClause = "games_count DESC"
	}

	query := fmt.Sprintf(`
		SELECT p.publisher, SUM(g.playtime_forever)/60 as total_hours, COUNT(DISTINCT g.appid) as games_count
		FROM steam_publishers p
		JOIN steam_games g ON p.appid = g.appid
		WHERE p.publisher != ''
		GROUP BY p.publisher
		ORDER BY %s
	`, orderClause)

	rows, err := a.db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %v", err)
	}
	defer rows.Close()

	var stats []SteamDevPubStats
	for rows.Next() {
		var stat SteamDevPubStats
		if err := rows.Scan(&stat.Name, &stat.TotalHours, &stat.GamesCount); err == nil {
			stats = append(stats, stat)
		}
	}
	return stats, nil
}

// GetSteamTagStats returns the top tags/genres
func (a *App) GetSteamTagStats(sortBy string) ([]SteamTagStats, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	orderClause := "total_hours DESC"
	if sortBy == "games" {
		orderClause = "games_count DESC"
	}

	query := fmt.Sprintf(`
		SELECT t.tag, SUM(g.playtime_forever)/60 as total_hours, COUNT(DISTINCT g.appid) as games_count
		FROM steam_tags t
		JOIN steam_games g ON t.appid = g.appid
		GROUP BY t.tag
		ORDER BY %s
	`, orderClause)

	rows, err := a.db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %v", err)
	}
	defer rows.Close()

	var stats []SteamTagStats
	for rows.Next() {
		var stat SteamTagStats
		if err := rows.Scan(&stat.Tag, &stat.TotalHours, &stat.GamesCount); err == nil {
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
		JOIN steam_game_details d ON g.appid = d.appid
		LEFT JOIN steam_achievements ach ON g.appid = ach.appid
		WHERE d.developers = ? OR d.developers LIKE ?
		ORDER BY g.playtime_forever DESC
	`, dev, "%"+dev+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []SteamGameItem
	for rows.Next() {
		var item SteamGameItem
		if err := rows.Scan(&item.AppID, &item.Name, &item.PlaytimeForever, &item.Playtime2Weeks, &item.HeaderURL, &item.AchievementsPct); err == nil {
			item.PlaytimeHours = float64(item.PlaytimeForever) / 60.0
			items = append(items, item)
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

	var items []SteamGameItem
	for rows.Next() {
		var item SteamGameItem
		if err := rows.Scan(&item.AppID, &item.Name, &item.PlaytimeForever, &item.Playtime2Weeks, &item.HeaderURL, &item.AchievementsPct); err == nil {
			item.PlaytimeHours = float64(item.PlaytimeForever) / 60.0
			items = append(items, item)
		}
	}
	return items, nil
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

	var items []SteamGameItem
	for rows.Next() {
		var item SteamGameItem
		if err := rows.Scan(&item.AppID, &item.Name, &item.PlaytimeForever, &item.Playtime2Weeks, &item.HeaderURL, &item.AchievementsPct); err == nil {
			item.PlaytimeHours = float64(item.PlaytimeForever) / 60.0
			items = append(items, item)
		}
	}
	return items, nil
}
