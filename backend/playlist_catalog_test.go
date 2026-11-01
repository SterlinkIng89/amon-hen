package backend

import (
	"os"
	"path/filepath"
	"strings"
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

func TestInferEpisodes_TitleEpisodeAndMismatch(t *testing.T) {
	// Case 1: DB episode differs from title episode -> Mismatch = true, Episode remains DB
	vids := []CatalogVideoDraft{
		{
			VideoID:         "v1",
			Title:           "Persona 3 Reload — 21/07/26 - 4",
			ExistingEpisode: 33,
		},
	}
	res := inferEpisodes(vids, " - ")
	if res[0].Episode != 33 {
		t.Errorf("expected Episode to remain 33 (db), got %d", res[0].Episode)
	}
	if res[0].Source != "db" {
		t.Errorf("expected Source 'db', got %q", res[0].Source)
	}
	if res[0].TitleEpisode != 4 {
		t.Errorf("expected TitleEpisode 4, got %d", res[0].TitleEpisode)
	}
	if !res[0].Mismatch {
		t.Errorf("expected Mismatch to be true when DB (33) != Title (4)")
	}
	if res[0].SortDate != "2026-07-21" {
		t.Errorf("expected SortDate '2026-07-21', got %q", res[0].SortDate)
	}

	// Case 2: DB episode matches title episode -> Mismatch = false
	vids2 := []CatalogVideoDraft{
		{
			VideoID:         "v2",
			Title:           "Persona 3 Reload — 21/07/26 - 4",
			ExistingEpisode: 4,
		},
	}
	res2 := inferEpisodes(vids2, " - ")
	if res2[0].Episode != 4 || res2[0].TitleEpisode != 4 || res2[0].Mismatch {
		t.Errorf("expected Episode 4, TitleEpisode 4, Mismatch false; got %+v", res2[0])
	}

	// Case 3: No DB episode -> Episode takes TitleEpisode, Mismatch = false
	vids3 := []CatalogVideoDraft{
		{
			VideoID:         "v3",
			Title:           "Persona 3 Reload — 21/07/26 - 4",
			ExistingEpisode: 0,
		},
	}
	res3 := inferEpisodes(vids3, " - ")
	if res3[0].Episode != 4 || res3[0].Source != "title" || res3[0].TitleEpisode != 4 || res3[0].Mismatch {
		t.Errorf("expected Episode 4 (title), TitleEpisode 4, Mismatch false; got %+v", res3[0])
	}

	// Case 4: DB episode exists but title has no episode -> Mismatch = false
	vids4 := []CatalogVideoDraft{
		{
			VideoID:         "v4",
			Title:           "Persona 3 Reload Gameplay Only",
			ExistingEpisode: 2,
			PublishedAt:     "2026-07-20T12:00:00Z",
		},
	}
	res4 := inferEpisodes(vids4, " - ")
	if res4[0].Episode != 2 || res4[0].TitleEpisode != 0 || res4[0].Mismatch {
		t.Errorf("expected Episode 2, TitleEpisode 0, Mismatch false; got %+v", res4[0])
	}
	if res4[0].SortDate != "2026-07-20T12:00:00Z" {
		t.Errorf("expected SortDate fallback to publishedAt, got %q", res4[0].SortDate)
	}
}

func TestInferEpisodes_ChronologyIssues(t *testing.T) {
	// 1. Strictly ascending sequence -> no chronology issues
	vidsClean := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Elden Ring - 1/05/26 - 1"},
		{VideoID: "v2", Title: "Elden Ring - 2/05/26 - 2"},
		{VideoID: "v3", Title: "Elden Ring - 3/05/26 - 3"},
	}
	resClean := inferEpisodes(vidsClean, " - ")
	for i, v := range resClean {
		if v.ChronologyIssue {
			t.Errorf("expected no chronology issue for v%d, got true", i+1)
		}
	}

	// 2. Non-consecutive ascending sequence (gaps) -> no chronology issues
	vidsGaps := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Elden Ring - 1/05/26 - 1"},
		{VideoID: "v2", Title: "Elden Ring - 2/05/26 - 4"},
		{VideoID: "v3", Title: "Elden Ring - 3/05/26 - 7"},
	}
	resGaps := inferEpisodes(vidsGaps, " - ")
	for i, v := range resGaps {
		if v.ChronologyIssue {
			t.Errorf("expected gaps to be valid chronology for v%d, got true", i+1)
		}
	}

	// 3. Inverted pair -> both flagged
	vidsInverted := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Elden Ring - 1/05/26 - 4"},
		{VideoID: "v2", Title: "Elden Ring - 2/05/26 - 2"},
	}
	resInverted := inferEpisodes(vidsInverted, " - ")
	if !resInverted[0].ChronologyIssue || !resInverted[1].ChronologyIssue {
		t.Errorf("expected both videos in inverted pair to have ChronologyIssue=true; got %v, %v",
			resInverted[0].ChronologyIssue, resInverted[1].ChronologyIssue)
	}

	// 4. Stale DB episode causing chronology inversion
	vidsStaleDB := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Elden Ring - 1/05/26 - 1", ExistingEpisode: 33},
		{VideoID: "v2", Title: "Elden Ring - 2/05/26 - 2"},
		{VideoID: "v3", Title: "Elden Ring - 3/05/26 - 3"},
	}
	resStaleDB := inferEpisodes(vidsStaleDB, " - ")
	if !resStaleDB[0].Mismatch {
		t.Errorf("expected v1 to have Mismatch=true")
	}
	if !resStaleDB[0].ChronologyIssue {
		t.Errorf("expected v1 (ep 33 on day 1) to have ChronologyIssue=true")
	}
	if !resStaleDB[1].ChronologyIssue || !resStaleDB[2].ChronologyIssue {
		t.Errorf("expected v2 and v3 to be flagged due to preceding ep 33; got v2=%v, v3=%v",
			resStaleDB[1].ChronologyIssue, resStaleDB[2].ChronologyIssue)
	}

	// 5. Zero episode (unassigned) -> never has ChronologyIssue
	vidsWithZero := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Elden Ring - 1/05/26 - 1"},
		{VideoID: "v2", Title: "Elden Ring - 2/05/26 - Special Highlight", ExistingEpisode: 0},
		{VideoID: "v3", Title: "Elden Ring - 3/05/26 - 2"},
	}
	resZero := inferEpisodes(vidsWithZero, " - ")
	if resZero[1].Episode != 0 {
		t.Errorf("expected v2 Episode 0, got %d", resZero[1].Episode)
	}
	if resZero[1].ChronologyIssue {
		t.Errorf("expected unassigned Episode 0 to have ChronologyIssue=false")
	}
	if resZero[0].ChronologyIssue || resZero[2].ChronologyIssue {
		t.Errorf("expected v1 and v3 to have ChronologyIssue=false; got v1=%v, v3=%v",
			resZero[0].ChronologyIssue, resZero[2].ChronologyIssue)
	}

	// 6. Same day videos ordered by PublishedAt time
	vidsSameDay := []CatalogVideoDraft{
		{VideoID: "v1", Title: "Elden Ring Ep 2", PublishedAt: "2026-05-01T10:00:00Z"},
		{VideoID: "v2", Title: "Elden Ring Ep 1", PublishedAt: "2026-05-01T15:00:00Z"},
	}
	resSameDay := inferEpisodes(vidsSameDay, " - ")
	if !resSameDay[0].ChronologyIssue || !resSameDay[1].ChronologyIssue {
		t.Errorf("expected same-day inverted PublishedAt time to flag ChronologyIssue=true")
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

func TestListCatalogPlaylists_ReverseLookupAndThumbnail(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Seed playlist with non-inferrable title and custom thumbnail
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, video_count, thumbnail_url, published_at)
		VALUES ('pl-linked-custom', 'Unrelated Title 2026', 1, 'https://example.com/pl_cover.jpg', '2026-01-01T00:00:00Z')
	`)
	if err != nil {
		t.Fatalf("failed to insert playlist: %v", err)
	}

	app.configMu.Lock()
	if app.config.TagPlaylistConfigs == nil {
		app.config.TagPlaylistConfigs = make(map[string]TagPlaylistConfig)
	}
	app.config.TagPlaylistConfigs["Custom Elden Tag"] = TagPlaylistConfig{
		VodPlaylistID: "pl-linked-custom",
	}
	app.configMu.Unlock()

	summaries, err := app.ListCatalogPlaylists()
	if err != nil {
		t.Fatalf("ListCatalogPlaylists failed: %v", err)
	}

	var found *CatalogPlaylistSummary
	for i := range summaries {
		if summaries[i].PlaylistID == "pl-linked-custom" {
			found = &summaries[i]
			break
		}
	}

	if found == nil {
		t.Fatalf("expected to find pl-linked-custom in summaries")
	}

	if found.Tag != "Custom Elden Tag" || found.Kind != "vod" || found.TagConfidence != "known" || !found.Linked {
		t.Errorf("expected reverse lookup tag 'Custom Elden Tag', known, linked=true; got tag=%s, kind=%s, conf=%s, linked=%v",
			found.Tag, found.Kind, found.TagConfidence, found.Linked)
	}
	if found.ThumbnailUrl != "https://example.com/pl_cover.jpg" {
		t.Errorf("expected ThumbnailUrl 'https://example.com/pl_cover.jpg', got %s", found.ThumbnailUrl)
	}
}

func TestGetPlaylistCatalogDraft_ThumbnailAndTagPrecedence(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, video_count, thumbnail_url, published_at)
		VALUES ('pl-draft-test', 'Unrelated Title', 1, '/cache/yt_thumbs/pl_test.jpg', '2026-01-01T00:00:00Z')
	`)
	if err != nil {
		t.Fatalf("failed to insert playlist: %v", err)
	}

	_, err = app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, published_at, thumbnail_url, custom_thumb_updated_at)
		VALUES ('v-thumb-1', 'Episode 1', '2026-01-02T00:00:00Z', 'https://example.com/yt_v1.jpg?v=1777888999', 1777888999)
	`)
	if err != nil {
		t.Fatalf("failed to insert video: %v", err)
	}

	_, err = app.db.conn.Exec(`
		INSERT INTO yt_playlist_items (playlist_id, video_id, position)
		VALUES ('pl-draft-test', 'v-thumb-1', 0)
	`)
	if err != nil {
		t.Fatalf("failed to insert playlist item: %v", err)
	}

	app.configMu.Lock()
	if app.config.TagPlaylistConfigs == nil {
		app.config.TagPlaylistConfigs = make(map[string]TagPlaylistConfig)
	}
	app.config.TagPlaylistConfigs["Pre-Configured Tag"] = TagPlaylistConfig{
		VodPlaylistID: "pl-draft-test",
	}
	app.configMu.Unlock()

	draft, err := app.GetPlaylistCatalogDraft("pl-draft-test")
	if err != nil {
		t.Fatalf("GetPlaylistCatalogDraft failed: %v", err)
	}

	if draft.Tag != "Pre-Configured Tag" || !draft.Linked || draft.TagConfidence != "known" {
		t.Errorf("expected Pre-Configured Tag, linked=true, known; got tag=%s, linked=%v, conf=%s", draft.Tag, draft.Linked, draft.TagConfidence)
	}
	if draft.ThumbnailUrl != "/cache/yt_thumbs/pl_test.jpg" {
		t.Errorf("expected draft.ThumbnailUrl '/cache/yt_thumbs/pl_test.jpg', got %s", draft.ThumbnailUrl)
	}
	if len(draft.Videos) != 1 {
		t.Fatalf("expected 1 video in draft, got %d", len(draft.Videos))
	}
	if draft.Videos[0].ThumbnailUpdatedAt != 1777888999 {
		t.Errorf("expected video ThumbnailUpdatedAt 1777888999, got %d", draft.Videos[0].ThumbnailUpdatedAt)
	}
}

func TestApplyPlaylistCatalog_UpdateLocal(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	localFilePath := filepath.Join(t.TempDir(), "hades_01.mp4")

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, local_file)
		VALUES ('vid-loc-1', 'Hades Ep 1', ?)
	`, localFilePath)
	if err != nil {
		t.Fatalf("failed to insert video: %v", err)
	}

	req := CatalogApplyRequest{
		PlaylistID:  "pl-local-sync",
		Tag:         "Hades II",
		Kind:        "vod",
		UpdateLocal: true,
		Assignments: []CatalogAssignment{
			{VideoID: "vid-loc-1", Episode: 10},
		},
	}

	err = app.ApplyPlaylistCatalog(req)
	if err != nil {
		t.Fatalf("ApplyPlaylistCatalog failed: %v", err)
	}

	app.configMu.Lock()
	gameTag := app.config.VideoGames[localFilePath]
	meta := app.config.VideoMetadata[localFilePath]
	app.configMu.Unlock()

	if gameTag != "Hades II" {
		t.Errorf("expected VideoGames[%q] == 'Hades II', got %q", localFilePath, gameTag)
	}
	if meta.Game != "Hades II" || meta.Episode != 10 || meta.PlaylistID != "pl-local-sync" || meta.ContentType != "vod" {
		t.Errorf("expected VideoMetadata updated: Game='Hades II', Episode=10, PlaylistID='pl-local-sync', ContentType='vod'; got %+v", meta)
	}
}

