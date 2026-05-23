package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	youtube "google.golang.org/api/youtube/v3"
)

type VideoMeta struct {
	Game         string `json:"game"`
	YouTubeTitle string `json:"youtubeTitle"`
	Description  string `json:"description"`
	Privacy      string `json:"privacy"`
	YouTubeID    string `json:"youtubeId,omitempty"`
	PlaylistID   string `json:"playlistId,omitempty"`
	Episode      int    `json:"episode"`
	DurationSecs int    `json:"durationSecs,omitempty"`
}

type FolderConfig struct {
	Recursive       bool `json:"recursive"`
	MaxDurationSecs int  `json:"max_duration_secs"`
}

// Config holds persistent application settings
type Config struct {
	Folders             []string             `json:"folders"`
	YouTubeClientID     string               `json:"youtube_client_id"`
	YouTubeClientSecret string               `json:"youtube_client_secret"`
	YouTubeTokenJSON    string                  `json:"youtube_token_json,omitempty"`
	VideoGames          map[string]string       `json:"video_games"`    // Maps path to game tag
	VideoMetadata       map[string]VideoMeta    `json:"video_metadata"` // Maps path to metadata
	FolderSettings      map[string]FolderConfig `json:"folder_settings"`
	WatchFolderEnabled  bool                    `json:"watch_folder_enabled"`
}

// App struct
type App struct {
	ctx        context.Context
	streamPort int
	cacheDir   string
	configPath string
	config     Config
	db         *DB
	// Cached YouTube service — reused across API calls to avoid redundant token refreshes
	ytSvc   *youtube.Service
	ytSvcMu sync.Mutex
	// Folder watcher — watches configured folders for new video files
	watcher *FolderWatcher
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.initConfig()
	if err := a.initDB(); err != nil {
		fmt.Println("Failed to init database:", err)
	}
	a.initCache()
	a.startStreamServer()
	a.startWatcher()

	// Auto-sync in background — but only if last sync was more than 12 hours ago
	// to avoid burning YouTube API quota on every app launch.
	go func() {
		time.Sleep(2 * time.Second)
		if !a.IsYouTubeAuthed() {
			return
		}
		status, err := a.GetSyncStatus()
		if err != nil {
			return
		}
		lastSync, _ := status["lastSync"].(int64)
		if lastSync > 0 && time.Since(time.Unix(lastSync, 0)) < 12*time.Hour {
			fmt.Printf("Skipping auto-sync: last sync was %s ago\n", time.Since(time.Unix(lastSync, 0)).Round(time.Minute))
			return
		}
		a.SyncChannelData()
	}()
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
	data, err := json.MarshalIndent(a.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}

// LoadConfig returns the current app configuration to the frontend
func (a *App) LoadConfig() Config {
	return a.config
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

// SetVideosPlaylist updates the playlist for multiple video paths
func (a *App) SetVideosPlaylist(paths []string, playlistId string) error {
	if a.config.VideoMetadata == nil {
		a.config.VideoMetadata = make(map[string]VideoMeta)
	}
	for _, p := range paths {
		meta := a.config.VideoMetadata[p]
		meta.PlaylistID = playlistId
		a.config.VideoMetadata[p] = meta
	}
	return a.saveConfig()
}

// SetVideoGames updates the game tag for multiple video paths and saves the config
func (a *App) SetVideoGames(paths []string, game string) error {
	if a.config.VideoGames == nil {
		a.config.VideoGames = make(map[string]string)
	}
	if a.config.VideoMetadata == nil {
		a.config.VideoMetadata = make(map[string]VideoMeta)
	}

	for _, p := range paths {
		if game == "" {
			delete(a.config.VideoGames, p)
			// Also update metadata if exists
			if meta, ok := a.config.VideoMetadata[p]; ok {
				meta.Game = ""
				meta.YouTubeTitle = "" // Force re-generation
				a.config.VideoMetadata[p] = meta
			}
		} else {
			a.config.VideoGames[p] = game
			// Sync with metadata
			meta := a.config.VideoMetadata[p]
			meta.Game = game
			meta.YouTubeTitle = "" // Force re-generation so it gets the new tag + episode
			a.config.VideoMetadata[p] = meta
		}
	}
	return a.saveConfig()
}

// SaveVideoMetadata updates all metadata for a specific video and saves the config
func (a *App) SaveVideoMetadata(path string, game string, ytTitle string, desc string, privacy string, playlistId string, episode int) error {
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
	}

	return a.saveConfig()
}

// DeleteFiles removes the given file paths from disk, config, and unlinks them
// from the yt_videos table (clears local_file without deleting the YouTube video).
func (a *App) DeleteFiles(paths []string) error {
	var errs []string
	for _, p := range paths {
		// Get info before deleting to calculate cache keys
		info, statErr := os.Stat(p)

		err := os.Remove(p)
		if err != nil {
			if !os.IsNotExist(err) {
				errs = append(errs, fmt.Sprintf("failed to delete %s: %v", filepath.Base(p), err))
			}
		}

		// Clean up cache if stat was successful
		if statErr == nil {
			key := cacheKey(p, info.ModTime())
			thumbPath := filepath.Join(a.cacheDir, "thumbs", key+".png")
			previewPath := filepath.Join(a.cacheDir, "previews", key+".jpg")
			os.Remove(thumbPath)
			os.Remove(previewPath)
		}

		// Unlink from yt_videos — clears local_file so the YouTube video
		// stays in the channel but is no longer linked to a local file.
		if a.db != nil {
			a.db.mu.Lock()
			a.db.conn.Exec(
				`UPDATE yt_videos SET local_file = NULL WHERE local_file = ?`, p,
			)
			a.db.mu.Unlock()
		}

		delete(a.config.VideoGames, p)
		delete(a.config.VideoMetadata, p)
	}
	a.saveConfig()
	if len(errs) > 0 {
		return fmt.Errorf("some files could not be deleted: %s", strings.Join(errs, ", "))
	}
	return nil
}

// initCache sets up the on-disk cache directory
func (a *App) initCache() {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}
	a.cacheDir = filepath.Join(base, "AmonHen", "cache")
	os.MkdirAll(filepath.Join(a.cacheDir, "thumbs"), 0755)
	os.MkdirAll(filepath.Join(a.cacheDir, "previews"), 0755)
	fmt.Println("Cache directory:", a.cacheDir)
}

