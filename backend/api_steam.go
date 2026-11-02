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

type SteamSearchItem struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Type string `json:"type,omitempty"`
}

type SteamSearchResponse struct {
	Total int               `json:"total"`
	Items []SteamSearchItem `json:"items"`
}

type SteamSearchResult struct {
	AppID     string `json:"appId"`
	Name      string `json:"name"`
	HeaderURL string `json:"headerUrl,omitempty"`
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

func isAudioOrDLC(title string) bool {
	lower := strings.ToLower(title)
	keywords := []string{"soundtrack", "ost", "score", "dlc", "content pack", "bonus pack", "season pass", "demo", "teaser", "upgrade"}
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

// stripYearOrSubtitle removes trailing parenthetical info like "(2013)" or trailing subtitle suffixes.
func stripYearOrSubtitle(s string) string {
	idx := strings.LastIndex(s, "(")
	if idx > 0 {
		return strings.TrimSpace(s[:idx])
	}
	idxDash := strings.LastIndex(s, " - ")
	if idxDash > 0 {
		return strings.TrimSpace(s[:idxDash])
	}
	return s
}

// findBestSteamStoreMatch finds the closest matching Steam item for the given query.
func findBestSteamStoreMatch(items []SteamSearchItem, query string) (SteamSearchItem, bool) {
	if len(items) == 0 {
		return SteamSearchItem{}, false
	}

	trimmedQuery := strings.TrimSpace(query)
	normQuery := normalizeGameTitle(trimmedQuery)

	// 1. Exact match (case-insensitive & trimmed)
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item.Name), trimmedQuery) {
			return item, true
		}
	}

	// 2. Normalized match (without symbols/punctuation/casing)
	for _, item := range items {
		if normalizeGameTitle(item.Name) == normQuery {
			return item, true
		}
	}

	// 3. Match with trailing Roman/Arabic '1' or 'I' stripped from query
	// e.g. query "Psychonauts 1" matches item "Psychonauts"
	lowerQuery := strings.ToLower(trimmedQuery)
	queryNoOne := strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(lowerQuery, " 1"), " i"))
	normQueryNoOne := normalizeGameTitle(queryNoOne)
	if normQueryNoOne != "" && normQueryNoOne != normQuery {
		for _, item := range items {
			if normalizeGameTitle(item.Name) == normQueryNoOne {
				return item, true
			}
		}
	}

	// 4. Match with year or subtitle stripped from item name
	// e.g. item "Risk of Rain (2013)" matches query "Risk of Rain"
	for _, item := range items {
		stripped := stripYearOrSubtitle(item.Name)
		if normalizeGameTitle(stripped) == normQuery {
			return item, true
		}
	}

	// 5. Best candidate selection: penalize sequels if query didn't specify sequel number,
	// and ignore soundtracks/DLC unless query asked for them.
	queryWantsAudio := isAudioOrDLC(query)
	queryHasSequel := strings.Contains(normQuery, "2") || strings.Contains(normQuery, "3") ||
		strings.Contains(normQuery, "4") || strings.Contains(normQuery, "5")

	bestScore := -9999
	var bestItem SteamSearchItem
	var hasBest bool

	for _, item := range items {
		itemNorm := normalizeGameTitle(item.Name)
		if !queryWantsAudio && isAudioOrDLC(item.Name) {
			continue // skip soundtrack / DLC
		}

		score := 0
		if strings.HasPrefix(itemNorm, normQuery) {
			score += 50
		} else if strings.Contains(itemNorm, normQuery) {
			score += 20
		}

		// Penalize sequel numbers if query does not specify one
		itemHasSequel := strings.Contains(itemNorm, "2") || strings.Contains(itemNorm, "3") ||
			strings.Contains(itemNorm, "4") || strings.Contains(itemNorm, "5")
		if !queryHasSequel && itemHasSequel {
			score -= 100
		}

		// Prefer names closer in length to the query
		diff := len(itemNorm) - len(normQuery)
		if diff < 0 {
			diff = -diff
		}
		score -= diff

		if score > bestScore {
			bestScore = score
			bestItem = item
			hasBest = true
		}
	}

	if hasBest && bestScore > -50 {
		return bestItem, true
	}

	// Fallback: first non-audio item, or first item
	for _, item := range items {
		if !queryWantsAudio && !isAudioOrDLC(item.Name) {
			return item, true
		}
	}

	return items[0], true
}

func querySteamStoreSearch(gameName string) (SteamSearchResponse, error) {
	searchURL := "https://store.steampowered.com/api/storesearch/?term=" + url.QueryEscape(gameName) + "&l=english&cc=US"
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(searchURL)
	if err != nil {
		appLog("[SteamAPI] Error searching for %s: %v", gameName, err)
		return SteamSearchResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		appLog("[SteamAPI] Bad status %d for %s", resp.StatusCode, gameName)
		return SteamSearchResponse{}, fmt.Errorf("bad status %d", resp.StatusCode)
	}

	var searchResp SteamSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		appLog("[SteamAPI] Decode error for %s: %v", gameName, err)
		return SteamSearchResponse{}, err
	}

	return searchResp, nil
}

