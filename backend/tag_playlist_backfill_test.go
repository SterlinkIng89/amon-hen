package backend

import (
	"database/sql"
	"testing"
)

func seedBackfillVideo(t *testing.T, app *App, id, title string, gameTag sql.NullString) {
	t.Helper()
	_, err := app.db.conn.Exec(
		`INSERT INTO yt_videos (id, title, game_tag) VALUES (?, ?, ?)`,
		id, title, gameTag,
	)
	if err != nil {
		t.Fatalf("failed to seed video %s: %v", id, err)
	}
}

func seedBackfillPlaylistItem(t *testing.T, app *App, playlistID, videoID string, pos int) {
	t.Helper()
	_, err := app.db.conn.Exec(
		`INSERT INTO yt_playlist_items (playlist_id, video_id, position) VALUES (?, ?, ?)`,
		playlistID, videoID, pos,
	)
	if err != nil {
		t.Fatalf("failed to seed playlist item (%s, %s): %v", playlistID, videoID, err)
	}
}

func readGameTag(t *testing.T, app *App, videoID string) sql.NullString {
	t.Helper()
	var tag sql.NullString
	err := app.db.conn.QueryRow(`SELECT game_tag FROM yt_videos WHERE id = ?`, videoID).Scan(&tag)
	if err != nil {
		t.Fatalf("failed to read game_tag for %s: %v", videoID, err)
	}
	return tag
}

func TestBackfillGameTags_EmptyAndNull(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	seedBackfillVideo(t, app, "v-null", "Arena - Match 1", sql.NullString{Valid: false})
	seedBackfillVideo(t, app, "v-empty", "Arena - Match 2", sql.NullString{String: "", Valid: true})
	seedBackfillVideo(t, app, "v-spaces", "Arena - Match 3", sql.NullString{String: "   ", Valid: true})

	seedBackfillPlaylistItem(t, app, "pl-lol-vod", "v-null", 0)
	seedBackfillPlaylistItem(t, app, "pl-lol-vod", "v-empty", 1)
	seedBackfillPlaylistItem(t, app, "pl-lol-vod", "v-spaces", 2)

	app.configMu.Lock()
	app.config.TagPlaylistConfigs = map[string]TagPlaylistConfig{
		"League of Legends": {VodPlaylistID: "pl-lol-vod"},
	}
	app.configMu.Unlock()

	updated, err := app.BackfillGameTagsFromPlaylists()
	if err != nil {
		t.Fatalf("BackfillGameTagsFromPlaylists failed: %v", err)
	}
	if updated != 3 {
		t.Fatalf("expected 3 updated rows, got %d", updated)
	}

	for _, id := range []string{"v-null", "v-empty", "v-spaces"} {
		tag := readGameTag(t, app, id)
		if !tag.Valid || tag.String != "League of Legends" {
			t.Errorf("video %s: expected game_tag 'League of Legends', got %+v", id, tag)
		}
	}
}

func TestBackfillGameTags_PreservesExistingTags(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	seedBackfillVideo(t, app, "v-existing", "Custom Title", sql.NullString{String: "Existing Game", Valid: true})
	seedBackfillVideo(t, app, "v-blank", "ARAM - Match 1", sql.NullString{String: "", Valid: true})

	seedBackfillPlaylistItem(t, app, "pl-lol-vod", "v-existing", 0)
	seedBackfillPlaylistItem(t, app, "pl-lol-vod", "v-blank", 1)

	app.configMu.Lock()
	app.config.TagPlaylistConfigs = map[string]TagPlaylistConfig{
		"League of Legends": {VodPlaylistID: "pl-lol-vod"},
	}
	app.configMu.Unlock()

	updated, err := app.BackfillGameTagsFromPlaylists()
	if err != nil {
		t.Fatalf("BackfillGameTagsFromPlaylists failed: %v", err)
	}
	if updated != 1 {
		t.Fatalf("expected 1 updated row, got %d", updated)
	}

	existing := readGameTag(t, app, "v-existing")
	if !existing.Valid || existing.String != "Existing Game" {
		t.Errorf("expected existing game_tag 'Existing Game' to be preserved, got %+v", existing)
	}
	blank := readGameTag(t, app, "v-blank")
	if !blank.Valid || blank.String != "League of Legends" {
		t.Errorf("expected blank video to be backfilled to 'League of Legends', got %+v", blank)
	}
}

