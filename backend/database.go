package backend

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
	mu   sync.Mutex
}

func (a *App) initDB() error {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "AmonHen")
	os.MkdirAll(dir, 0755)

	dbPath := filepath.Join(dir, "amonhen.db")
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	a.db = &DB{conn: conn}
	return a.db.migrate()
}

func (db *DB) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS yt_videos (
			id TEXT PRIMARY KEY,
			title TEXT,
			description TEXT,
			published_at TEXT,
			thumbnail_url TEXT,
			view_count INTEGER,
			like_count INTEGER,
			duration TEXT,
			privacy TEXT,
			local_file TEXT,
			synced_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS yt_playlists (
			id TEXT PRIMARY KEY,
			title TEXT,
			description TEXT,
			video_count INTEGER,
			thumbnail_url TEXT,
			published_at TEXT,
			synced_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS yt_playlist_items (
			playlist_id TEXT,
			video_id TEXT,
			position INTEGER,
			PRIMARY KEY (playlist_id, video_id)
		)`,
		`CREATE TABLE IF NOT EXISTS api_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ts INTEGER NOT NULL,
			operation TEXT NOT NULL,
			resource_id TEXT NOT NULL DEFAULT '',
			resource_title TEXT NOT NULL DEFAULT '',
			success INTEGER NOT NULL DEFAULT 1,
			error_msg TEXT NOT NULL DEFAULT '',
			quota_cost INTEGER NOT NULL DEFAULT 0,
			duration_ms INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS steam_app_cache (
			game_name TEXT PRIMARY KEY,
			app_id TEXT NOT NULL
		)`,
	}
	
	// Migración manual para añadir columnas si no existen (ignorar error si ya existen)
	db.conn.Exec("ALTER TABLE yt_playlists ADD COLUMN published_at TEXT")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN game_tag TEXT")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN episode INTEGER")

	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return fmt.Errorf("failed to execute migration: %v - error: %w", q, err)
		}
	}
	return nil
}
