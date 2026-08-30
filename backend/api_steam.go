package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

type SteamSearchResponse struct {
	Items []struct {
		ID int `json:"id"`
	} `json:"items"`
}

// normalizeGameTitle removes punctuation, symbols and spaces for resilient title comparison.
func normalizeGameTitle(s string) string {
	var sb strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// GetSteamAppID searches the local cache, local steam_games database, or Steam store API for a game's AppID.
// This is exposed to Wails frontend.
func (a *App) GetSteamAppID(gameName string) string {
	if a.db == nil {
		return ""
	}

	gameName = strings.TrimSpace(gameName)
	if gameName == "" {
		return ""
	}

	// 1. Check local cache (steam_app_cache) for a previously resolved valid AppID
	a.db.mu.Lock()
	var cachedAppID string
	err := a.db.conn.QueryRow(`SELECT app_id FROM steam_app_cache WHERE game_name = ?`, gameName).Scan(&cachedAppID)
	a.db.mu.Unlock()

	if err == nil && cachedAppID != "" && cachedAppID != "NOT_FOUND" {
		return cachedAppID
	}

	// 2. Check local steam_games table (owned games in library)
	// 2a. Exact match (case-insensitive & trimmed)
	a.db.mu.Lock()
	var localAppID int
	err = a.db.conn.QueryRow(`SELECT appid FROM steam_games WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1`, gameName).Scan(&localAppID)
	a.db.mu.Unlock()

	if err == nil && localAppID > 0 {
		appID := fmt.Sprintf("%d", localAppID)
		a.db.mu.Lock()
		_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, appID)
		a.db.mu.Unlock()
		return appID
	}

	// 2b. Normalized match in steam_games (removing punctuation, symbols, trademarks)
	normalizedTarget := normalizeGameTitle(gameName)
	if normalizedTarget != "" {
		a.db.mu.Lock()
		rows, qErr := a.db.conn.Query(`SELECT appid, name FROM steam_games`)
		var matchedAppID int
		if qErr == nil {
			for rows.Next() {
				var id int
				var name string
				if scanErr := rows.Scan(&id, &name); scanErr == nil {
					if normalizeGameTitle(name) == normalizedTarget {
						matchedAppID = id
						break
					}
				}
			}
			rows.Close()
		}
		a.db.mu.Unlock()

		if matchedAppID > 0 {
			appID := fmt.Sprintf("%d", matchedAppID)
			a.db.mu.Lock()
			_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, appID)
			a.db.mu.Unlock()
			return appID
		}
	}

	// 3. Fallback: Query Steam Store search API
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
		appID := fmt.Sprintf("%d", searchResp.Items[0].ID)

		// Save to cache
		a.db.mu.Lock()
		_, err = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, appID)
		a.db.mu.Unlock()

		if err != nil {
			appLog("[SteamAPI] Error caching %s: %v", gameName, err)
		}

		return appID
	}

	// Cache NOT_FOUND
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

// SteamGameAssets holds resolved asset URLs for a Steam game.
type SteamGameAssets struct {
	HeroURL   string `json:"heroUrl"`
	PosterURL string `json:"posterUrl"`
	HeaderURL string `json:"headerUrl"`
	LogoURL   string `json:"logoUrl"`
}

// findSteamInstallPath locates the Steam root folder.
func findSteamInstallPath() string {
	candidates := []string{
		`C:\Program Files (x86)\Steam`,
		`C:\Program Files\Steam`,
	}
	if progFiles := os.Getenv("ProgramFiles(x86)"); progFiles != "" {
		candidates = append(candidates, filepath.Join(progFiles, "Steam"))
	}
	if progFiles := os.Getenv("ProgramFiles"); progFiles != "" {
		candidates = append(candidates, filepath.Join(progFiles, "Steam"))
	}
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			return c
		}
	}
	return ""
}

// GetSteamGameAssets resolves the best available asset URLs (hero, poster, header, logo)
// checking local Steam librarycache hashes first, then standard CDN URLs.
func (a *App) GetSteamGameAssets(appId string) SteamGameAssets {
	appId = strings.TrimSpace(appId)
	if appId == "" || appId == "NOT_FOUND" {
		return SteamGameAssets{}
	}

	assets := SteamGameAssets{
		HeroURL:   fmt.Sprintf("https://cdn.akamai.steamstatic.com/steam/apps/%s/library_hero.jpg", appId),
		PosterURL: fmt.Sprintf("https://cdn.akamai.steamstatic.com/steam/apps/%s/library_600x900_2x.jpg", appId),
		HeaderURL: fmt.Sprintf("https://steamcdn-a.akamaihd.net/steam/apps/%s/header.jpg", appId),
		LogoURL:   fmt.Sprintf("https://cdn.akamai.steamstatic.com/steam/apps/%s/logo.png", appId),
	}

	steamPath := findSteamInstallPath()
	if steamPath == "" {
		return assets
	}

	cacheDir := filepath.Join(steamPath, "appcache", "librarycache", appId)
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return assets
	}

	for _, entry := range entries {
		if entry.IsDir() {
			hash := entry.Name()
			subDir := filepath.Join(cacheDir, hash)
			subFiles, err := os.ReadDir(subDir)
			if err != nil {
				continue
			}
			for _, f := range subFiles {
				name := strings.ToLower(f.Name())
				switch name {
				case "library_hero.jpg", "library_hero.png":
					assets.HeroURL = fmt.Sprintf("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/%s/%s/%s", appId, hash, f.Name())
				case "library_capsule.jpg", "library_600x900.jpg", "library_600x900_2x.jpg":
					assets.PosterURL = fmt.Sprintf("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/%s/%s/%s", appId, hash, f.Name())
				case "library_header.jpg", "header.jpg":
					assets.HeaderURL = fmt.Sprintf("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/%s/%s/%s", appId, hash, f.Name())
				case "logo.png":
					assets.LogoURL = fmt.Sprintf("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/%s/%s/%s", appId, hash, f.Name())
				}
			}
		}
	}

	return assets
}
