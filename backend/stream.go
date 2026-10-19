package backend

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// startStreamServer starts a local HTTP server to stream video files with range support.
func (a *App) startStreamServer() {
	a.streamMu.Lock()
	defer a.streamMu.Unlock()
	a.startStreamServerLocked()
}

func (a *App) startStreamServerLocked() {
	if a.streamPort.Load() > 0 && a.streamSrv != nil {
		return
	}

	var listener net.Listener
	var err error

	// Retry binding up to 3 times in case of transient port/socket allocation failure
	for attempt := 1; attempt <= 3; attempt++ {
		listener, err = net.Listen("tcp", "127.0.0.1:0")
		if err == nil {
			break
		}
		appLog("[Stream] Attempt %d: Failed to bind stream server listener: %v", attempt, err)
		time.Sleep(time.Duration(attempt*100) * time.Millisecond)
	}

	if err != nil {
		appLog("[Stream] Failed to start stream server after retries: %v", err)
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "stream:error", fmt.Sprintf("Failed to bind stream server: %v", err))
		}
		return
	}

	port := listener.Addr().(*net.TCPAddr).Port
	a.streamPort.Store(int32(port))

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

	srv := &http.Server{
		Handler: mux,
	}
	a.streamSrv = srv

	go func(s *http.Server, l net.Listener, p int) {
		appLog("[Stream] Stream server running on port %d", p)
		if serveErr := s.Serve(l); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			appLog("[Stream] Stream server error on port %d: %v", p, serveErr)
			a.streamMu.Lock()
			if a.streamPort.Load() == int32(p) {
				a.streamPort.Store(0)
				a.streamSrv = nil
			}
			a.streamMu.Unlock()

			if a.ctx != nil {
				runtime.EventsEmit(a.ctx, "stream:error", fmt.Sprintf("Stream server stopped: %v", serveErr))
			}
		}
	}(srv, listener, port)
}

// GetStreamPort returns the local HTTP stream server port, starting it if not yet running
func (a *App) GetStreamPort() int {
	port := int(a.streamPort.Load())
	if port > 0 {
		return port
	}

	a.streamMu.Lock()
	defer a.streamMu.Unlock()
	if a.streamPort.Load() == 0 {
		a.startStreamServerLocked()
	}
	return int(a.streamPort.Load())
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
