package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	steamSyncMu   sync.Mutex
	isSteamSyncing bool
)

type SteamOwnedGamesResponse struct {
	Response struct {
		GameCount int `json:"game_count"`
		Games     []struct {
			AppID           int    `json:"appid"`
			Name            string `json:"name"`
			PlaytimeForever int    `json:"playtime_forever"`
			Playtime2Weeks  int    `json:"playtime_2weeks"`
			ImgIconURL      string `json:"img_icon_url"`
		} `json:"games"`
	} `json:"response"`
}

type SteamAppDetailsResponse map[string]struct {
	Success bool `json:"success"`
	Data    struct {
		Developers []string `json:"developers"`
		Publishers []string `json:"publishers"`
		Categories []struct {
			Description string `json:"description"`
		} `json:"categories"`
		Genres []struct {
			Description string `json:"description"`
		} `json:"genres"`
	} `json:"data"`
}

type SteamAchievementsResponse struct {
	PlayerStats struct {
		Success      bool `json:"success"`
		Achievements []struct {
			Apiname  string `json:"apiname"`
			Achieved int    `json:"achieved"`
		} `json:"achievements"`
	} `json:"playerstats"`
}

// IsSteamSyncing returns whether a sync is currently in progress
func (a *App) IsSteamSyncing() bool {
	steamSyncMu.Lock()
	defer steamSyncMu.Unlock()
	return isSteamSyncing
}

// SyncSteamData fetches the user's games and updates the database
func (a *App) SyncSteamData() error {
	if a.config.SteamAPIKey == "" || a.config.SteamID == "" {
		return fmt.Errorf("Steam API key or Steam ID not configured")
	}

	steamSyncMu.Lock()
	if isSteamSyncing {
		steamSyncMu.Unlock()
		return fmt.Errorf("Steam sync is already in progress")
	}
	isSteamSyncing = true
	steamSyncMu.Unlock()

	go func() {
		defer func() {
			steamSyncMu.Lock()
			isSteamSyncing = false
			steamSyncMu.Unlock()
			runtime.EventsEmit(a.ctx, "steam:sync-done", true)
		}()

		runtime.EventsEmit(a.ctx, "steam:sync-progress", "Fetching Steam library...")

		url := fmt.Sprintf("http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=%s&steamid=%s&format=json&include_appinfo=1&include_played_free_games=1",
			a.config.SteamAPIKey, a.config.SteamID)

		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Get(url)
		if err != nil {
			appLog("[SteamSync] Failed to fetch owned games: %v", err)
			runtime.EventsEmit(a.ctx, "steam:sync-error", fmt.Sprintf("Failed to fetch games: %v", err))
			return
		}
		defer resp.Body.Close()

		var owned SteamOwnedGamesResponse
		if err := json.NewDecoder(resp.Body).Decode(&owned); err != nil {
			appLog("[SteamSync] Failed to decode owned games: %v", err)
			runtime.EventsEmit(a.ctx, "steam:sync-error", "Failed to parse Steam response")
			return
		}

		a.db.mu.Lock()
		tx, err := a.db.conn.Begin()
		if err != nil {
			a.db.mu.Unlock()
			appLog("[SteamSync] Transaction begin failed: %v", err)
			return
		}

		stmt, err := tx.Prepare(`INSERT INTO steam_games (appid, name, playtime_forever, playtime_2weeks, header_url) 
			VALUES (?, ?, ?, ?, ?) 
			ON CONFLICT(appid) DO UPDATE SET 
				name=excluded.name,
				playtime_forever=excluded.playtime_forever, 
				playtime_2weeks=excluded.playtime_2weeks,
				header_url=excluded.header_url`)
		if err != nil {
			tx.Rollback()
			a.db.mu.Unlock()
			appLog("[SteamSync] Statement prepare failed: %v", err)
			return
		}

		for _, game := range owned.Response.Games {
			headerUrl := fmt.Sprintf("https://steamcdn-a.akamaihd.net/steam/apps/%d/header.jpg", game.AppID)
			_, _ = stmt.Exec(game.AppID, game.Name, game.PlaytimeForever, game.Playtime2Weeks, headerUrl)
		}
		stmt.Close()
		_ = tx.Commit()
		a.db.mu.Unlock()

		runtime.EventsEmit(a.ctx, "steam:games-updated", true)

		// 2. Query all played games that need details or achievements
		a.db.mu.Lock()
		rows, err := a.db.conn.Query(`
			SELECT appid, name FROM steam_games 
			WHERE (playtime_forever > 0 OR playtime_2weeks > 0)
			ORDER BY playtime_forever DESC
		`)
		if err != nil {
			a.db.mu.Unlock()
			appLog("[SteamSync] Query error for played games: %v", err)
			return
		}

		type gameItem struct {
			appID int
			name  string
		}
		var gamesToSync []gameItem
		for rows.Next() {
			var g gameItem
			if err := rows.Scan(&g.appID, &g.name); err == nil {
				gamesToSync = append(gamesToSync, g)
			}
		}
		rows.Close()
		a.db.mu.Unlock()

		total := len(gamesToSync)
		appLog("[SteamSync] Found %d played games to check details for", total)

		for i, g := range gamesToSync {
			progressMsg := fmt.Sprintf("Syncing %d/%d: %s", i+1, total, g.name)
			runtime.EventsEmit(a.ctx, "steam:sync-progress", progressMsg)

			// Check if details already exist
			a.db.mu.Lock()
			var exists int
			_ = a.db.conn.QueryRow(`SELECT 1 FROM steam_game_details WHERE appid = ?`, g.appID).Scan(&exists)
			a.db.mu.Unlock()

			if exists == 0 {
				a.syncAppDetailsForGame(g.appID)
				time.Sleep(350 * time.Millisecond) // Polite delay for Store API
			}

			// Sync achievements
			a.syncAchievementsForGame(g.appID)
			time.Sleep(100 * time.Millisecond)
		}

		runtime.EventsEmit(a.ctx, "steam:sync-progress", "Sync complete!")
	}()

	return nil
}

