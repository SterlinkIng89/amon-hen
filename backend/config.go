package backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type VideoMeta struct {
	Game          string `json:"game"`
	YouTubeTitle  string `json:"youtubeTitle"`
	Description   string `json:"description"`
	Privacy       string `json:"privacy"`
	YouTubeID     string `json:"youtubeId,omitempty"`
	PlaylistID    string `json:"playlistId,omitempty"`
	PlaylistTitle string `json:"playlistTitle,omitempty"`
	Episode       int    `json:"episode"`
	DurationSecs  int    `json:"durationSecs,omitempty"`
	Event         string            `json:"event,omitempty"`
	GameMode      string            `json:"gameMode,omitempty"`
	CustomVars    map[string]string `json:"customVars,omitempty"`
}

type FolderConfig struct {
	Recursive       bool `json:"recursive"`
	MaxDurationSecs int  `json:"max_duration_secs"`
}

type GameProfile struct {
	Type          string   `json:"type"`          // "singleplayer" | "multiplayer"
	TitleTemplate string   `json:"titleTemplate"` // e.g. "{event} - {gamemode} - {date}"
	Modes         []string `json:"modes"`         // list of available game modes
}

// Config holds persistent application settings
type Config struct {
	Folders             []string                `json:"folders"`
	YouTubeClientID     string                  `json:"youtube_client_id"`
	YouTubeClientSecret string                  `json:"youtube_client_secret"`
	YouTubeTokenJSON    string                  `json:"youtube_token_json,omitempty"`
	VideoGames          map[string]string       `json:"video_games"`    // Maps path to game tag
	VideoMetadata       map[string]VideoMeta    `json:"video_metadata"` // Maps path to metadata
	FolderSettings      map[string]FolderConfig `json:"folder_settings"`
	GameProfiles        map[string]GameProfile  `json:"game_profiles"`
	WatchFolderEnabled  bool                    `json:"watch_folder_enabled"`
	RecentFieldValues   map[string][]string     `json:"recent_field_values,omitempty"`
}

// initConfig loads config.json from %AppData%/AmonHen/
func (a *App) initConfig() {
	// Try to load .env first for dev/global vars
	godotenv.Load() // ignore error if .env doesn't exist

	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "AmonHen")
	os.MkdirAll(dir, 0755)
	a.configPath = filepath.Join(dir, "config.json")

	data, err := os.ReadFile(a.configPath)
	if err == nil {
		json.Unmarshal(data, &a.config)
	}

	if a.config.VideoGames == nil {
		a.config.VideoGames = make(map[string]string)
	}
	if a.config.GameProfiles == nil {
		a.config.GameProfiles = make(map[string]GameProfile)
	}

	// Hardcode default profile and modes for League of Legends
	if lol, ok := a.config.GameProfiles["League of Legends"]; ok {
		if len(lol.Modes) == 0 {
			lol.Modes = []string{"Summoner's Rift", "ARAM: Mayhem", "ARAM", "URF", "One for All", "Ultimate Spellbook"}
			a.config.GameProfiles["League of Legends"] = lol
		}
	} else {
		a.config.GameProfiles["League of Legends"] = GameProfile{
			Type:          "multiplayer",
			TitleTemplate: "{event} - {gamemode} - {date}",
			Modes:         []string{"Summoner's Rift", "ARAM: Mayhem", "ARAM", "URF", "One for All", "Ultimate Spellbook"},
		}
	}

	// Fallback to .env if config.json is missing these
	if a.config.YouTubeClientID == "" {
		a.config.YouTubeClientID = os.Getenv("client_id")
		if a.config.YouTubeClientID != "" {
			fmt.Println("YouTube Client ID loaded from .env")
		}
	}
	if a.config.YouTubeClientSecret == "" {
		a.config.YouTubeClientSecret = os.Getenv("client_secret")
		if a.config.YouTubeClientSecret != "" {
			fmt.Println("YouTube Client Secret loaded from .env")
		}
	}
}

// saveConfig persists the current config to disk
func (a *App) saveConfig() error {
	a.configMu.RLock()
	data, err := json.MarshalIndent(a.config, "", "  ")
	a.configMu.RUnlock()
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}

// LoadConfig returns the current app configuration to the frontend
func (a *App) LoadConfig() Config {
	a.configMu.RLock()
	data, _ := json.Marshal(a.config)
	a.configMu.RUnlock()

	var copy Config
	json.Unmarshal(data, &copy)
	return copy
}

// SaveFolders persists the full folder list
func (a *App) SaveFolders(folders []string) error {
	a.config.Folders = folders
	if err := a.saveConfig(); err != nil {
		return err
	}
	a.startWatcher() // restart watcher to pick up new folder list
	return nil
}

// AddFolder opens a native folder picker, adds the chosen folder, and saves
func (a *App) AddFolder() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Add video folder",
	})
	if err != nil || dir == "" {
		return "", err
	}
	for _, f := range a.config.Folders {
		if f == dir {
			return dir, nil // already present
		}
	}
	a.config.Folders = append(a.config.Folders, dir)
	if err := a.saveConfig(); err != nil {
		return dir, err
	}
	a.startWatcher() // restart watcher to include the new folder
	return dir, nil
}

// RemoveFolder removes a folder from the saved list
func (a *App) RemoveFolder(path string) error {
	updated := []string{}
	for _, f := range a.config.Folders {
		if f != path {
			updated = append(updated, f)
		}
	}
	a.config.Folders = updated
	return a.saveConfig()
}

