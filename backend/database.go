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
	dir := filepath.Join(base, appDirName())
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
			game_tag TEXT,
			episode INTEGER,
			monetization_status TEXT DEFAULT 'monetized',
			rejection_reason TEXT DEFAULT '',
			status_issues TEXT DEFAULT '',
			custom_thumb_updated_at INTEGER DEFAULT 0,
			synced_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS yt_playlists (
			id TEXT PRIMARY KEY,
			title TEXT,
			description TEXT,
			video_count INTEGER,
			thumbnail_url TEXT,
			published_at TEXT,
			synced_at INTEGER,
			privacy TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS yt_playlist_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			playlist_id TEXT,
			video_id TEXT,
			position INTEGER
		)`,
		`CREATE INDEX IF NOT EXISTS idx_yt_playlist_items_pl ON yt_playlist_items(playlist_id, position)`,
		`CREATE INDEX IF NOT EXISTS idx_yt_playlist_items_vid ON yt_playlist_items(video_id)`,
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
		`CREATE TABLE IF NOT EXISTS steam_games (
			appid INTEGER PRIMARY KEY,
			name TEXT,
			playtime_forever INTEGER,
			playtime_2weeks INTEGER,
			header_url TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS steam_game_details (
			appid INTEGER PRIMARY KEY,
			developers TEXT,
			publishers TEXT,
			synced_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS steam_tags (
			appid INTEGER,
			tag TEXT,
			PRIMARY KEY (appid, tag)
		)`,
		`CREATE TABLE IF NOT EXISTS steam_achievements (
			appid INTEGER PRIMARY KEY,
			total_achievements INTEGER,
			achieved INTEGER,
			progress_percent REAL
		)`,
		`CREATE TABLE IF NOT EXISTS steam_publishers (
			appid INTEGER,
			publisher TEXT,
			PRIMARY KEY (appid, publisher)
		)`,
		`CREATE TABLE IF NOT EXISTS steam_developers (
			appid INTEGER,
			developer TEXT,
			PRIMARY KEY (appid, developer)
		)`,
		`CREATE TABLE IF NOT EXISTS upload_sessions (
			video_path TEXT PRIMARY KEY,
			upload_url TEXT NOT NULL,
			total_bytes INTEGER NOT NULL,
			bytes_uploaded INTEGER DEFAULT 0,
			file_mtime INTEGER DEFAULT 0,
			title TEXT,
			description TEXT,
			privacy TEXT,
			playlist_id TEXT,
			game_tag TEXT,
			episode INTEGER DEFAULT 0,
			status TEXT DEFAULT 'uploading',
			updated_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS steam_backlog_queue (
			appid INTEGER PRIMARY KEY,
			rank_order INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'candidate',
			notes TEXT NOT NULL DEFAULT '',
			added_at INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS steam_game_ratings (
			appid INTEGER PRIMARY KEY,
			tier TEXT NOT NULL DEFAULT 'A',
			score INTEGER NOT NULL DEFAULT 8,
			notes TEXT NOT NULL DEFAULT '',
			updated_at INTEGER NOT NULL DEFAULT 0
		)`,
	}
	
	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return fmt.Errorf("migration failed on query: %w", err)
		}
	}

	// Migración manual para añadir columnas si no existen (ignorar error si ya existen)
	db.conn.Exec("ALTER TABLE yt_playlists ADD COLUMN published_at TEXT")
	db.conn.Exec("ALTER TABLE yt_playlists ADD COLUMN privacy TEXT")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN game_tag TEXT")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN episode INTEGER")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN monetization_status TEXT DEFAULT 'monetized'")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN rejection_reason TEXT DEFAULT ''")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN status_issues TEXT DEFAULT ''")
	db.conn.Exec("ALTER TABLE yt_videos ADD COLUMN custom_thumb_updated_at INTEGER DEFAULT 0")
	db.conn.Exec("ALTER TABLE upload_sessions ADD COLUMN thumbnail_path TEXT")

	// Migrate yt_playlist_items if legacy composite primary key exists
	var isCompositePK bool
	rows, pErr := db.conn.Query("PRAGMA table_info(yt_playlist_items)")
	if pErr == nil {
		var pkCount int
		for rows.Next() {
			var cid int
			var name, ctype string
			var notnull, pk int
			var dfltValue sql.NullString
			if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err == nil {
				if pk > 0 && (name == "playlist_id" || name == "video_id") {
					pkCount++
				}
			}
		}
		rows.Close()
		if pkCount >= 2 {
			isCompositePK = true
		}
	}
	if isCompositePK {
		db.conn.Exec(`
			CREATE TABLE IF NOT EXISTS yt_playlist_items_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				playlist_id TEXT,
				video_id TEXT,
				position INTEGER
			);
			INSERT INTO yt_playlist_items_new (playlist_id, video_id, position)
			SELECT playlist_id, video_id, position FROM yt_playlist_items;
			DROP TABLE yt_playlist_items;
			ALTER TABLE yt_playlist_items_new RENAME TO yt_playlist_items;
		`)
	}

	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return fmt.Errorf("failed to execute migration: %v - error: %w", q, err)
		}
	}

	// Clean up bogus corporate suffix rows from steam_publishers
	db.conn.Exec(`DELETE FROM steam_publishers WHERE LOWER(TRIM(publisher)) IN ('inc.', 'inc', 'ltd.', 'ltd', 'llc', 'l.l.c.', 's.a.', 's.a', 'gmbh', 'co.', 'co', 'corp.', 'corp', 'corporation', 'interactive entertainment')`)

	// Backfill steam_publishers and steam_developers from steam_game_details
	pRows, err := db.conn.Query("SELECT appid, developers, publishers FROM steam_game_details WHERE developers != '' OR publishers != ''")
	if err == nil {
		type backfillItem struct {
			appid int
			devs  string
			pubs  string
		}
		var items []backfillItem
		for pRows.Next() {
			var appid int
			var devs, pubs string
			if err := pRows.Scan(&appid, &devs, &pubs); err == nil {
				items = append(items, backfillItem{appid: appid, devs: devs, pubs: pubs})
			}
		}
		pRows.Close()

		for _, item := range items {
			for _, p := range splitSteamCompanies(item.pubs) {
				if p != "" {
					db.conn.Exec("INSERT OR IGNORE INTO steam_publishers (appid, publisher) VALUES (?, ?)", item.appid, p)
				}
			}
			for _, d := range splitSteamCompanies(item.devs) {
				if d != "" {
					db.conn.Exec("INSERT OR IGNORE INTO steam_developers (appid, developer) VALUES (?, ?)", item.appid, d)
				}
			}
		}
	}

	return nil
}