func (a *App) syncAppDetailsForGame(appID int) {
	url := fmt.Sprintf("https://store.steampowered.com/api/appdetails?appids=%d", appID)
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		appLog("[SteamSync] Failed to fetch app details for %d: %v", appID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		appLog("[SteamSync] Rate limited (429) on appdetails for %d, waiting 5s...", appID)
		time.Sleep(5 * time.Second)
		return
	}

	var details SteamAppDetailsResponse
	if err := json.NewDecoder(resp.Body).Decode(&details); err != nil {
		return
	}

	appStr := strconv.Itoa(appID)
	gameData, ok := details[appStr]
	if !ok || !gameData.Success {
		return
	}

	var devs, pubs string
	for i, d := range gameData.Data.Developers {
		if i > 0 {
			devs += ", "
		}
		devs += d
	}
	for i, p := range gameData.Data.Publishers {
		if i > 0 {
			pubs += ", "
		}
		pubs += p
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_game_details (appid, developers, publishers, synced_at) VALUES (?, ?, ?, ?)`,
		appID, devs, pubs, time.Now().Unix())

	for _, pub := range gameData.Data.Publishers {
		pub = strings.TrimSpace(pub)
		if pub != "" {
			_, _ = a.db.conn.Exec(`INSERT OR IGNORE INTO steam_publishers (appid, publisher) VALUES (?, ?)`, appID, pub)
		}
	}

	for _, genre := range gameData.Data.Genres {
		_, _ = a.db.conn.Exec(`INSERT OR IGNORE INTO steam_tags (appid, tag) VALUES (?, ?)`, appID, genre.Description)
	}
	for _, cat := range gameData.Data.Categories {
		_, _ = a.db.conn.Exec(`INSERT OR IGNORE INTO steam_tags (appid, tag) VALUES (?, ?)`, appID, cat.Description)
	}
}

func (a *App) syncAchievementsForGame(appID int) {
	if a.config.SteamAPIKey == "" || a.config.SteamID == "" {
		return
	}

	url := fmt.Sprintf("http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=%d&key=%s&steamid=%s",
		appID, a.config.SteamAPIKey, a.config.SteamID)

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return
	}

	var ach SteamAchievementsResponse
	if err := json.NewDecoder(resp.Body).Decode(&ach); err != nil {
		return
	}

	if !ach.PlayerStats.Success {
		return
	}

	total := len(ach.PlayerStats.Achievements)
	if total == 0 {
		return
	}

	achieved := 0
	for _, a := range ach.PlayerStats.Achievements {
		if a.Achieved == 1 {
			achieved++
		}
	}

	progress := float64(achieved) / float64(total) * 100.0

	a.db.mu.Lock()
	_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_achievements (appid, total_achievements, achieved, progress_percent) VALUES (?, ?, ?, ?)`,
		appID, total, achieved, progress)
	a.db.mu.Unlock()
}