// GetSteamAppID searches the local steam_games database, local cache, or Steam store API for a game's AppID.
// This is exposed to Wails frontend.
func (a *App) GetSteamAppID(gameName string) string {
	if a.db == nil {
		return ""
	}

	gameName = strings.TrimSpace(gameName)
	if gameName == "" {
		return ""
	}

	normalizedTarget := normalizeGameTitle(gameName)

	// 1. Check local steam_games table (owned games in library) - Exact match (case-insensitive & trimmed)
	a.db.mu.Lock()
	var localAppID int
	err := a.db.conn.QueryRow(`SELECT appid FROM steam_games WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1`, gameName).Scan(&localAppID)
	a.db.mu.Unlock()

	if err == nil && localAppID > 0 {
		appID := fmt.Sprintf("%d", localAppID)
		a.db.mu.Lock()
		_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, appID)
		a.db.mu.Unlock()
		return appID
	}

	// 2. Check local steam_games table - Normalized match (removing punctuation, symbols, trademarks)
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

	// 3. Check local cache (steam_app_cache) for a previously resolved valid AppID
	a.db.mu.Lock()
	var cachedAppID string
	err = a.db.conn.QueryRow(`SELECT app_id FROM steam_app_cache WHERE game_name = ?`, gameName).Scan(&cachedAppID)
	if err == nil && cachedAppID != "" && cachedAppID != "NOT_FOUND" {
		var knownName string
		_ = a.db.conn.QueryRow(`SELECT name FROM steam_games WHERE appid = ? LIMIT 1`, cachedAppID).Scan(&knownName)
		if knownName != "" && normalizedTarget != "" {
			knownNorm := normalizeGameTitle(knownName)
			if knownNorm != normalizedTarget && !strings.Contains(knownNorm, normalizedTarget) {
				_, _ = a.db.conn.Exec(`DELETE FROM steam_app_cache WHERE game_name = ?`, gameName)
				cachedAppID = ""
			}
		}
	}
	a.db.mu.Unlock()

	if cachedAppID != "" && cachedAppID != "NOT_FOUND" {
		return cachedAppID
	}

	// 4. Fallback: Query Steam Store search API with smart matching
	searchResp, err := querySteamStoreSearch(gameName)
	if err == nil && len(searchResp.Items) > 0 {
		bestItem, found := findBestSteamStoreMatch(searchResp.Items, gameName)
		if found {
			appID := fmt.Sprintf("%d", bestItem.ID)
			a.db.mu.Lock()
			_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, appID)
			a.db.mu.Unlock()
			return appID
		}
	}

	// Cache NOT_FOUND
	a.db.mu.Lock()
	_, _ = a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, "NOT_FOUND")
	a.db.mu.Unlock()

	return ""
}

// SetSteamAppID explicitly binds a game tag to a Steam AppID in steam_app_cache.
func (a *App) SetSteamAppID(gameName string, appId string) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}
	gameName = strings.TrimSpace(gameName)
	appId = strings.TrimSpace(appId)
	if gameName == "" {
		return fmt.Errorf("game name cannot be empty")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	if appId == "" || appId == "NOT_FOUND" {
		_, err := a.db.conn.Exec(`DELETE FROM steam_app_cache WHERE game_name = ?`, gameName)
		return err
	}

	_, err := a.db.conn.Exec(`INSERT OR REPLACE INTO steam_app_cache (game_name, app_id) VALUES (?, ?)`, gameName, appId)
	return err
}

// SearchSteamGames searches both local steam_games and Steam Store API for matching games.
func (a *App) SearchSteamGames(query string) []SteamSearchResult {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil
	}

	results := make([]SteamSearchResult, 0)
	seen := make(map[string]bool)

	// 1. Search local steam_games table
	if a.db != nil {
		a.db.mu.Lock()
		pattern := "%" + query + "%"
		rows, err := a.db.conn.Query(`SELECT appid, name, header_url FROM steam_games WHERE name LIKE ? ORDER BY playtime_forever DESC LIMIT 15`, pattern)
		if err == nil {
			for rows.Next() {
				var appid int
				var name, headerURL string
				if scanErr := rows.Scan(&appid, &name, &headerURL); scanErr == nil {
					idStr := fmt.Sprintf("%d", appid)
					if !seen[idStr] {
						seen[idStr] = true
						if headerURL == "" {
							headerURL = fmt.Sprintf("https://steamcdn-a.akamaihd.net/steam/apps/%s/header.jpg", idStr)
						}
						results = append(results, SteamSearchResult{
							AppID:     idStr,
							Name:      name,
							HeaderURL: headerURL,
						})
					}
				}
			}
			rows.Close()
		}
		a.db.mu.Unlock()
	}

	// 2. Search Steam Store search API
	searchResp, err := querySteamStoreSearch(query)
	if err == nil {
		for _, item := range searchResp.Items {
			idStr := fmt.Sprintf("%d", item.ID)
			if !seen[idStr] && item.Name != "" {
				seen[idStr] = true
				results = append(results, SteamSearchResult{
					AppID:     idStr,
					Name:      item.Name,
					HeaderURL: fmt.Sprintf("https://steamcdn-a.akamaihd.net/steam/apps/%s/header.jpg", idStr),
				})
			}
		}
	}

	return results
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
	Title     string `json:"title,omitempty"`
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

	if a.db != nil {
		a.db.mu.Lock()
		var title string
		_ = a.db.conn.QueryRow(`SELECT name FROM steam_games WHERE appid = ? LIMIT 1`, appId).Scan(&title)
		a.db.mu.Unlock()
		assets.Title = title
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
