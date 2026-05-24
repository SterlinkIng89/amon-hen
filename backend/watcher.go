package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// supportedVideoExts is the set of extensions the watcher reacts to.
var supportedVideoExts = map[string]bool{
	".mp4":  true,
	".mkv":  true,
	".webm": true,
	".mov":  true,
	".avi":  true,
}

// isTempVideoFile returns true for temp/partial files that should be ignored.
func isTempVideoFile(path string) bool {
	base := filepath.Base(path)
	return strings.HasPrefix(base, ".") ||
		strings.HasPrefix(base, "~") ||
		strings.HasSuffix(base, ".tmp") ||
		strings.HasSuffix(base, ".part") ||
		strings.HasSuffix(base, ".crdownload")
}

// FolderWatcher watches configured folders for new video files.
type FolderWatcher struct {
	watcher *fsnotify.Watcher
	stopCh  chan struct{}
	mu      sync.Mutex
}

// stopWatcher tears down the current watcher if running.
func (a *App) stopWatcher() {
	if a.watcher == nil {
		return
	}
	a.watcher.mu.Lock()
	defer a.watcher.mu.Unlock()
	if a.watcher.stopCh != nil {
		close(a.watcher.stopCh)
		a.watcher.stopCh = nil
	}
	if a.watcher.watcher != nil {
		a.watcher.watcher.Close()
		a.watcher.watcher = nil
	}
	a.watcher = nil
}

// startWatcher starts watching all configured folders for new video files.
// It is a no-op if WatchFolderEnabled is false or no folders are configured.
// Call this after config changes that affect folders.
func (a *App) startWatcher() {
	a.stopWatcher()

	if !a.config.WatchFolderEnabled {
		return
	}
	if len(a.config.Folders) == 0 {
		return
	}

	w, err := fsnotify.NewWatcher()
	if err != nil {
		fmt.Println("Failed to create folder watcher:", err)
		return
	}

	fw := &FolderWatcher{
		watcher: w,
		stopCh:  make(chan struct{}),
	}
	a.watcher = fw

	// Add each folder (and subdirectories when recursive is on)
	for _, folder := range a.config.Folders {
		fSettings := a.GetFolderSettings(folder)
		if fSettings.Recursive {
			filepath.WalkDir(folder, func(path string, d os.DirEntry, walkErr error) error {
				if walkErr != nil || !d.IsDir() {
					return nil
				}
				if addErr := w.Add(path); addErr != nil {
					fmt.Printf("Watcher: cannot watch %s: %v\n", path, addErr)
				}
				return nil
			})
		} else {
			if addErr := w.Add(folder); addErr != nil {
				fmt.Printf("Watcher: cannot watch %s: %v\n", folder, addErr)
			}
		}
	}

	go func() {
		// Per-path debounce: track a pending timer for each file to avoid
		// emitting events while a file is still being written.
		type pending struct {
			timer *time.Timer
		}
		debounce := make(map[string]*pending)
		var dmu sync.Mutex

		for {
			select {
			case event, ok := <-w.Events:
				if !ok {
					return
				}
				// Only react to file creation / rename (moved-in)
				if !event.Has(fsnotify.Create) && !event.Has(fsnotify.Rename) {
					continue
				}
				ext := strings.ToLower(filepath.Ext(event.Name))
				if !supportedVideoExts[ext] || isTempVideoFile(event.Name) {
					continue
				}

				dmu.Lock()
				if p, exists := debounce[event.Name]; exists {
					p.timer.Stop()
				}
				name := event.Name // capture for closure
				t := time.AfterFunc(2*time.Second, func() {
					// Verify the file is still there before emitting
					if _, statErr := os.Stat(name); statErr == nil {
						runtime.EventsEmit(a.ctx, "files:new", name)
						fmt.Printf("Watcher: new video detected: %s\n", name)
					}
					dmu.Lock()
					delete(debounce, name)
					dmu.Unlock()
				})
				debounce[name] = &pending{timer: t}
				dmu.Unlock()

			case watchErr, ok := <-w.Errors:
				if !ok {
					return
				}
				fmt.Println("Watcher error:", watchErr)

			case <-fw.stopCh:
				// Cancel all pending debounce timers
				dmu.Lock()
				for _, p := range debounce {
					p.timer.Stop()
				}
				dmu.Unlock()
				return
			}
		}
	}()

	fmt.Printf("Folder watcher started — watching %d root(s)\n", len(a.config.Folders))
}
