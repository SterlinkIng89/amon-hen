package backend

import (
	"strings"
	"testing"
)

func TestValidateChronology(t *testing.T) {
	// 1. Strictly ascending
	draftsValid := []CatalogVideoDraft{
		{VideoID: "v1", PublishedAt: "2026-01-01T00:00:00Z", SortDate: "2026-01-01", Episode: 1},
		{VideoID: "v2", PublishedAt: "2026-01-02T00:00:00Z", SortDate: "2026-01-02", Episode: 2},
		{VideoID: "v3", PublishedAt: "2026-01-03T00:00:00Z", SortDate: "2026-01-03", Episode: 3},
	}
	if err := validateChronology(draftsValid); err != nil {
		t.Errorf("expected valid drafts to pass, got: %v", err)
	}

	// 2. Non-consecutive gaps
	draftsGaps := []CatalogVideoDraft{
		{VideoID: "v1", PublishedAt: "2026-01-01T00:00:00Z", SortDate: "2026-01-01", Episode: 1},
		{VideoID: "v2", PublishedAt: "2026-01-02T00:00:00Z", SortDate: "2026-01-02", Episode: 3},
		{VideoID: "v3", PublishedAt: "2026-01-03T00:00:00Z", SortDate: "2026-01-03", Episode: 7},
	}
	if err := validateChronology(draftsGaps); err != nil {
		t.Errorf("expected gaps to pass, got: %v", err)
	}

	// 3. Inverted chronology
	draftsInverted := []CatalogVideoDraft{
		{VideoID: "v1", PublishedAt: "2026-01-01T00:00:00Z", SortDate: "2026-01-01", Episode: 4},
		{VideoID: "v2", PublishedAt: "2026-01-02T00:00:00Z", SortDate: "2026-01-02", Episode: 2},
	}
	if err := validateChronology(draftsInverted); err == nil {
		t.Errorf("expected error for inverted chronology, got nil")
	} else if !strings.Contains(err.Error(), "chronological inversion") {
		t.Errorf("expected error message to mention chronological inversion, got %v", err)
	}

	// 4. Zero episodes ignored
	draftsZero := []CatalogVideoDraft{
		{VideoID: "v1", PublishedAt: "2026-01-01T00:00:00Z", SortDate: "2026-01-01", Episode: 1},
		{VideoID: "v2", PublishedAt: "2026-01-02T00:00:00Z", SortDate: "2026-01-02", Episode: 0},
		{VideoID: "v3", PublishedAt: "2026-01-03T00:00:00Z", SortDate: "2026-01-03", Episode: 2},
	}
	if err := validateChronology(draftsZero); err != nil {
		t.Errorf("expected zero episodes to be ignored, got: %v", err)
	}

	// 5. Multiple episodes on the same day (regardless of upload order) are valid
	draftsSameDay := []CatalogVideoDraft{
		{VideoID: "v1", PublishedAt: "2026-10-27T22:44:32Z", SortDate: "2026-10-26", Episode: 4},
		{VideoID: "v2", PublishedAt: "2026-10-28T05:47:57Z", SortDate: "2026-10-26", Episode: 2},
		{VideoID: "v3", PublishedAt: "2026-10-28T02:07:27Z", SortDate: "2026-10-26", Episode: 3},
		{VideoID: "v4", PublishedAt: "2026-10-28T05:47:58Z", SortDate: "2026-10-26", Episode: 1},
		{VideoID: "v5", PublishedAt: "2026-10-28T04:18:41Z", SortDate: "2026-10-26", Episode: 5},
		{VideoID: "v6", PublishedAt: "2026-10-28T22:19:49Z", SortDate: "2026-10-27", Episode: 6},
		{VideoID: "v7", PublishedAt: "2026-10-29T03:53:04Z", SortDate: "2026-10-28", Episode: 8},
		{VideoID: "v8", PublishedAt: "2026-10-29T03:56:39Z", SortDate: "2026-10-28", Episode: 7},
	}
	if err := validateChronology(draftsSameDay); err != nil {
		t.Errorf("expected same-day multiple episodes across ascending calendar days to pass, got: %v", err)
	}
}

