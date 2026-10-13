package backend

import (
	"testing"
)

func TestInferTagFromPlaylistTitle(t *testing.T) {
	known := []string{"Hades", "Control Resonant", "Elden Ring"}

	// 1. Direct match with VOD
	tag, kind, conf := inferTagFromPlaylistTitle("Hades", known)
	if tag != "Hades" || kind != "vod" || conf != "known" {
		t.Errorf("expected Hades, vod, known; got %s, %s, %s", tag, kind, conf)
	}

	// 2. Case insensitive known match with clips suffix
	tag, kind, conf = inferTagFromPlaylistTitle("hades clips", known)
	if tag != "Hades" || kind != "clip" || conf != "known" {
		t.Errorf("expected Hades, clip, known; got %s, %s, %s", tag, kind, conf)
	}

	// 3. Multi-word title with singular Clip
	tag, kind, conf = inferTagFromPlaylistTitle(" Control Resonant Clip ", known)
	if tag != "Control Resonant" || kind != "clip" || conf != "known" {
		t.Errorf("expected Control Resonant, clip, known; got %s, %s, %s", tag, kind, conf)
	}

	// 4. Unknown title fallback to guess
	tag, kind, conf = inferTagFromPlaylistTitle("Hollow Knight Silksong", known)
	if tag != "Hollow Knight Silksong" || kind != "vod" || conf != "guess" {
		t.Errorf("expected Hollow Knight Silksong, vod, guess; got %s, %s, %s", tag, kind, conf)
	}

	// 5. Unknown title with Clips suffix
	tag, kind, conf = inferTagFromPlaylistTitle("Hollow Knight Clips", known)
	if tag != "Hollow Knight" || kind != "clip" || conf != "guess" {
		t.Errorf("expected Hollow Knight, clip, guess; got %s, %s, %s", tag, kind, conf)
	}
}

func TestInferEpisodes(t *testing.T) {
	// 1. Title format: Standard upload title format with sep " - "
	vids := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Hades - 3/05/26 - 4"},
		{VideoID: "v2", Title: "Hades - 4/05/26 - 5"},
	}
	res := inferEpisodes(vids, " - ")
	if res[0].Episode != 4 || res[0].Source != "title" {
		t.Errorf("expected v1 episode 4 (title), got %d (%s)", res[0].Episode, res[0].Source)
	}
	if res[1].Episode != 5 || res[1].Source != "title" {
		t.Errorf("expected v2 episode 5 (title), got %d (%s)", res[1].Episode, res[1].Source)
	}

	// 2. Title format: Regex patterns like Ep. 7 or Part 10
	vids2 := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Control Gameplay Ep 7"},
		{VideoID: "v2", Title: "Control Gameplay Part 8"},
		{VideoID: "v3", Title: "Control Final Boss #9"},
	}
	res2 := inferEpisodes(vids2, " - ")
	if res2[0].Episode != 7 || res2[1].Episode != 8 || res2[2].Episode != 9 {
		t.Errorf("expected 7, 8, 9; got %d, %d, %d", res2[0].Episode, res2[1].Episode, res2[2].Episode)
	}

	// 3. Existing DB episodes take precedence
	vids3 := []CatalogVideoDraft{
		{VideoID: "v1", Title: "No numbers in title", ExistingEpisode: 3},
		{VideoID: "v2", Title: "Random title - 4/05/26 - 10", ExistingEpisode: 1},
	}
	res3 := inferEpisodes(vids3, " - ")
	if res3[0].Episode != 3 || res3[0].Source != "db" {
		t.Errorf("expected v1 episode 3 (db), got %d (%s)", res3[0].Episode, res3[0].Source)
	}
	if res3[1].Episode != 1 || res3[1].Source != "db" {
		t.Errorf("expected v2 episode 1 (db), got %d (%s)", res3[1].Episode, res3[1].Source)
	}

	// 4. Fallback to order when NO videos have any detectable episode
	vids4 := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Game stream first", PublishedAt: "2026-01-01T10:00:00Z"},
		{VideoID: "v2", Title: "Game stream second", PublishedAt: "2026-01-02T10:00:00Z"},
	}
	res4 := inferEpisodes(vids4, " - ")
	if res4[0].Episode != 1 || res4[0].Source != "order" {
		t.Errorf("expected v1 episode 1 (order), got %d (%s)", res4[0].Episode, res4[0].Source)
	}
	if res4[1].Episode != 2 || res4[1].Source != "order" {
		t.Errorf("expected v2 episode 2 (order), got %d (%s)", res4[1].Episode, res4[1].Source)
	}

	// 5. Conflict detection when duplicate episodes occur
	vids5 := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Game Ep 2"},
		{VideoID: "v2", Title: "Game Ep 2 Re-run"},
	}
	res5 := inferEpisodes(vids5, " - ")
	if !res5[0].Conflict || !res5[1].Conflict {
		t.Errorf("expected conflict flag on duplicate episode 2")
	}
}