// cacheKey builds a unique filename from path + mod time
func cacheKey(path string, modTime time.Time) string {
	raw := fmt.Sprintf("%s|%d", path, modTime.UnixNano())
	sum := md5.Sum([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// GetCacheDir exposes the cache directory path to the frontend
func (a *App) GetCacheDir() string {
	return a.cacheDir
}

// startStreamServer starts a local HTTP server to stream video files with range support
func (a *App) startStreamServer() {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Println("Failed to start stream server:", err)
		return
	}
	a.streamPort = listener.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("/stream", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Range")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}
		ext := strings.ToLower(filepath.Ext(path))
		switch ext {
		case ".mp4":
			w.Header().Set("Content-Type", "video/mp4")
		case ".mkv":
			w.Header().Set("Content-Type", "video/x-matroska")
		case ".webm":
			w.Header().Set("Content-Type", "video/webm")
		case ".mov":
			w.Header().Set("Content-Type", "video/quicktime")
		case ".avi":
			w.Header().Set("Content-Type", "video/x-msvideo")
		default:
			w.Header().Set("Content-Type", "application/octet-stream")
		}
		http.ServeFile(w, r, path)
	})

	go func() {
		if err := http.Serve(listener, mux); err != nil {
			fmt.Println("Stream server error:", err)
		}
	}()
	fmt.Printf("Stream server running on port %d\n", a.streamPort)
}

// GetStreamPort returns the local HTTP stream server port
func (a *App) GetStreamPort() int {
	return a.streamPort
}

// OpenFolderDialog opens a native OS folder picker dialog (kept for compat)
func (a *App) OpenFolderDialog() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select video folder",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
}