func TestBackfillGameTags_VodClipAndLegacyPlaylists(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	seedBackfillVideo(t, app, "v-vod", "Hades Run 1", sql.NullString{Valid: false})
	seedBackfillVideo(t, app, "v-clip", "Hades Funny Moment", sql.NullString{String: "", Valid: true})
	seedBackfillVideo(t, app, "v-legacy", "Legacy Game Session", sql.NullString{Valid: false})

	seedBackfillPlaylistItem(t, app, "pl-hades-vod", "v-vod", 0)
	seedBackfillPlaylistItem(t, app, "pl-hades-clip", "v-clip", 0)
	seedBackfillPlaylistItem(t, app, "pl-legacy", "v-legacy", 0)

	app.configMu.Lock()
	app.config.TagPlaylistConfigs = map[string]TagPlaylistConfig{
		"Hades": {
			VodPlaylistID:  "pl-hades-vod",
			ClipPlaylistID: "pl-hades-clip",
		},
	}
	app.config.TagPlaylists = map[string]string{
		"Legacy Tag": "pl-legacy",
	}
	app.configMu.Unlock()

	updated, err := app.BackfillGameTagsFromPlaylists()
	if err != nil {
		t.Fatalf("BackfillGameTagsFromPlaylists failed: %v", err)
	}
	if updated != 3 {
		t.Fatalf("expected 3 updated rows, got %d", updated)
	}

	if tag := readGameTag(t, app, "v-vod"); !tag.Valid || tag.String != "Hades" {
		t.Errorf("expected v-vod tag 'Hades', got %+v", tag)
	}
	if tag := readGameTag(t, app, "v-clip"); !tag.Valid || tag.String != "Hades" {
		t.Errorf("expected v-clip tag 'Hades', got %+v", tag)
	}
	if tag := readGameTag(t, app, "v-legacy"); !tag.Valid || tag.String != "Legacy Tag" {
		t.Errorf("expected v-legacy tag 'Legacy Tag', got %+v", tag)
	}
}

func TestBackfillGameTags_UnlinkedPlaylistsUntouched(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	seedBackfillVideo(t, app, "v-unlinked", "Random Video", sql.NullString{Valid: false})
	seedBackfillPlaylistItem(t, app, "pl-unlinked", "v-unlinked", 0)

	app.configMu.Lock()
	app.config.TagPlaylistConfigs = map[string]TagPlaylistConfig{
		"Hades": {VodPlaylistID: "pl-other"},
	}
	app.configMu.Unlock()

	updated, err := app.BackfillGameTagsFromPlaylists()
	if err != nil {
		t.Fatalf("BackfillGameTagsFromPlaylists failed: %v", err)
	}
	if updated != 0 {
		t.Fatalf("expected 0 updated rows, got %d", updated)
	}

	if tag := readGameTag(t, app, "v-unlinked"); tag.Valid && tag.String != "" {
		t.Errorf("expected v-unlinked to remain NULL/empty, got %+v", tag)
	}
}

func TestBackfillGameTags_SetTagPlaylistConfigTriggersBackfill(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	seedBackfillVideo(t, app, "v-1", "Match 1", sql.NullString{Valid: false})
	seedBackfillVideo(t, app, "v-2", "Clip 1", sql.NullString{String: "", Valid: true})
	seedBackfillPlaylistItem(t, app, "pl-vod", "v-1", 0)
	seedBackfillPlaylistItem(t, app, "pl-clip", "v-2", 0)

	if err := app.SetTagPlaylistConfig("Valorant", "pl-vod", "pl-clip"); err != nil {
		t.Fatalf("SetTagPlaylistConfig failed: %v", err)
	}

	if tag := readGameTag(t, app, "v-1"); !tag.Valid || tag.String != "Valorant" {
		t.Errorf("expected v-1 tag 'Valorant' after SetTagPlaylistConfig, got %+v", tag)
	}
	if tag := readGameTag(t, app, "v-2"); !tag.Valid || tag.String != "Valorant" {
		t.Errorf("expected v-2 tag 'Valorant' after SetTagPlaylistConfig, got %+v", tag)
	}
}
