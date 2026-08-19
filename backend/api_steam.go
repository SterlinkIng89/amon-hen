package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type SteamSearchResponse struct {
	Items []struct {
		ID int `json:"id"`
	} `json:"items"`
}

// GetSteamAppID searches the local cache or Steam store API for a game's AppID.
// This is exposed to Wails frontend.
func (a *App) GetSteamAppID(gameName string) string {
	if a.db == nil {
		return ""
	}
	
	gameName = strings.TrimSpace(gameName)
	if gameName == "" {
		return ""
	}

	a.db.mu.Lock()
	var appID string
	err := a.db.conn.QueryRow(`SELECT app_id FROM steam_app_cache WHERE game_name = ?`, gameName).Scan(&appID)
	a.db.mu.Unlock()

	if err == nil && appID != "" {
		return appID
	}

	// Not in cache, fetch from Steam API
	searchURL := "https://store.steampowered.com/api/storesearch/?term=" + url.QueryEscape(gameName) + "&l=english&cc=US"
	
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(searchURL)
	if err != nil {
		appLog("[SteamAPI] Error searching for %s: %v", gameName, err)
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		appLog("[SteamAPI] Bad status %d for %s", resp.StatusCode, gameName)
		return ""
	}

	var searchResp SteamSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		appLog("[SteamAPI] Decode error for %s: %v", gameName, err)
		return ""
	}

	if len(searchResp.Items) > 0 {
		appID = fmt.Sprintf("%d", searchResp.Items[0].ID)
		
		// Save to cache
		a.db.mu.Lock()
		_, err = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, appID)
		a.db.mu.Unlock()
		
		if err != nil {
			appLog("[SteamAPI] Error caching %s: %v", gameName, err)
		}
		
		return appID
	}

	// Cache a negative result to avoid spamming the API? For now, we will cache "" to prevent refetching
	a.db.mu.Lock()
	_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, "NOT_FOUND")
	a.db.mu.Unlock()

	return ""
}

// GetSteamGameAchievementPct returns the achievement percentage for a given app ID.
func (a *App) GetSteamGameAchievementPct(appId string) float64 {
	if a.db == nil || appId == "" || appId == "NOT_FOUND" {
		return 0
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	var pct float64
	err := a.db.conn.QueryRow(`SELECT progress_percent FROM steam_achievements WHERE appid = ?`, appId).Scan(&pct)
	if err != nil {
		return 0
	}

	return pct
}
