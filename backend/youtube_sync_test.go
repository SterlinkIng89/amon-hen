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
		db:       &DB{conn: conn},
		thumbSem: make(chan struct{}, 2),
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

func TestGetChannelVideos_IncludesGameTag(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, published_at, game_tag, episode)
		VALUES ('vid-tag-1', 'Hades Ep 1', '2026-01-01T00:00:00Z', 'Hades', 1)
	`)
	if err != nil {
		t.Fatalf("failed to insert video: %v", err)
	}

	res, err := app.GetChannelVideosPaginated(1, 10, "recent", "", "", "")
	if err != nil {
		t.Fatalf("GetChannelVideosPaginated failed: %v", err)
	}

	videos, ok := res["videos"].([]YTVideo)
	if !ok || len(videos) == 0 {
		t.Fatalf("expected at least 1 video, got %v", res)
	}

	if videos[0].GameTag != "Hades" {
		t.Errorf("expected GameTag 'Hades', got %q", videos[0].GameTag)
	}
}

func TestSyncPlaylists_PreservesCustomThumbnail(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	customURL := "/cache/yt_thumbs/yt_custom_pl.jpg?v=999"
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, privacy)
		VALUES ('pl-preserve-1', 'My Playlist', 'Desc', 0, ?, '2026-01-01', 'public')
	`, customURL)
	if err != nil {
		t.Fatalf("failed to insert initial playlist: %v", err)
	}

	// Simulate sync upsert where incoming thumbnail is empty
	incomingThumb := ""
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, synced_at, privacy)
		VALUES ('pl-preserve-1', 'My Playlist Updated', 'New Desc', 0, ?, '2026-01-01', 12345, 'public')
		ON CONFLICT(id) DO UPDATE SET
		title=excluded.title, description=excluded.description, video_count=excluded.video_count,
		thumbnail_url=CASE WHEN excluded.thumbnail_url != '' THEN excluded.thumbnail_url ELSE yt_playlists.thumbnail_url END,
		published_at=excluded.published_at, synced_at=excluded.synced_at,
		privacy=excluded.privacy
	`, incomingThumb)
	if err != nil {
		t.Fatalf("failed to run sync upsert: %v", err)
	}

	var savedThumb string
	err = app.db.conn.QueryRow("SELECT thumbnail_url FROM yt_playlists WHERE id = 'pl-preserve-1'").Scan(&savedThumb)
	if err != nil {
		t.Fatalf("failed to query saved thumbnail: %v", err)
	}

	if savedThumb != customURL {
		t.Errorf("expected thumbnail_url %q to be preserved, got %q", customURL, savedThumb)
	}
}

