package backend

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// sessionLogger is the shared logger used throughout the backend.
// It writes to both stdout and the current session log file.
var sessionLogger *log.Logger

// sessionLogFile is kept open for the lifetime of the app so we can close it
// on shutdown. It may be nil if the logger could not be initialized.
var sessionLogFile *os.File

// initSessionLogger creates a new timestamped log file for this session inside
// %AppData%/AmonHen/logs/ and configures the package-level sessionLogger.
// It also prunes old log files so only the latest maxLogFiles are kept.
func initSessionLogger() {
	const maxLogFiles = 10

	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	logsDir := filepath.Join(base, "AmonHen", "logs")
	if mkErr := os.MkdirAll(logsDir, 0755); mkErr != nil {
		// Fallback: log only to stdout
		sessionLogger = log.New(os.Stdout, "", log.LstdFlags)
		return
	}

	// File name: amon-hen_session_YYYYMMDD_HHMMSS.log
	ts := time.Now().Format("20060102_150405")
	logPath := filepath.Join(logsDir, fmt.Sprintf("amon-hen_session_%s.log", ts))

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		sessionLogger = log.New(os.Stdout, "", log.LstdFlags)
		return
	}

	sessionLogFile = f
	mw := io.MultiWriter(os.Stdout, f)
	sessionLogger = log.New(mw, "", log.LstdFlags)

	sessionLogger.Printf("[Logger] Session started — log file: %s\n", logPath)

	// Prune old log files
	pruneOldLogs(logsDir, maxLogFiles)
}

// pruneOldLogs keeps only the newest maxKeep log files in dir, deleting the rest.
func pruneOldLogs(dir string, maxKeep int) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	var logFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), "amon-hen_session_") && strings.HasSuffix(e.Name(), ".log") {
			logFiles = append(logFiles, filepath.Join(dir, e.Name()))
		}
	}

	// Sort ascending (oldest first) by name — the timestamp format is sortable lexicographically
	sort.Strings(logFiles)

	if len(logFiles) > maxKeep {
		toDelete := logFiles[:len(logFiles)-maxKeep]
		for _, path := range toDelete {
			if err := os.Remove(path); err == nil {
				sessionLogger.Printf("[Logger] Pruned old log: %s\n", filepath.Base(path))
			}
		}
	}
}

// closeSessionLogger flushes and closes the log file. Call this on app shutdown.
func closeSessionLogger() {
	if sessionLogger != nil {
		sessionLogger.Println("[Logger] Session ended.")
	}
	if sessionLogFile != nil {
		sessionLogFile.Close()
		sessionLogFile = nil
	}
}

// appLog is the central logging helper. All backend code should call this
// instead of fmt.Println / log.Printf to ensure output goes to the session file.
// Usage: appLog("[SyncRecentVideos] Error: %v", err)
func appLog(format string, args ...interface{}) {
	if sessionLogger != nil {
		sessionLogger.Printf(format, args...)
	} else {
		fmt.Printf(format+"\n", args...)
	}
}