func TestApplyPlaylistCatalog(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Seed videos in database
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, game_tag, episode)
		VALUES ('vid-c1', 'Hades Vid 1', '', 0),
		       ('vid-c2', 'Hades Vid 2', '', 0)
	`)
	if err != nil {
		t.Fatalf("failed to seed videos: %v", err)
	}

	req := CatalogApplyRequest{
		PlaylistID: "pl-hades-vod",
		Tag:        "Hades",
		Kind:       "vod",
		Assignments: []CatalogAssignment{
			{VideoID: "vid-c1", Episode: 1},
			{VideoID: "vid-c2", Episode: 2},
		},
	}

	err = app.ApplyPlaylistCatalog(req)
	if err != nil {
		t.Fatalf("ApplyPlaylistCatalog failed: %v", err)
	}

	// Check DB rows updated
	var ep1, ep2 int
	var tag1, tag2 string
	app.db.conn.QueryRow("SELECT game_tag, episode FROM yt_videos WHERE id = 'vid-c1'").Scan(&tag1, &ep1)
	app.db.conn.QueryRow("SELECT game_tag, episode FROM yt_videos WHERE id = 'vid-c2'").Scan(&tag2, &ep2)

	if tag1 != "Hades" || ep1 != 1 || tag2 != "Hades" || ep2 != 2 {
		t.Errorf("expected updated tags & episodes: got (tag1=%s, ep1=%d), (tag2=%s, ep2=%d)", tag1, ep1, tag2, ep2)
	}

	// Check TagPlaylistConfig updated
	cfg := app.GetTagPlaylistConfig("Hades")
	if cfg.VodPlaylistID != "pl-hades-vod" {
		t.Errorf("expected VodPlaylistID to be pl-hades-vod, got %s", cfg.VodPlaylistID)
	}
}

func TestListCatalogPlaylistsOrdering(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Seed playlists: pl-older (published earlier), pl-newer (published later)
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, video_count, published_at)
		VALUES ('pl-1', 'Zelda Playthrough', 1, '2025-01-01T00:00:00Z'),
		       ('pl-2', 'Dark Souls Playthrough', 1, '2024-01-01T00:00:00Z')
	`)
	if err != nil {
		t.Fatalf("failed to insert playlists: %v", err)
	}

	// Seed videos and playlist items: pl-2 has a video published in 2026 (more recent than pl-1)
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, published_at)
		VALUES ('v-zelda', 'Zelda Part 1', '2025-01-05T00:00:00Z'),
		       ('v-souls', 'Dark Souls Part 1', '2026-03-01T00:00:00Z')
	`)
	if err != nil {
		t.Fatalf("failed to insert videos: %v", err)
	}

	_, err = app.db.conn.Exec(`
		INSERT INTO yt_playlist_items (playlist_id, video_id, position)
		VALUES ('pl-1', 'v-zelda', 0),
		       ('pl-2', 'v-souls', 0)
	`)
	if err != nil {
		t.Fatalf("failed to insert playlist items: %v", err)
	}

	playlists, err := app.ListCatalogPlaylists()
	if err != nil {
		t.Fatalf("ListCatalogPlaylists failed: %v", err)
	}

	if len(playlists) != 2 {
		t.Fatalf("expected 2 playlists, got %d", len(playlists))
	}

	// pl-2 has a video from 2026, so it must be first even though its title is 'Dark Souls' and playlist created in 2024
	if playlists[0].PlaylistID != "pl-2" {
		t.Errorf("expected pl-2 to be first (most recently updated video), got %s (%s)", playlists[0].PlaylistID, playlists[0].Title)
	}
	if playlists[1].PlaylistID != "pl-1" {
		t.Errorf("expected pl-1 to be second, got %s (%s)", playlists[1].PlaylistID, playlists[1].Title)
	}
}