func TestApplyPlaylistCatalog_RejectsDuplicateEpisodes(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, episode)
		VALUES ('vid-d1', 'Vid 1', 0),
		       ('vid-d2', 'Vid 2', 0);
	`)
	if err != nil {
		t.Fatalf("failed to insert fixtures: %v", err)
	}

	req := CatalogApplyRequest{
		PlaylistID: "pl-dup-test",
		Tag:        "Hades",
		Kind:       "vod",
		Assignments: []CatalogAssignment{
			{VideoID: "vid-d1", Episode: 3},
			{VideoID: "vid-d2", Episode: 3},
		},
	}

	err = app.ApplyPlaylistCatalog(req)
	if err == nil {
		t.Fatalf("expected error on duplicate episodes, got nil")
	}
	if !strings.Contains(err.Error(), "duplicate episode number") {
		t.Errorf("expected error to mention duplicate episode number, got %v", err)
	}

	// Verify DB is untouched
	var ep1, ep2 int
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-d1'").Scan(&ep1)
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-d2'").Scan(&ep2)
	if ep1 != 0 || ep2 != 0 {
		t.Errorf("expected database to remain unchanged (episodes 0), got ep1=%d, ep2=%d", ep1, ep2)
	}
}

func TestApplyPlaylistCatalog_RejectsInvertedChronology(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, video_count, published_at)
		VALUES ('pl-inv-test', 'Inverted VODs', 2, '2026-01-01T00:00:00Z');

		INSERT INTO yt_videos (id, title, published_at, episode)
		VALUES ('vid-inv-1', 'Game Ep 4', '2026-01-01T12:00:00Z', 0),
		       ('vid-inv-2', 'Game Ep 2', '2026-01-02T12:00:00Z', 0);

		INSERT INTO yt_playlist_items (playlist_id, video_id, position)
		VALUES ('pl-inv-test', 'vid-inv-1', 0),
		       ('pl-inv-test', 'vid-inv-2', 1);
	`)
	if err != nil {
		t.Fatalf("failed to insert fixtures: %v", err)
	}

	req := CatalogApplyRequest{
		PlaylistID: "pl-inv-test",
		Tag:        "Game",
		Kind:       "vod",
		Assignments: []CatalogAssignment{
			{VideoID: "vid-inv-1", Episode: 4},
			{VideoID: "vid-inv-2", Episode: 2},
		},
	}

	err = app.ApplyPlaylistCatalog(req)
	if err == nil {
		t.Fatalf("expected error on inverted chronology, got nil")
	}
	if !strings.Contains(err.Error(), "chronological inversion") {
		t.Errorf("expected error to mention chronological inversion, got %v", err)
	}

	// Verify DB is untouched
	var ep1, ep2 int
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-inv-1'").Scan(&ep1)
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-inv-2'").Scan(&ep2)
	if ep1 != 0 || ep2 != 0 {
		t.Errorf("expected database to remain unchanged, got ep1=%d, ep2=%d", ep1, ep2)
	}
}

func TestApplyPlaylistCatalog_AllowsGaps(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, video_count, published_at)
		VALUES ('pl-gaps-test', 'Gaps VODs', 3, '2026-01-01T00:00:00Z');

		INSERT INTO yt_videos (id, title, published_at, episode)
		VALUES ('vid-g1', 'Elden Ring - 1/05/26 - 1', '2026-05-01T00:00:00Z', 0),
		       ('vid-g2', 'Elden Ring - 2/05/26 - 3', '2026-05-02T00:00:00Z', 0),
		       ('vid-g3', 'Elden Ring - 3/05/26 - 7', '2026-05-03T00:00:00Z', 0);

		INSERT INTO yt_playlist_items (playlist_id, video_id, position)
		VALUES ('pl-gaps-test', 'vid-g1', 0),
		       ('pl-gaps-test', 'vid-g2', 1),
		       ('pl-gaps-test', 'vid-g3', 2);
	`)
	if err != nil {
		t.Fatalf("failed to insert fixtures: %v", err)
	}

	req := CatalogApplyRequest{
		PlaylistID: "pl-gaps-test",
		Tag:        "Elden Ring",
		Kind:       "vod",
		Assignments: []CatalogAssignment{
			{VideoID: "vid-g1", Episode: 1},
			{VideoID: "vid-g2", Episode: 3},
			{VideoID: "vid-g3", Episode: 7},
		},
	}

	err = app.ApplyPlaylistCatalog(req)
	if err != nil {
		t.Fatalf("expected non-consecutive gaps to apply successfully, got: %v", err)
	}

	var ep1, ep2, ep3 int
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-g1'").Scan(&ep1)
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-g2'").Scan(&ep2)
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-g3'").Scan(&ep3)
	if ep1 != 1 || ep2 != 3 || ep3 != 7 {
		t.Errorf("expected episodes 1, 3, 7; got %d, %d, %d", ep1, ep2, ep3)
	}
}

func TestApplyPlaylistCatalog_ClipsIgnoreChronologyAndDuplicates(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, episode)
		VALUES ('vid-clip-1', 'Clip 1', 0),
		       ('vid-clip-2', 'Clip 2', 0);
	`)
	if err != nil {
		t.Fatalf("failed to insert fixtures: %v", err)
	}

	req := CatalogApplyRequest{
		PlaylistID: "pl-clips-test",
		Tag:        "Highlights",
		Kind:       "clip",
		Assignments: []CatalogAssignment{
			{VideoID: "vid-clip-1", Episode: 5},
			{VideoID: "vid-clip-2", Episode: 5}, // duplicate episode number, but Kind == "clip"
		},
	}

	err = app.ApplyPlaylistCatalog(req)
	if err != nil {
		t.Fatalf("expected clips to succeed without episode validation, got: %v", err)
	}

	// Clips store episode as NULL in DB
	var ep1, ep2 *int
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-clip-1'").Scan(&ep1)
	app.db.conn.QueryRow("SELECT episode FROM yt_videos WHERE id = 'vid-clip-2'").Scan(&ep2)
	if ep1 != nil || ep2 != nil {
		t.Errorf("expected episodes to be NULL for clips, got ep1=%v, ep2=%v", ep1, ep2)
	}
}