// VideoFile represents a video file found during scanning
// generateYouTubeTitle replicates the frontend logic to create a suggested title
func generateYouTubeTitle(filename string, game string, episode int) string {
	// Pattern: YYYY-MM-DD
	re := regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})`)
	stem := strings.TrimSuffix(filename, filepath.Ext(filename))
	match := re.FindStringSubmatch(stem)

	dateStr := ""
	if match != nil {
		year, month, day := match[1], match[2], match[3]
		d := strings.TrimLeft(day, "0")
		if d == "" {
			d = "0"
		}
		y := year[len(year)-2:]
		dateStr = fmt.Sprintf("%s/%s/%s", d, month, y)
	} else {
		now := time.Now()
		dateStr = fmt.Sprintf("%d/%02d/%s", now.Day(), now.Month(), now.Format("06"))
	}

	if game == "" {
		return dateStr
	}

	epSuffix := ""
	if episode > 0 {
		epSuffix = fmt.Sprintf(" - %d", episode)
	}

	return fmt.Sprintf("%s - %s%s", game, dateStr, epSuffix)
}

type VideoFile struct {
	Name          string `json:"name"`
	Path          string `json:"path"`
	Size          int64  `json:"size"`
	ModTime       int64  `json:"modTime"` // Unix timestamp in milliseconds
	Folder        string `json:"folder"`  // Source folder path
	Game          string `json:"game"`    // Game tag from config
	YouTubeTitle  string `json:"youtubeTitle"`
	Description   string `json:"description"`
	Privacy       string `json:"privacy"`
	YouTubeID     string `json:"youtubeId,omitempty"`
	PlaylistID    string `json:"playlistId,omitempty"`
	PlaylistTitle string `json:"playlistTitle,omitempty"`
	Episode       int    `json:"episode"`
}

// episodeCountForTag counts YouTube videos whose title starts with "<tag> - ".
// This works for 1000+ pre-existing videos that have no game_tag in the DB,
// because the title format is always "<tag> - <date>".
// It also takes into account any explicitly-set episodes via game_tag+episode columns.
func (a *App) episodeCountForTag(tag string) int {
	if tag == "" {
		return 0
	}

	// Pattern: title starts exactly with "<tag> - "
	titlePattern := tag + " - %"

	var titleCount, maxEpisode int
	// Count by title match (covers pre-existing 1000+ videos)
	a.db.conn.QueryRow(
		`SELECT COUNT(*) FROM yt_videos WHERE title LIKE ?`, titlePattern,
	).Scan(&titleCount)

	// Also check explicit episode numbers stored via this app's upload workflow
	a.db.conn.QueryRow(
		`SELECT COALESCE(MAX(episode), 0) FROM yt_videos WHERE game_tag = ? AND episode IS NOT NULL AND episode > 0`, tag,
	).Scan(&maxEpisode)

	// Return whichever is larger — title count covers all historical uploads,
	// max episode covers cases where episodes were manually set.
	if maxEpisode > titleCount {
		return maxEpisode
	}
	return titleCount
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

// getVideoDuration uses ffprobe to get duration in seconds.
func getVideoDuration(path string) (int, error) {
	cmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	durStr := strings.TrimSpace(string(out))
	if durStr == "N/A" || durStr == "" {
		return 0, fmt.Errorf("duration N/A")
	}
	durFloat, err := strconv.ParseFloat(durStr, 64)
	if err != nil {
		return 0, err
	}
	return int(durFloat), nil
}

// GetVideosFromFolders scans multiple directories and returns a merged result
func (a *App) GetVideosFromFolders(folders []string) ([]VideoFile, error) {
	supported := map[string]bool{
		".mp4":  true,
		".mkv":  true,
		".webm": true,
		".mov":  true,
		".avi":  true,
	}
	var videos []VideoFile

	// Pre-load playlist info and linked files from DB
	a.db.mu.Lock()
	pMap := make(map[string]string)        // yt_id -> playlist_id
	pTitleMap := make(map[string]string)   // yt_id -> playlist_title
	linkedFiles := make(map[string]string) // filename -> yt_id (fallback matching)
	pathMap := make(map[string]string)     // full_path -> yt_id

	rows, err := a.db.conn.Query(`
		SELECT pi.video_id, pi.playlist_id, p.title 
		FROM yt_playlist_items pi
		JOIN yt_playlists p ON pi.playlist_id = p.id
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var vid, pid, ptitle string
			if err := rows.Scan(&vid, &pid, &ptitle); err == nil {
				pMap[vid] = pid
				pTitleMap[vid] = ptitle
			}
		}
	}

	// Fetch linked video paths for matching
	vRows, err := a.db.conn.Query(`SELECT id, local_file FROM yt_videos WHERE local_file IS NOT NULL AND local_file != ''`)
	if err == nil {
		defer vRows.Close()
		for vRows.Next() {
			var id string
			var lpath sql.NullString
			if err := vRows.Scan(&id, &lpath); err == nil {
				if lpath.Valid && lpath.String != "" {
					pathMap[lpath.String] = id
					linkedFiles[filepath.Base(lpath.String)] = id
				}
			}
		}
	}
	a.db.mu.Unlock()

	// First pass: scan all files and load metadata
	configChanged := false
	for _, dir := range folders {
		fSettings := a.GetFolderSettings(dir)

		filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				// If not recursive, skip subdirectories except the base dir itself
				if !fSettings.Recursive && path != dir {
					return filepath.SkipDir
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(d.Name()))
			if !supported[ext] {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				return nil
			}

			meta := a.config.VideoMetadata[path]

			// Filter by max duration if set
			if fSettings.MaxDurationSecs > 0 {
				if meta.DurationSecs == 0 {
					// Fetch and cache duration
					dur, err := getVideoDuration(path)
					if err == nil && dur > 0 {
						meta.DurationSecs = dur
						if a.config.VideoMetadata == nil {
							a.config.VideoMetadata = make(map[string]VideoMeta)
						}
						a.config.VideoMetadata[path] = meta
						configChanged = true
					} else {
						// If we can't read duration, we assume it's long to be safe, or just skip filtering?
						// We'll skip it to not exclude valid files if ffprobe fails, but for now we set it to something high so it's filtered if it's over limit, wait, if we can't read we skip it entirely from result.
						// Let's just set it to 999999 to skip it from clips but not scan it again.
						meta.DurationSecs = 999999
						a.config.VideoMetadata[path] = meta
						configChanged = true
					}
				}
				if meta.DurationSecs > fSettings.MaxDurationSecs {
					return nil // skip this file
				}
			}

			videos = append(videos, VideoFile{
				Name:          d.Name(),
				Path:          path,
				Size:          info.Size(),
				ModTime:       info.ModTime().UnixMilli(),
				Folder:        dir,
				Game:          meta.Game,
				YouTubeTitle:  meta.YouTubeTitle,
				Description:   meta.Description,
				Privacy:       meta.Privacy,
				YouTubeID:     meta.YouTubeID,
				PlaylistID:    meta.PlaylistID,
				PlaylistTitle: pTitleMap[meta.YouTubeID],
				Episode:       meta.Episode,
			})

			vIdx := len(videos) - 1
			// Fallback 1: Match by full path in DB
			if videos[vIdx].YouTubeID == "" {
				if id, ok := pathMap[path]; ok {
					videos[vIdx].YouTubeID = id
				}
			}
			// Fallback 2: Match by filename in DB (useful if file was moved)
			if videos[vIdx].YouTubeID == "" {
				if id, ok := linkedFiles[d.Name()]; ok {
					videos[vIdx].YouTubeID = id
				}
			}

			// Fallback playlist ID if missing in config but found in DB
			if videos[vIdx].PlaylistID == "" && videos[vIdx].YouTubeID != "" {
				videos[vIdx].PlaylistID = pMap[videos[vIdx].YouTubeID]
				videos[vIdx].PlaylistTitle = pTitleMap[videos[vIdx].YouTubeID]
			}
			return nil
		})
	}

	if configChanged {
		a.saveConfig()
	}

	// Second pass: Sort by ModTime (ascending) and assign episode numbers
	sort.Slice(videos, func(i, j int) bool {
		return videos[i].ModTime < videos[j].ModTime
	})

	// Build per-tag episode counters using title-based counting from YouTube DB.
	// This correctly counts pre-existing YT videos that match "<tag> - %",
	// covering the scenario where 1000+ videos predate this app's upload workflow.
	localCounters := make(map[string]int)

	for i := range videos {
		game := videos[i].Game
		if game == "" {
			continue
		}

		// Lazily compute the starting count for this tag (once per unique tag)
		if _, seen := localCounters[game]; !seen {
			a.db.mu.Lock()
			localCounters[game] = a.episodeCountForTag(game)
			a.db.mu.Unlock()
		}

		// Only assign a new episode number if not yet set
		if videos[i].Episode == 0 {
			localCounters[game]++
			videos[i].Episode = localCounters[game]
		} else {
			// Keep the counter at least at this video's episode
			if videos[i].Episode > localCounters[game] {
				localCounters[game] = videos[i].Episode
			}
		}

		// Auto-generate title if none saved yet
		if videos[i].YouTubeTitle == "" {
			videos[i].YouTubeTitle = generateYouTubeTitle(videos[i].Name, videos[i].Game, videos[i].Episode)
		}
	}

	return videos, nil
}