// SetVideosPlaylist assigns a playlist ID and title to multiple videos and saves the config
func (a *App) SetVideosPlaylist(paths []string, playlistId string, playlistTitle string) error {
	a.configMu.Lock()
	if a.config.VideoMetadata == nil {
		a.config.VideoMetadata = make(map[string]VideoMeta)
	}
	for _, p := range paths {
		meta := a.config.VideoMetadata[p]
		meta.PlaylistID = playlistId
		meta.PlaylistTitle = playlistTitle
		a.config.VideoMetadata[p] = meta
	}
	a.configMu.Unlock()
	return a.saveConfig()
}

// SetVideoGames updates the game tag for multiple video paths and saves the config
func (a *App) SetVideoGames(paths []string, game string, event string, gameMode string, customVars map[string]string) error {
	a.configMu.Lock()
	if a.config.VideoGames == nil {
		a.config.VideoGames = make(map[string]string)
	}
	if a.config.VideoMetadata == nil {
		a.config.VideoMetadata = make(map[string]VideoMeta)
	}

	for _, p := range paths {
		prevMeta := a.config.VideoMetadata[p]
		tagChanged := prevMeta.Game != game

		if game == "" {
			delete(a.config.VideoGames, p)
			meta := a.config.VideoMetadata[p]
			meta.Game = ""
			meta.Event = ""
			meta.GameMode = ""
			meta.CustomVars = nil
			meta.YouTubeTitle = "" // Force re-generation
			meta.Episode = 0       // Reset so it is recalculated under the new tag
			a.config.VideoMetadata[p] = meta
		} else {
			a.config.VideoGames[p] = game
			meta := a.config.VideoMetadata[p]
			meta.Game = game
			// When using bulk action, we always want to apply the provided event and gameMode.
			meta.Event = event
			meta.GameMode = gameMode
			meta.CustomVars = customVars
			meta.YouTubeTitle = "" // Force re-generation so it gets the new tag + episode
			if tagChanged {
				meta.Episode = 0
			}
			a.config.VideoMetadata[p] = meta
		}

		// Also wipe the stale game_tag / episode columns in yt_videos so that
		// episodeCountForTag does not count this file under the old tag anymore.
		if tagChanged && a.db != nil {
			a.db.mu.Lock()
			a.db.conn.Exec(
				`UPDATE yt_videos SET game_tag = ?, episode = NULL WHERE local_file = ?`,
				game, p,
			)
			a.db.mu.Unlock()
		}
	}
	a.configMu.Unlock()
	return a.saveConfig()
}

// SaveVideoMetadata updates all metadata for a specific video and saves the config
func (a *App) SaveVideoMetadata(path string, game string, ytTitle string, desc string, privacy string, playlistId string, episode int, event string, gameMode string, customVars map[string]string) error {
	a.configMu.Lock()
	if a.config.VideoGames == nil {
		a.config.VideoGames = make(map[string]string)
	}
	if a.config.VideoMetadata == nil {
		a.config.VideoMetadata = make(map[string]VideoMeta)
	}

	if game == "" {
		delete(a.config.VideoGames, path)
	} else {
		a.config.VideoGames[path] = game
	}

	a.config.VideoMetadata[path] = VideoMeta{
		Game:         game,
		YouTubeTitle: ytTitle,
		Description:  desc,
		Privacy:      privacy,
		PlaylistID:   playlistId,
		Episode:      episode,
		Event:        event,
		GameMode:     gameMode,
		CustomVars:   customVars,
	}
	a.configMu.Unlock()

	return a.saveConfig()
}

// GetFolderSettings returns settings for a specific folder.
func (a *App) GetFolderSettings(folder string) FolderConfig {
	if a.config.FolderSettings == nil {
		return FolderConfig{}
	}
	return a.config.FolderSettings[folder]
}

// SaveFolderSettings saves settings for a specific folder.
func (a *App) SaveFolderSettings(folder string, cfg FolderConfig) error {
	if a.config.FolderSettings == nil {
		a.config.FolderSettings = make(map[string]FolderConfig)
	}
	a.config.FolderSettings[folder] = cfg
	return a.saveConfig()
}

// GetWatchFolderEnabled returns whether automatic folder watching is enabled.
func (a *App) GetWatchFolderEnabled() bool {
	return a.config.WatchFolderEnabled
}

// SetWatchFolderEnabled enables or disables automatic folder watching and restarts the watcher.
func (a *App) SetWatchFolderEnabled(enabled bool) error {
	a.config.WatchFolderEnabled = enabled
	if err := a.saveConfig(); err != nil {
		return err
	}
	a.startWatcher()
	return nil
}

// SaveGameProfile saves a game profile
func (a *App) SaveGameProfile(game string, profile GameProfile) error {
	a.configMu.Lock()
	if a.config.GameProfiles == nil {
		a.config.GameProfiles = make(map[string]GameProfile)
	}
	a.config.GameProfiles[game] = profile
	a.configMu.Unlock()
	return a.saveConfig()
}

// DeleteGameProfile deletes a game profile
func (a *App) DeleteGameProfile(game string) error {
	a.configMu.Lock()
	if a.config.GameProfiles != nil {
		delete(a.config.GameProfiles, game)
	}
	a.configMu.Unlock()
	return a.saveConfig()
}

// SaveRecentFieldValues persists the recent field values for autocomplete caching
func (a *App) SaveRecentFieldValues(values map[string][]string) error {
	a.configMu.Lock()
	a.config.RecentFieldValues = values
	a.configMu.Unlock()
	return a.saveConfig()
}
