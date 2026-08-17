package backend

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	youtube "google.golang.org/api/youtube/v3"
)

// App struct
type App struct {
	ctx        context.Context
	streamPort int
	cacheDir   string
	configPath string
	config     Config
	configMu   sync.RWMutex
	db         *DB
	// Cached YouTube service — reused across API calls to avoid redundant token refreshes
	ytSvc   *youtube.Service
	ytSvcMu sync.Mutex
	// Folder watcher — watches configured folders for new video files
	watcher *FolderWatcher
	// Active uploads tracking
	uploadsMu sync.Mutex
	uploads   map[string]context.CancelFunc
	// thumbSem limits concurrent ffmpeg/ffprobe processes for thumbnail generation.
	// Prevents CPU saturation when many clips are loaded at once.
	thumbSem chan struct{}
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		uploads: make(map[string]context.CancelFunc),
	}
}

// Startup is called when the app starts
func (a *App) Startup(ctx context.Context) {
	initSessionLogger()
	a.ctx = ctx
	a.initConfig()
	if err := a.initDB(); err != nil {
		fmt.Println("Failed to init database:", err)
	}
	a.initCache()
	a.startStreamServer()
	a.startWatcher()

	appLog("[App] Startup complete")

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

// Shutdown is called when the app is closing.
func (a *App) Shutdown(_ context.Context) {
	closeSessionLogger()
}

// LogFrontendEvent allows the frontend (React) to write directly to the session log file.
// This is exposed to Wails.
func (a *App) LogFrontendEvent(msg string) {
	appLog("[Frontend] %s", msg)
}

// CacheHandler exposes the cache directory over HTTP to the Wails frontend.
func (a *App) CacheHandler() http.Handler {
	return http.StripPrefix("/cache/", http.FileServer(http.Dir(a.cacheDir)))
}
