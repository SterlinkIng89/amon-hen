package backend

import (
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
	watcher                *fsnotify.Watcher
	stopCh                 chan struct{}
	mu                     sync.Mutex
	inFlight               map[string]struct{}
	inFlightMu             sync.Mutex
	stabilityCheckInterval time.Duration
	stabilityChecks        int
	stabilityMaxWait       time.Duration
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
	appLog("[Watcher] Stopped")
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
		appLog("[Watcher] Failed to create folder watcher: %v", err)
		return
	}

	fw := &FolderWatcher{
		watcher:  w,
		stopCh:   make(chan struct{}),
		inFlight: make(map[string]struct{}),
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
					appLog("[Watcher] Cannot watch %s: %v", path, addErr)
				}
				return nil
			})
		} else {
			if addErr := w.Add(folder); addErr != nil {
				appLog("[Watcher] Cannot watch %s: %v", folder, addErr)
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
				// React to file creation, rename (moved-in), or writes
				isCreateOrRename := event.Has(fsnotify.Create) || event.Has(fsnotify.Rename)
				isWrite := event.Has(fsnotify.Write)
				if !isCreateOrRename && !isWrite {
					continue
				}
				ext := strings.ToLower(filepath.Ext(event.Name))
				if !supportedVideoExts[ext] || isTempVideoFile(event.Name) {
					continue
				}

				a.maybeAutoBackup(fw, event.Name)

				if !isCreateOrRename {
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
						appLog("[Watcher] New video detected: %s", name)
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
				appLog("[Watcher] Error: %v", watchErr)

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

	appLog("[Watcher] Started — watching %d root(s)", len(a.config.Folders))
}

// resolveWatchedFolderRoot finds the most specific configured folder root containing filePath.
func (a *App) resolveWatchedFolderRoot(filePath string) (string, bool) {
	absFile := normalizePath(filePath)

	a.configMu.RLock()
	folders := make([]string, len(a.config.Folders))
	copy(folders, a.config.Folders)
	a.configMu.RUnlock()

	bestRoot := ""
	bestLen := -1

	for _, folder := range folders {
		absRoot := normalizePath(folder)
		if !isPathWithinRoot(absRoot, absFile, false) {
			continue
		}

		fSettings := a.GetFolderSettings(folder)
		if !fSettings.Recursive && !strings.EqualFold(filepath.Dir(absFile), absRoot) {
			continue
		}

		if len(absRoot) > bestLen {
			bestLen = len(absRoot)
			bestRoot = folder
		}
	}

	return bestRoot, bestRoot != ""
}

// maybeAutoBackup schedules a debounced stability wait and background backup for filePath
// when its watched folder has AutoBackup enabled and BackupFolder is configured.
func (a *App) maybeAutoBackup(fw *FolderWatcher, filePath string) {
	if fw == nil {
		return
	}
	if strings.TrimSpace(a.GetBackupFolder()) == "" {
		return
	}
	folderRoot, ok := a.resolveWatchedFolderRoot(filePath)
	if !ok {
		return
	}
	if !a.GetFolderSettings(folderRoot).AutoBackup {
		return
	}

	fw.mu.Lock()
	stopCh := fw.stopCh
	fw.mu.Unlock()
	if stopCh == nil {
		return
	}
	select {
	case <-stopCh:
		return
	default:
	}

	key := strings.ToLower(normalizePath(filePath))
	fw.inFlightMu.Lock()
	if fw.inFlight == nil {
		fw.inFlight = make(map[string]struct{})
	}
	if _, exists := fw.inFlight[key]; exists {
		fw.inFlightMu.Unlock()
		return
	}
	fw.inFlight[key] = struct{}{}
	fw.inFlightMu.Unlock()

	go func() {
		defer func() {
			fw.inFlightMu.Lock()
			delete(fw.inFlight, key)
			fw.inFlightMu.Unlock()
		}()

		if err := waitForFileStableWithStop(filePath, fw.stabilityCheckInterval, fw.stabilityChecks, fw.stabilityMaxWait, stopCh); err != nil {
			select {
			case <-stopCh:
				return
			default:
			}
			appLog("[AutoBackup] Stability wait failed for %s: %v", filePath, err)
			a.emitBackupFileError(filePath, folderRoot, err)
			return
		}

		destPath, err := a.BackupSingleFile(filePath, folderRoot)
		if err != nil {
			appLog("[AutoBackup] Failed to backup %s: %v", filePath, err)
			a.emitBackupFileError(filePath, folderRoot, err)
			return
		}

		appLog("[AutoBackup] Backed up %s -> %s", filePath, destPath)
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "backup:file-completed", map[string]interface{}{
				"sourcePath": filePath,
				"backupPath": destPath,
				"folderRoot": folderRoot,
			})
		}
	}()
}

func (a *App) emitBackupFileError(sourcePath, folderRoot string, err error) {
	if a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "backup:file-error", map[string]interface{}{
		"sourcePath": sourcePath,
		"folderRoot": folderRoot,
		"error":      err.Error(),
	})
}
