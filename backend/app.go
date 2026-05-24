package backend

import (
	"context"
	"fmt"
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

// Startup is called when the app starts
func (a *App) Startup(ctx context.Context) {
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
