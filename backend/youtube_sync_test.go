package backend

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *App {
	t.Helper()
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory sqlite: %v", err)
	}

	app := &App{
		db: &DB{conn: conn},
	}

	if err := app.db.migrate(); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	return app
}

func TestGetChannelPlaylists_DuplicateCount(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Insert playlists: pl1 has duplicates, pl2 has no duplicates, pl3 is empty
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, privacy)
		VALUES 
			('pl-1', 'Playlist With Dups', 'Desc 1', 5, '', '2026-01-02T00:00:00Z', 'public'),
			('pl-2', 'Clean Playlist', 'Desc 2', 3, '', '2026-01-01T00:00:00Z', 'unlisted'),
			('pl-3', 'Empty Playlist', 'Desc 3', 0, '', '2025-12-31T00:00:00Z', 'private');
	`)
	if err != nil {
		t.Fatalf("failed to insert playlists: %v", err)
	}

	// Insert playlist items:
	// pl-1 has: vid1, vid2, vid1, vid3, vid1 -> 5 items total, 3 distinct videos (vid1 appears 3 times -> 2 duplicates)
	// pl-2 has: vidA, vidB, vidC -> 3 items total, 3 distinct videos (0 duplicates)
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_playlist_items (playlist_id, video_id, position)
		VALUES 
			('pl-1', 'vid1', 0),
			('pl-1', 'vid2', 1),
			('pl-1', 'vid1', 2),
			('pl-1', 'vid3', 3),
			('pl-1', 'vid1', 4),
			('pl-2', 'vidA', 0),
			('pl-2', 'vidB', 1),
			('pl-2', 'vidC', 2);
	`)
	if err != nil {
		t.Fatalf("failed to insert playlist items: %v", err)
	}

	playlists, err := app.GetChannelPlaylists("recent")
	if err != nil {
		t.Fatalf("GetChannelPlaylists failed: %v", err)
	}

	if len(playlists) != 3 {
		t.Fatalf("expected 3 playlists, got %d", len(playlists))
	}

	playlistMap := make(map[string]YTPlaylist)
	for _, p := range playlists {
		playlistMap[p.ID] = p
	}

	// Verify pl-1 has DuplicateCount == 2
	p1, ok := playlistMap["pl-1"]
	if !ok {
		t.Fatalf("pl-1 not found in result")
	}
	if p1.DuplicateCount != 2 {
		t.Errorf("pl-1 DuplicateCount expected 2, got %d", p1.DuplicateCount)
	}

	// Verify pl-2 has DuplicateCount == 0
	p2, ok := playlistMap["pl-2"]
	if !ok {
		t.Fatalf("pl-2 not found in result")
	}
	if p2.DuplicateCount != 0 {
		t.Errorf("pl-2 DuplicateCount expected 0, got %d", p2.DuplicateCount)
	}

	// Verify pl-3 has DuplicateCount == 0
	p3, ok := playlistMap["pl-3"]
	if !ok {
		t.Fatalf("pl-3 not found in result")
	}
	if p3.DuplicateCount != 0 {
		t.Errorf("pl-3 DuplicateCount expected 0, got %d", p3.DuplicateCount)
	}
}