// GetVideos scans a single directory (backward compat)
func (a *App) GetVideos(dirPath string) ([]VideoFile, error) {
	return a.GetVideosFromFolders([]string{dirPath})
}

// readCached reads a cached image file and returns it as a base64 data URL
func readCached(cachePath string, mimeType string) (string, bool) {
	data, err := os.ReadFile(cachePath)
	if err != nil {
		return "", false
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	return "data:" + mimeType + ";base64," + encoded, true
}

// writeCached writes raw image bytes to a cache file
func writeCached(cachePath string, data []byte) {
	if err := os.WriteFile(cachePath, data, 0644); err != nil {
		fmt.Println("Cache write error:", err)
	}
}

// GetThumbnail returns a base64 PNG thumbnail for a video file
func (a *App) GetThumbnail(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	cachePath := filepath.Join(a.cacheDir, "thumbs", key+".png")

	if cached, ok := readCached(cachePath, "image/png"); ok {
		return cached, nil
	}

	cmd := exec.Command(
		"ffmpeg",
		"-ss", "00:00:01",
		"-i", path,
		"-vframes", "1",
		"-vf", "scale=320:-1",
		"-f", "image2",
		"-c:v", "png",
		"-",
	)
	hideWindow(cmd)
	var buffer bytes.Buffer
	cmd.Stdout = &buffer
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate thumbnail: %w", err)
	}
	raw := buffer.Bytes()
	writeCached(cachePath, raw)
	encoded := base64.StdEncoding.EncodeToString(raw)
	return "data:image/png;base64," + encoded, nil
}