func TestListCatalogPlaylists_CustomTemplateAndPreviewPrecedence(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// 1. Setup cache dir and write a tag_template thumbnail for "Hades"
	cacheDir := t.TempDir()
	app.cacheDir = cacheDir
	thumbDir := filepath.Join(cacheDir, "yt_thumbs")
	if err := os.MkdirAll(thumbDir, 0755); err != nil {
		t.Fatalf("failed to create thumb dir: %v", err)
	}
	hadesKey := customThumbKey("tag_template_hades")
	hadesThumbPath := filepath.Join(thumbDir, hadesKey+".jpg")
	if err := os.WriteFile(hadesThumbPath, []byte("fake-hades-preview"), 0644); err != nil {
		t.Fatalf("failed to write hades preview: %v", err)
	}

	// 2. Insert playlists
	// pl-hades: default YT thumb, has tag template file & config
	// pl-elden: default YT thumb, no template file, but has video with custom_thumb_updated_at > 0
	// pl-explicit: already has explicit /cache/yt_thumbs/ cover, has tag template file
	// pl-none: default YT thumb, no custom config, no custom video
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, video_count, thumbnail_url, published_at) VALUES
		('pl-hades', 'Hades VODs', 2, 'https://i.ytimg.com/vi/default_hades.jpg', '2026-01-01T00:00:00Z'),
		('pl-elden', 'Elden Ring VODs', 1, 'https://i.ytimg.com/vi/default_elden.jpg', '2026-01-02T00:00:00Z'),
		('pl-explicit', 'Hades Clips', 1, '/cache/yt_thumbs/playlist_pl-explicit.jpg', '2026-01-03T00:00:00Z'),
		('pl-none', 'Random Game', 1, 'https://i.ytimg.com/vi/default_none.jpg', '2026-01-04T00:00:00Z');

		INSERT INTO yt_videos (id, title, published_at, thumbnail_url, custom_thumb_updated_at) VALUES
		('v-elden-1', 'Elden Ep 1', '2026-01-02T01:00:00Z', 'https://custom.thumb/elden_1.jpg?v=177', 177),
		('v-none-1', 'None Ep 1', '2026-01-04T01:00:00Z', 'https://i.ytimg.com/vi/none_1.jpg', 0);

		INSERT INTO yt_playlist_items (playlist_id, video_id, position) VALUES
		('pl-elden', 'v-elden-1', 0),
		('pl-none', 'v-none-1', 0);
	`)
	if err != nil {
		t.Fatalf("failed to insert fixtures: %v", err)
	}

	app.configMu.Lock()
	if app.config.TagPlaylistConfigs == nil {
		app.config.TagPlaylistConfigs = make(map[string]TagPlaylistConfig)
	}
	app.config.TagPlaylistConfigs["Hades"] = TagPlaylistConfig{
		VodPlaylistID: "pl-hades",
		ThumbnailConfig: TagThumbnailConfig{
			Enabled: true,
		},
	}
	app.configMu.Unlock()

	summaries, err := app.ListCatalogPlaylists()
	if err != nil {
		t.Fatalf("ListCatalogPlaylists failed: %v", err)
	}

	byID := make(map[string]CatalogPlaylistSummary)
	for _, s := range summaries {
		byID[s.PlaylistID] = s
	}

	// pl-hades: should have HasCustomTemplate = true, and ThumbnailUrl resolved to /cache/yt_thumbs/...
	sHades, ok := byID["pl-hades"]
	if !ok {
		t.Fatalf("missing pl-hades in summaries")
	}
	if !sHades.HasCustomTemplate {
		t.Errorf("expected pl-hades HasCustomTemplate to be true")
	}
	if !strings.HasPrefix(sHades.ThumbnailUrl, "/cache/yt_thumbs/"+hadesKey+".jpg") {
		t.Errorf("expected pl-hades ThumbnailUrl to start with /cache/yt_thumbs/%s.jpg, got %s", hadesKey, sHades.ThumbnailUrl)
	}

	// pl-elden: should prefer video custom thumb over default YT thumbnail
	sElden, ok := byID["pl-elden"]
	if !ok {
		t.Fatalf("missing pl-elden in summaries")
	}
	if sElden.ThumbnailUrl != "https://custom.thumb/elden_1.jpg?v=177" {
		t.Errorf("expected pl-elden ThumbnailUrl to be video custom thumb, got %s", sElden.ThumbnailUrl)
	}

	// pl-explicit: should keep explicit /cache/yt_thumbs/ cover untouched
	sExplicit, ok := byID["pl-explicit"]
	if !ok {
		t.Fatalf("missing pl-explicit in summaries")
	}
	if sExplicit.ThumbnailUrl != "/cache/yt_thumbs/playlist_pl-explicit.jpg" {
		t.Errorf("expected pl-explicit ThumbnailUrl to be preserved, got %s", sExplicit.ThumbnailUrl)
	}

	// pl-none: HasCustomTemplate should be false, ThumbnailUrl should be default
	sNone, ok := byID["pl-none"]
	if !ok {
		t.Fatalf("missing pl-none in summaries")
	}
	if sNone.HasCustomTemplate {
		t.Errorf("expected pl-none HasCustomTemplate to be false")
	}
	if sNone.ThumbnailUrl != "https://i.ytimg.com/vi/default_none.jpg" {
		t.Errorf("expected pl-none ThumbnailUrl to be default, got %s", sNone.ThumbnailUrl)
	}

	// Also verify GetPlaylistCatalogDraft
	draftHades, err := app.GetPlaylistCatalogDraft("pl-hades")
	if err != nil {
		t.Fatalf("GetPlaylistCatalogDraft pl-hades failed: %v", err)
	}
	if !draftHades.HasCustomTemplate {
		t.Errorf("expected draftHades.HasCustomTemplate to be true")
	}
	if !strings.HasPrefix(draftHades.ThumbnailUrl, "/cache/yt_thumbs/"+hadesKey+".jpg") {
		t.Errorf("expected draftHades.ThumbnailUrl to start with /cache/yt_thumbs/%s.jpg, got %s", hadesKey, draftHades.ThumbnailUrl)
	}
}

func TestResolveVideoThumbnailCandidate(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	app.cacheDir = t.TempDir()
	ytThumbsDir := filepath.Join(app.cacheDir, "yt_thumbs")
	if err := os.MkdirAll(ytThumbsDir, 0755); err != nil {
		t.Fatalf("failed to create yt_thumbs dir: %v", err)
	}

	vidWithCache := "vid-with-local"
	key := customThumbKey("yt:" + vidWithCache)
	cacheFile := filepath.Join(ytThumbsDir, key+".jpg")
	if err := os.WriteFile(cacheFile, []byte("fake-jpeg"), 0644); err != nil {
		t.Fatalf("failed to write cache file: %v", err)
	}

	// 1. Video with local cache file (yt:<vid>) should return /cache/yt_thumbs/<key>.jpg?v=<modtime>
	resolved := app.resolveVideoThumbnailCandidate(vidWithCache, "", nil, "https://i.ytimg.com/vi/vid-with-local/maxresdefault.jpg")
	if !strings.HasPrefix(resolved, "/cache/yt_thumbs/"+key+".jpg?v=") {
		t.Errorf("expected local cache preview URL, got %q", resolved)
	}

	// 2. Video with episode cache key (<vid>_<ep>)
	epVid := "vid-ep-test"
	epKey := customThumbKey(epVid + "_2")
	epCacheFile := filepath.Join(ytThumbsDir, epKey+".jpg")
	if err := os.WriteFile(epCacheFile, []byte("fake-jpeg-ep"), 0644); err != nil {
		t.Fatalf("failed to write ep cache file: %v", err)
	}
	ep2 := 2
	resolvedEp := app.resolveVideoThumbnailCandidate(epVid, "", &ep2, "https://i.ytimg.com/vi/vid-ep-test/maxresdefault.jpg")
	if !strings.HasPrefix(resolvedEp, "/cache/yt_thumbs/"+epKey+".jpg?v=") {
		t.Errorf("expected episode cache URL, got %q", resolvedEp)
	}

	// 3. Video with localFile key
	localFilePath := "C:\\Videos\\Game_03.mp4"
	localFileKey := customThumbKey(localFilePath)
	localCacheFile := filepath.Join(ytThumbsDir, localFileKey+".jpg")
	if err := os.WriteFile(localCacheFile, []byte("fake-jpeg-local"), 0644); err != nil {
		t.Fatalf("failed to write local file cache: %v", err)
	}
	resolvedLocalFile := app.resolveVideoThumbnailCandidate("vid-other", localFilePath, nil, "https://i.ytimg.com/vi/vid-other/maxresdefault.jpg")
	if !strings.HasPrefix(resolvedLocalFile, "/cache/yt_thumbs/"+localFileKey+".jpg?v=") {
		t.Errorf("expected localFile cache URL, got %q", resolvedLocalFile)
	}

	// 4. Video without local cache should strip ?v= query params from i.ytimg.com
	vidWithoutCache := "vid-no-local"
	urlWithQuery := "https://i.ytimg.com/vi/vid-no-local/maxresdefault.jpg?v=1792994612"
	resolvedNoCache := app.resolveVideoThumbnailCandidate(vidWithoutCache, "", nil, urlWithQuery)
	expectedClean := "https://i.ytimg.com/vi/vid-no-local/maxresdefault.jpg"
	if resolvedNoCache != expectedClean {
		t.Errorf("expected clean URL %q, got %q", expectedClean, resolvedNoCache)
	}
}

func TestGetPlaylistCatalogDraft_BackfillThumbnailUpdatedAtAndEpisode(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpCache := t.TempDir()
	app.cacheDir = tmpCache
	ytThumbsDir := filepath.Join(tmpCache, "yt_thumbs")
	if err := os.MkdirAll(ytThumbsDir, 0755); err != nil {
		t.Fatalf("failed to create yt_thumbs dir: %v", err)
	}

	// File 1: yt:vid-cache-backfill
	k1 := customThumbKey("yt:vid-cache-backfill")
	f1 := filepath.Join(ytThumbsDir, k1+".jpg")
	if err := os.WriteFile(f1, []byte("fake-jpg-1"), 0644); err != nil {
		t.Fatalf("failed to write f1: %v", err)
	}

	// File 3: vid-ep-backfill_3
	k3 := customThumbKey("vid-ep-backfill_3")
	f3 := filepath.Join(ytThumbsDir, k3+".jpg")
	if err := os.WriteFile(f3, []byte("fake-jpg-3"), 0644); err != nil {
		t.Fatalf("failed to write f3: %v", err)
	}

	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, video_count, published_at)
		VALUES ('pl-backfill', 'Backfill Playlist', 3, '2026-01-01T00:00:00Z')
	`)
	if err != nil {
		t.Fatalf("failed to insert playlist: %v", err)
	}

	// Video 1: 0 timestamp and 0 custom_thumb_episode in DB, but has file on disk
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, published_at, thumbnail_url, custom_thumb_updated_at, custom_thumb_episode)
		VALUES ('vid-cache-backfill', 'Vid 1', '2026-01-01T00:00:00Z', 'https://example.com/v1.jpg', 0, 0)
	`)
	if err != nil {
		t.Fatalf("failed to insert vid 1: %v", err)
	}

	// Video 2: Explicitly persisted timestamp and episode in DB
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, published_at, thumbnail_url, custom_thumb_updated_at, custom_thumb_episode)
		VALUES ('vid-db-persisted', 'Vid 2', '2026-01-02T00:00:00Z', 'https://example.com/v2.jpg', 1888999000, 5)
	`)
	if err != nil {
		t.Fatalf("failed to insert vid 2: %v", err)
	}

	// Video 3: 0 timestamp and 0 custom_thumb_episode in DB, but has episode cache file (<vid>_3)
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, published_at, thumbnail_url, episode, custom_thumb_updated_at, custom_thumb_episode)
		VALUES ('vid-ep-backfill', 'Vid 3', '2026-01-03T00:00:00Z', 'https://example.com/v3.jpg', 3, 0, 0)
	`)
	if err != nil {
		t.Fatalf("failed to insert vid 3: %v", err)
	}

	// Playlist items
	for i, vid := range []string{"vid-cache-backfill", "vid-db-persisted", "vid-ep-backfill"} {
		_, err = app.db.conn.Exec(`INSERT INTO yt_playlist_items (playlist_id, video_id, position) VALUES ('pl-backfill', ?, ?)`, vid, i)
		if err != nil {
			t.Fatalf("failed to insert item %d: %v", i, err)
		}
	}

	draft, err := app.GetPlaylistCatalogDraft("pl-backfill")
	if err != nil {
		t.Fatalf("GetPlaylistCatalogDraft failed: %v", err)
	}

	if len(draft.Videos) != 3 {
		t.Fatalf("expected 3 videos, got %d", len(draft.Videos))
	}

	// Check Video 1: backfilled ThumbnailUpdatedAt from disk
	v1 := draft.Videos[0]
	if v1.ThumbnailUpdatedAt <= 0 {
		t.Errorf("expected v1.ThumbnailUpdatedAt > 0 backfilled from disk, got %d", v1.ThumbnailUpdatedAt)
	}
	if !strings.HasPrefix(v1.ThumbnailUrl, "/cache/yt_thumbs/"+k1+".jpg?v=") {
		t.Errorf("expected v1.ThumbnailUrl to use cached file, got %q", v1.ThumbnailUrl)
	}

	// Check Video 2: keeps DB custom_thumb_updated_at and custom_thumb_episode
	v2 := draft.Videos[1]
	if v2.ThumbnailUpdatedAt != 1888999000 {
		t.Errorf("expected v2.ThumbnailUpdatedAt 1888999000, got %d", v2.ThumbnailUpdatedAt)
	}
	if v2.ThumbnailEpisode != 5 {
		t.Errorf("expected v2.ThumbnailEpisode 5, got %d", v2.ThumbnailEpisode)
	}

	// Check Video 3: backfilled ThumbnailUpdatedAt and ThumbnailEpisode from episode cache file
	v3 := draft.Videos[2]
	if v3.ThumbnailUpdatedAt <= 0 {
		t.Errorf("expected v3.ThumbnailUpdatedAt > 0 backfilled from disk, got %d", v3.ThumbnailUpdatedAt)
	}
	if v3.ThumbnailEpisode != 3 {
		t.Errorf("expected v3.ThumbnailEpisode 3 backfilled from matched episode cache file, got %d", v3.ThumbnailEpisode)
	}
}


