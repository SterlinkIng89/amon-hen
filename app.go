package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type VideoMeta struct {
	YouTubeTitle string `json:"youtube_title"`
	Description  string `json:"description"`
	Privacy      string `json:"privacy"`
	YouTubeID    string `json:"youtube_id,omitempty"`
}

// Config holds persistent application settings
type Config struct {
	Folders             []string             `json:"folders"`
	YouTubeClientID     string               `json:"youtube_client_id"`
	YouTubeClientSecret string               `json:"youtube_client_secret"`
	YouTubeTokenJSON    string               `json:"youtube_token_json,omitempty"`
	VideoGames          map[string]string    `json:"video_games"`    // Maps path to game tag
	VideoMetadata       map[string]VideoMeta `json:"video_metadata"` // Maps path to metadata
}

// App struct
type App struct {
	ctx        context.Context
	streamPort int
	cacheDir   string
	configPath string
	config     Config
	db         *DB
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

	// Intentar sincronización en background
	go func() {
		// Wait a bit to not block startup
		time.Sleep(2 * time.Second)
		if a.IsYouTubeAuthed() {
			a.SyncChannelData()
		}
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
	return a.saveConfig()
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
	return dir, a.saveConfig()
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

// SetVideoGames updates the game tag for multiple video paths and saves the config
func (a *App) SetVideoGames(paths []string, game string) error {
	if a.config.VideoGames == nil {
		a.config.VideoGames = make(map[string]string)
	}
	for _, p := range paths {
		if game == "" {
			delete(a.config.VideoGames, p)
		} else {
			a.config.VideoGames[p] = game
		}
	}
	return a.saveConfig()
}

// SaveVideoMetadata updates all metadata for a specific video and saves the config
func (a *App) SaveVideoMetadata(path string, game string, ytTitle string, desc string, privacy string) error {
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
		YouTubeTitle: ytTitle,
		Description:  desc,
		Privacy:      privacy,
	}

	return a.saveConfig()
}

// DeleteFiles removes the given file paths from disk and from the config
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
type VideoFile struct {
	Name         string `json:"name"`
	Path         string `json:"path"`
	Size         int64  `json:"size"`
	ModTime      int64  `json:"modTime"` // Unix timestamp in milliseconds
	Folder       string `json:"folder"`  // Source folder path
	Game         string `json:"game"`    // Game tag from config
	YouTubeTitle string `json:"youtubeTitle"`
	Description  string `json:"description"`
	Privacy      string `json:"privacy"`
	YouTubeID    string `json:"youtubeId,omitempty"`
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
	for _, dir := range folders {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if supported[ext] {
				path := filepath.Join(dir, entry.Name())
				info, err := entry.Info()
				if err != nil {
					continue
				}
				meta := a.config.VideoMetadata[path]
				videos = append(videos, VideoFile{
					Name:         entry.Name(),
					Path:         path,
					Size:         info.Size(),
					ModTime:      info.ModTime().UnixMilli(),
					Folder:       dir,
					Game:         a.config.VideoGames[path],
					YouTubeTitle: meta.YouTubeTitle,
					Description:  meta.Description,
					Privacy:      meta.Privacy,
					YouTubeID:    meta.YouTubeID,
				})
			}
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
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 0, err
	}
	var duration float64
	fmt.Sscanf(strings.TrimSpace(out.String()), "%f", &duration)
	return duration, nil
}