// RegenerateThumbnail deletes the cached thumbnail and preview for a file,
// then generates and returns a fresh thumbnail. Call this when the user wants
// to force a new frame capture.
func (a *App) RegenerateThumbnail(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	thumbPath := filepath.Join(a.cacheDir, "thumbs", key+".png")
	previewPath := filepath.Join(a.cacheDir, "previews", key+".jpg")

	// Delete cached files so GetThumbnail / GetVideoPreview re-generate
	os.Remove(thumbPath)
	os.Remove(previewPath)

	// Generate fresh thumbnail
	return a.GetThumbnail(path)
}

// GetVideoPreview generates a 5x5 sprite sheet preview for a video file
func (a *App) GetVideoPreview(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %w", err)
	}
	key := cacheKey(path, info.ModTime())
	cachePath := filepath.Join(a.cacheDir, "previews", key+".jpg")

	if cached, ok := readCached(cachePath, "image/jpeg"); ok {
		return cached, nil
	}

	cmd := exec.Command(
		"ffmpeg",
		"-i", path,
		"-vf", "select=not(mod(n,100)),scale=160:-1,tile=5x5",
		"-frames:v", "1",
		"-q:v", "5",
		"-f", "image2",
		"-c:v", "mjpeg",
		"-",
	)
	hideWindow(cmd)
	var buffer bytes.Buffer
	cmd.Stdout = &buffer
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate preview: %w", err)
	}
	raw := buffer.Bytes()
	writeCached(cachePath, raw)
	encoded := base64.StdEncoding.EncodeToString(raw)
	return "data:image/jpeg;base64," + encoded, nil
}

// GetVideoDuration returns the duration of the video in seconds using ffprobe
func (a *App) GetVideoDuration(path string) (float64, error) {
	cmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path)
	hideWindow(cmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 0, err
	}
	var duration float64
	fmt.Sscanf(strings.TrimSpace(out.String()), "%f", &duration)
	return duration, nil
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
