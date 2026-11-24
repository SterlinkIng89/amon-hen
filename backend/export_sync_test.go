package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func insertTestYouTubeVideo(t *testing.T, app *App, id, title, privacy, thumb string) {
	t.Helper()
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, description, published_at, thumbnail_url, view_count, like_count, duration, privacy, synced_at)
		VALUES (?, ?, '', '2026-11-23T00:00:00Z', ?, 0, 0, 'PT10M', ?, 1700000000)
	`, id, title, thumb, privacy)
	if err != nil {
		t.Fatalf("failed to insert yt_videos row %s: %v", id, err)
	}
}

func TestMatchExportedVideos_MatchesAndLinksLocalFile(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	app.configPath = filepath.Join(tmpDir, "config.json")

	sourceFile := filepath.Join(tmpDir, "source.mp4")
	exportedFile := filepath.Join(tmpDir, "AH-1111AAAA - Hades.mp4")
	if err := os.WriteFile(sourceFile, []byte("src"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(exportedFile, []byte("exp"), 0644); err != nil {
		t.Fatal(err)
	}

	fallbackExported := filepath.Join(tmpDir, "AH-2222BBBB - Celeste.mp4")
	if err := os.WriteFile(fallbackExported, []byte("exp2"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-1111AAAA",
		SourcePath:   sourceFile,
		ExportedPath: exportedFile,
		TargetTitle:  "Hades - Ep 5 - 23/11/2026",
		GameTag:      "hades",
		Episode:      5,
		Status:       "exported",
	}); err != nil {
		t.Fatal(err)
	}

	// source_path missing -> should fall back to exported_path
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-2222BBBB",
		SourcePath:   filepath.Join(tmpDir, "deleted_source.mp4"),
		ExportedPath: fallbackExported,
		TargetTitle:  "Celeste - Ep 2",
		GameTag:      "celeste",
		Episode:      2,
		Status:       "failed",
		ErrorMsg:     "previous transient error",
	}); err != nil {
		t.Fatal(err)
	}

	// Already applied -> must not be re-matched
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-3333CCCC",
		SourcePath:   sourceFile,
		ExportedPath: exportedFile,
		TargetTitle:  "Already Applied",
		Status:       "applied",
		YouTubeID:    "yt-already",
	}); err != nil {
		t.Fatal(err)
	}

	insertTestYouTubeVideo(t, app, "yt-1", "AH-1111AAAA - Hades", "private", "https://img/1.jpg")
	insertTestYouTubeVideo(t, app, "yt-2", "My Upload [AH-2222BBBB]", "unlisted", "https://img/2.jpg")
	insertTestYouTubeVideo(t, app, "yt-3", "AH-3333CCCC - Ignored", "public", "https://img/3.jpg")

	count, err := app.MatchExportedVideos()
	if err != nil {
		t.Fatalf("MatchExportedVideos failed: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 matched videos, got %d", count)
	}

	var status, ytID, errMsg string
	if err := app.db.conn.QueryRow(`SELECT status, youtube_id, error_msg FROM exported_videos WHERE export_id = 'AH-1111AAAA'`).Scan(&status, &ytID, &errMsg); err != nil {
		t.Fatal(err)
	}
	if status != "matched" || ytID != "yt-1" || errMsg != "" {
		t.Fatalf("unexpected AH-1111AAAA state: status=%q ytID=%q errMsg=%q", status, ytID, errMsg)
	}

	var localFile, gameTag string
	var episode int
	if err := app.db.conn.QueryRow(`SELECT local_file, game_tag, episode FROM yt_videos WHERE id = 'yt-1'`).Scan(&localFile, &gameTag, &episode); err != nil {
		t.Fatal(err)
	}
	if localFile != sourceFile || gameTag != "hades" || episode != 5 {
		t.Fatalf("unexpected yt_videos link for yt-1: local=%q game=%q ep=%d", localFile, gameTag, episode)
	}

	if err := app.db.conn.QueryRow(`SELECT local_file, game_tag, episode FROM yt_videos WHERE id = 'yt-2'`).Scan(&localFile, &gameTag, &episode); err != nil {
		t.Fatal(err)
	}
	if localFile != fallbackExported || gameTag != "celeste" || episode != 2 {
		t.Fatalf("unexpected yt_videos fallback link for yt-2: local=%q game=%q ep=%d", localFile, gameTag, episode)
	}

	if app.config.VideoMetadata[sourceFile].YouTubeID != "yt-1" {
		t.Fatalf("expected config VideoMetadata for sourceFile to link to yt-1, got %q", app.config.VideoMetadata[sourceFile].YouTubeID)
	}
	if app.config.VideoMetadata[fallbackExported].YouTubeID != "yt-2" {
		t.Fatalf("expected config VideoMetadata for fallbackExported to link to yt-2, got %q", app.config.VideoMetadata[fallbackExported].YouTubeID)
	}
}

func TestGetMatchedExports_QuotaAndPlaylistDedup(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	insertTestYouTubeVideo(t, app, "yt-a", "AH-AAAA1111 - Game A", "private", "https://img/a.jpg")
	insertTestYouTubeVideo(t, app, "yt-b", "AH-BBBB2222 - Game B", "unlisted", "https://img/b.jpg")

	if _, err := app.db.conn.Exec(`INSERT INTO yt_playlist_items (playlist_id, video_id, position) VALUES ('PL-1', 'yt-a', 0)`); err != nil {
		t.Fatal(err)
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-AAAA1111",
		SourcePath:  "a.mp4",
		TargetTitle: "Game A Ep 1",
		PlaylistID:  "PL-1",
		Status:      "matched",
		YouTubeID:   "yt-a",
		ExportedAt:  100,
	}); err != nil {
		t.Fatal(err)
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-BBBB2222",
		SourcePath:  "b.mp4",
		TargetTitle: "Game B Ep 2",
		PlaylistID:  "PL-1",
		Status:      "failed",
		YouTubeID:   "yt-b",
		ErrorMsg:    "network error",
		ExportedAt:  200,
	}); err != nil {
		t.Fatal(err)
	}

	items, err := app.GetMatchedExports()
	if err != nil {
		t.Fatalf("GetMatchedExports failed: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}

	// Ordered by exported_at DESC -> AH-BBBB2222 first.
	if items[0].ExportID != "AH-BBBB2222" || items[0].AlreadyInPlaylist || items[0].EstimatedQuota != 100 {
		t.Fatalf("unexpected first item: %+v", items[0])
	}
	if items[1].ExportID != "AH-AAAA1111" || !items[1].AlreadyInPlaylist || items[1].EstimatedQuota != 50 {
		t.Fatalf("unexpected second item: %+v", items[1])
	}
	if items[1].YouTubeTitle != "AH-AAAA1111 - Game A" || items[1].YouTubePrivacy != "private" || items[1].ThumbnailURL != "https://img/a.jpg" {
		t.Fatalf("unexpected YouTube enrichment fields: %+v", items[1])
	}
}

func TestApplyMatchedExports_SuccessPlaylistDedupAndSafeCleanup(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	source1 := filepath.Join(tmpDir, "source1.mp4")
	exported1 := filepath.Join(tmpDir, "AH-11111111 - Game.mp4")
	sidecar1 := filepath.Join(tmpDir, "AH-11111111 - Game.txt")
	samePath := filepath.Join(tmpDir, "same_source_and_export.mp4")

	for _, f := range []string{source1, exported1, sidecar1, samePath} {
		if err := os.WriteFile(f, []byte("data"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-11111111",
		SourcePath:   source1,
		ExportedPath: exported1,
		TargetTitle:  "Final Title 1",
		Description:  "Desc 1",
		Privacy:      "public",
		PlaylistID:   "PL-NEW",
		Status:       "matched",
		YouTubeID:    "yt-1",
	}); err != nil {
		t.Fatal(err)
	}

	// Already in PL-DUP and exported_path == source_path (must NOT delete samePath)
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-22222222",
		SourcePath:   samePath,
		ExportedPath: samePath,
		TargetTitle:  "Final Title 2",
		Description:  "Desc 2",
		Privacy:      "unlisted",
		PlaylistID:   "PL-DUP",
		Status:       "matched",
		YouTubeID:    "yt-2",
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := app.db.conn.Exec(`INSERT INTO yt_playlist_items (playlist_id, video_id, position) VALUES ('PL-DUP', 'yt-2', 0)`); err != nil {
		t.Fatal(err)
	}

	var updatedCalls []string
	var playlistCalls []string

	res, err := app.applyMatchedExportsWithDeps(
		[]string{"AH-11111111", "AH-22222222", "AH-MISSING"},
		true,
		true,
		func(videoID, title, description, privacy string) error {
			updatedCalls = append(updatedCalls, fmt.Sprintf("%s:%s:%s", videoID, title, privacy))
			return nil
		},
		func(playlistID, videoID string) error {
			playlistCalls = append(playlistCalls, fmt.Sprintf("%s:%s", playlistID, videoID))
			return nil
		},
	)
	if err != nil {
		t.Fatalf("applyMatchedExportsWithDeps failed: %v", err)
	}

	if len(res.Applied) != 2 || len(res.Failed) != 0 || len(res.Skipped) != 1 || res.StoppedOnQuota {
		t.Fatalf("unexpected apply result: %+v", res)
	}
	if len(updatedCalls) != 2 {
		t.Fatalf("expected 2 metadata updates, got %v", updatedCalls)
	}
	// Only PL-NEW:yt-1 should be inserted; PL-DUP:yt-2 is deduplicated.
	if len(playlistCalls) != 1 || playlistCalls[0] != "PL-NEW:yt-1" {
		t.Fatalf("expected only [PL-NEW:yt-1], got %v", playlistCalls)
	}

	// exported1 and sidecar1 deleted; source1 and samePath preserved.
	if _, err := os.Stat(exported1); !os.IsNotExist(err) {
		t.Fatalf("expected exported1 to be deleted")
	}
	if _, err := os.Stat(sidecar1); !os.IsNotExist(err) {
		t.Fatalf("expected sidecar1 to be deleted")
	}
	if _, err := os.Stat(source1); err != nil {
		t.Fatalf("expected source1 to remain intact, got %v", err)
	}
	if _, err := os.Stat(samePath); err != nil {
		t.Fatalf("expected samePath (exported_path == source_path) to remain intact, got %v", err)
	}
	if len(res.CleanedUpPaths) != 2 {
		t.Fatalf("expected 2 cleaned up paths, got %v", res.CleanedUpPaths)
	}

	var status string
	var appliedAt int64
	if err := app.db.conn.QueryRow(`SELECT status, applied_at FROM exported_videos WHERE export_id = 'AH-11111111'`).Scan(&status, &appliedAt); err != nil {
		t.Fatal(err)
	}
	if status != "applied" || appliedAt == 0 {
		t.Fatalf("expected applied status with applied_at > 0, got status=%q appliedAt=%d", status, appliedAt)
	}
}

func TestApplyMatchedExports_StopsOnQuotaAndMarksNonQuotaFailures(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	for _, id := range []string{"AH-ERR11111", "AH-QUOTA222", "AH-REMAIN33"} {
		if err := app.insertExportedVideo(ExportedVideoRecord{
			ExportID:    id,
			SourcePath:  id + ".mp4",
			TargetTitle: "Title " + id,
			Status:      "matched",
			YouTubeID:   "yt-" + id,
		}); err != nil {
			t.Fatal(err)
		}
	}

	var calls []string
	res, err := app.applyMatchedExportsWithDeps(
		[]string{"AH-ERR11111", "AH-QUOTA222", "AH-REMAIN33"},
		false,
		false,
		func(videoID, title, description, privacy string) error {
			calls = append(calls, videoID)
			if videoID == "yt-AH-ERR11111" {
				return fmt.Errorf("transient 500 error")
			}
			if videoID == "yt-AH-QUOTA222" {
				return fmt.Errorf("googleapi: Error 403: quotaExceeded")
			}
			return nil
		},
		func(playlistID, videoID string) error { return nil },
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !res.StoppedOnQuota {
		t.Fatalf("expected StoppedOnQuota to be true")
	}
	if len(calls) != 2 {
		t.Fatalf("expected loop to stop on quota after 2 calls, got %v", calls)
	}
	if len(res.Failed) != 2 {
		t.Fatalf("expected 2 entries in Failed, got %v", res.Failed)
	}

	var stErr, msgErr, stQuota, stRemain string
	_ = app.db.conn.QueryRow(`SELECT status, error_msg FROM exported_videos WHERE export_id = 'AH-ERR11111'`).Scan(&stErr, &msgErr)
	_ = app.db.conn.QueryRow(`SELECT status FROM exported_videos WHERE export_id = 'AH-QUOTA222'`).Scan(&stQuota)
	_ = app.db.conn.QueryRow(`SELECT status FROM exported_videos WHERE export_id = 'AH-REMAIN33'`).Scan(&stRemain)

	if stErr != "failed" || msgErr == "" {
		t.Fatalf("expected AH-ERR11111 to be failed with error_msg, got %q %q", stErr, msgErr)
	}
	if stQuota != "matched" || stRemain != "matched" {
		t.Fatalf("expected quota-stopped and remaining items to stay matched, got %q and %q", stQuota, stRemain)
	}
}
