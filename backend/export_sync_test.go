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

func TestGetMatchedExports_AutoMatchesPendingExports(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	insertTestYouTubeVideo(t, app, "yt-pending", "AH-CCCC3333 - Uploaded Clip", "private", "https://img/c.jpg")

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-CCCC3333",
		SourcePath:  "c.mp4",
		TargetTitle: "Game C Ep 3",
		Status:      "exported",
		ExportedAt:  300,
	}); err != nil {
		t.Fatal(err)
	}

	items, err := app.GetMatchedExports()
	if err != nil {
		t.Fatalf("GetMatchedExports failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 auto-matched item, got %d", len(items))
	}
	if items[0].ExportID != "AH-CCCC3333" || items[0].Status != "matched" || items[0].YouTubeID != "yt-pending" {
		t.Fatalf("unexpected auto-matched item: %+v", items[0])
	}
	if items[0].YouTubeTitle != "AH-CCCC3333 - Uploaded Clip" || items[0].ThumbnailURL != "https://img/c.jpg" {
		t.Fatalf("unexpected YouTube enrichment fields: %+v", items[0])
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

func TestMatchExportedVideos_BackupFallbackPriority(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	app.configPath = filepath.Join(tmpDir, "config.json")
	backupRoot := filepath.Join(tmpDir, "backups")
	if err := os.MkdirAll(backupRoot, 0755); err != nil {
		t.Fatal(err)
	}
	app.config.BackupFolder = backupRoot

	// Case 1: source_path deleted, backup exists in video_backups -> must link backup_path
	deletedSource1 := filepath.Join(tmpDir, "outplayed", "clip1.mp4")
	backupFile1 := filepath.Join(backupRoot, "outplayed", "clip1.mp4")
	if err := os.MkdirAll(filepath.Dir(backupFile1), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backupFile1, []byte("backup-data"), 0644); err != nil {
		t.Fatal(err)
	}
	exportedFile1 := filepath.Join(tmpDir, "exports", "AH-BKP11111.mp4")
	if err := os.MkdirAll(filepath.Dir(exportedFile1), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(exportedFile1, []byte("export-data"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := app.db.conn.Exec(`
		INSERT INTO video_backups (source_path, backup_path, folder_root, file_size, file_mtime, backed_up_at, status)
		VALUES (?, ?, ?, 11, 1700000000, 1700000000, 'backed_up')
	`, normalizePath(deletedSource1), backupFile1, filepath.Join(tmpDir, "outplayed"))
	if err != nil {
		t.Fatal(err)
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-BKP11111",
		SourcePath:   deletedSource1,
		ExportedPath: exportedFile1,
		TargetTitle:  "Backup Fallback Episode",
		GameTag:      "hades",
		Episode:      10,
		Status:       "exported",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-bkp-1", "AH-BKP11111 - Hades", "private", "https://img/bkp1.jpg")

	// Case 2: source_path deleted AND backup file missing on disk -> must fall back to exported_path
	deletedSource2 := filepath.Join(tmpDir, "outplayed", "clip2.mp4")
	missingBackup2 := filepath.Join(backupRoot, "outplayed", "clip2.mp4")
	exportedFile2 := filepath.Join(tmpDir, "exports", "AH-EXP22222.mp4")
	if err := os.WriteFile(exportedFile2, []byte("export-data-2"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err = app.db.conn.Exec(`
		INSERT INTO video_backups (source_path, backup_path, folder_root, file_size, file_mtime, backed_up_at, status)
		VALUES (?, ?, ?, 13, 1700000000, 1700000000, 'backed_up')
	`, normalizePath(deletedSource2), missingBackup2, filepath.Join(tmpDir, "outplayed"))
	if err != nil {
		t.Fatal(err)
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-EXP22222",
		SourcePath:   deletedSource2,
		ExportedPath: exportedFile2,
		TargetTitle:  "Exported Fallback Episode",
		GameTag:      "celeste",
		Episode:      11,
		Status:       "exported",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-exp-2", "AH-EXP22222 - Celeste", "private", "https://img/exp2.jpg")

	count, err := app.MatchExportedVideos()
	if err != nil {
		t.Fatalf("MatchExportedVideos failed: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 matched videos, got %d", count)
	}

	var localFile1, localFile2 string
	if err := app.db.conn.QueryRow(`SELECT local_file FROM yt_videos WHERE id = 'yt-bkp-1'`).Scan(&localFile1); err != nil {
		t.Fatal(err)
	}
	if localFile1 != backupFile1 {
		t.Fatalf("expected yt-bkp-1 local_file to resolve to backupPath %q, got %q", backupFile1, localFile1)
	}

	if err := app.db.conn.QueryRow(`SELECT local_file FROM yt_videos WHERE id = 'yt-exp-2'`).Scan(&localFile2); err != nil {
		t.Fatal(err)
	}
	if localFile2 != exportedFile2 {
		t.Fatalf("expected yt-exp-2 local_file to fall back to exportedPath %q, got %q", exportedFile2, localFile2)
	}
}

func TestApplyMatchedExports_CleanupSafetyGuards(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()
	backupRoot := filepath.Join(tmpDir, "backups")
	if err := os.MkdirAll(backupRoot, 0755); err != nil {
		t.Fatal(err)
	}
	app.config.BackupFolder = backupRoot

	// Guard 1: exported_path inside BackupFolder must NEVER be deleted
	fileInBackup := filepath.Join(backupRoot, "sub", "AH-GUARD111.mp4")
	if err := os.MkdirAll(filepath.Dir(fileInBackup), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileInBackup, []byte("backup-keep"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-GUARD111",
		SourcePath:   filepath.Join(tmpDir, "missing_src_1.mp4"),
		ExportedPath: fileInBackup,
		TargetTitle:  "Guard Backup Folder",
		Privacy:      "public",
		Status:       "matched",
		YouTubeID:    "yt-guard-1",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-guard-1", "AH-GUARD111", "private", "")

	// Guard 2: exported_path that is currently the active local_file in yt_videos must NEVER be deleted
	activeLocalExport := filepath.Join(tmpDir, "exports", "AH-GUARD222.mp4")
	if err := os.MkdirAll(filepath.Dir(activeLocalExport), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(activeLocalExport, []byte("active-keep"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:     "AH-GUARD222",
		SourcePath:   filepath.Join(tmpDir, "missing_src_2.mp4"),
		ExportedPath: activeLocalExport,
		TargetTitle:  "Guard Active Local File",
		Privacy:      "public",
		Status:       "matched",
		YouTubeID:    "yt-guard-2",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-guard-2", "AH-GUARD222", "private", "")
	if _, err := app.db.conn.Exec(`UPDATE yt_videos SET local_file = ? WHERE id = 'yt-guard-2'`, activeLocalExport); err != nil {
		t.Fatal(err)
	}

	noopMeta := func(videoID, title, description, privacy string) error { return nil }
	noopPlaylist := func(playlistID, videoID string) error { return nil }

	res, err := app.applyMatchedExportsWithDeps([]string{"AH-GUARD111", "AH-GUARD222"}, false, true, noopMeta, noopPlaylist)
	if err != nil {
		t.Fatalf("applyMatchedExportsWithDeps failed: %v", err)
	}
	if len(res.Applied) != 2 {
		t.Fatalf("expected 2 applied exports, got %v", res.Applied)
	}
	if len(res.CleanedUpPaths) != 0 {
		t.Fatalf("expected 0 cleaned up paths due to safety guards, got %v", res.CleanedUpPaths)
	}
	if _, err := os.Stat(fileInBackup); err != nil {
		t.Fatalf("expected file inside BackupFolder to remain on disk, got err=%v", err)
	}
	if _, err := os.Stat(activeLocalExport); err != nil {
		t.Fatalf("expected active yt_videos.local_file to remain on disk, got err=%v", err)
	}
}

func TestUpdateExportTargetTitle(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-TITLE1",
		SourcePath:  "/videos/clip1.mp4",
		TargetTitle: "Old Title",
		Status:      "matched",
		YouTubeID:   "yt-t1",
	}); err != nil {
		t.Fatal(err)
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-TITLE2",
		SourcePath:  "/videos/clip2.mp4",
		TargetTitle: "Applied Title",
		Status:      "applied",
		YouTubeID:   "yt-t2",
	}); err != nil {
		t.Fatal(err)
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-TITLE3",
		SourcePath:  "/videos/clip3.mp4",
		TargetTitle: "Dismissed Title",
		Status:      "dismissed",
	}); err != nil {
		t.Fatal(err)
	}

	if err := app.UpdateExportTargetTitle("AH-TITLE1", "  New Live Title  "); err != nil {
		t.Fatalf("expected UpdateExportTargetTitle to succeed, got: %v", err)
	}

	var updatedTitle string
	if err := app.db.conn.QueryRow(`SELECT target_title FROM exported_videos WHERE export_id = 'AH-TITLE1'`).Scan(&updatedTitle); err != nil {
		t.Fatal(err)
	}
	if updatedTitle != "New Live Title" {
		t.Fatalf("expected trimmed target_title %q, got %q", "New Live Title", updatedTitle)
	}

	if err := app.UpdateExportTargetTitle("   ", "Valid Title"); err == nil {
		t.Fatalf("expected error for empty/whitespace exportID")
	}
	if err := app.UpdateExportTargetTitle("AH-TITLE1", "   "); err == nil {
		t.Fatalf("expected error for empty/whitespace targetTitle")
	}
	if err := app.UpdateExportTargetTitle("AH-TITLE2", "Should Fail"); err == nil {
		t.Fatalf("expected error when updating applied export")
	}
	if err := app.UpdateExportTargetTitle("AH-TITLE3", "Should Fail"); err == nil {
		t.Fatalf("expected error when updating dismissed export")
	}
	if err := app.UpdateExportTargetTitle("AH-UNKNOWN", "Should Fail"); err == nil {
		t.Fatalf("expected error for unknown exportID")
	}
}

func TestGetMatchedExports_PrefersLiveYouTubeTitle(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	liveSource := "/videos/live_override.mp4"
	blankSource := "/videos/blank_override.mp4"

	app.config.VideoMetadata = map[string]VideoMeta{
		liveSource:  {YouTubeTitle: "  Live Manual YouTube Title  "},
		blankSource: {YouTubeTitle: "   "},
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-LIVE1",
		SourcePath:  liveSource,
		TargetTitle: "Stale Snapshot Title",
		Status:      "matched",
		YouTubeID:   "yt-live-1",
	}); err != nil {
		t.Fatal(err)
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-LIVE2",
		SourcePath:  blankSource,
		TargetTitle: "Fallback Snapshot Title",
		Status:      "matched",
		YouTubeID:   "yt-live-2",
	}); err != nil {
		t.Fatal(err)
	}

	insertTestYouTubeVideo(t, app, "yt-live-1", "AH-LIVE1", "private", "")
	insertTestYouTubeVideo(t, app, "yt-live-2", "AH-LIVE2", "private", "")

	items, err := app.GetMatchedExports()
	if err != nil {
		t.Fatalf("GetMatchedExports failed: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 matched exports, got %d", len(items))
	}

	gotTitles := make(map[string]string, len(items))
	for _, item := range items {
		gotTitles[item.ExportID] = item.TargetTitle
	}

	if gotTitles["AH-LIVE1"] != "Live Manual YouTube Title" {
		t.Fatalf("expected AH-LIVE1 to use live YouTubeTitle, got %q", gotTitles["AH-LIVE1"])
	}
	if gotTitles["AH-LIVE2"] != "Fallback Snapshot Title" {
		t.Fatalf("expected AH-LIVE2 to keep snapshot title when live YouTubeTitle is blank, got %q", gotTitles["AH-LIVE2"])
	}
}

func TestGetMatchedExports_LiveMetadataResolution(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	app.config.DefaultVideoDescription = "Default channel description\nSubscribe!"
	app.config.TagPlaylistConfigs = map[string]TagPlaylistConfig{
		"hades": {
			VodPlaylistID:  "pl-hades-vod",
			ClipPlaylistID: "pl-hades-clip",
		},
	}

	if _, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title) VALUES
		('pl-hades-vod', 'Hades VODs'),
		('pl-hades-clip', 'Hades Clips'),
		('pl-manual', 'Manual Override Playlist')
	`); err != nil {
		t.Fatalf("failed to seed yt_playlists: %v", err)
	}

	// Case 1: Empty descriptions -> DefaultVideoDescription; TagPlaylistConfigs clip; live privacy override
	clipSrc := "/videos/hades_clip.mp4"
	app.config.VideoMetadata = map[string]VideoMeta{
		clipSrc: {
			Privacy:     "unlisted",
			ContentType: "clip",
		},
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-RES-CLIP",
		SourcePath:  clipSrc,
		TargetTitle: "Hades Clip",
		Description: "   ",
		Privacy:     "private",
		GameTag:     "hades",
		Status:      "matched",
		YouTubeID:   "yt-res-1",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-res-1", "AH-RES-CLIP", "private", "")

	// Case 2: Explicit VideoMetadata.Description & PlaylistID override, already in playlist -> quota 50
	vodSrc := "/videos/hades_vod.mp4"
	app.config.VideoMetadata[vodSrc] = VideoMeta{
		Description: "Explicit video description",
		PlaylistID:  "pl-manual",
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:      "AH-RES-MANUAL",
		SourcePath:    vodSrc,
		TargetTitle:   "Hades VOD",
		Description:   "Snapshot description",
		PlaylistID:    "pl-hades-vod",
		PlaylistTitle: "Hades VODs",
		GameTag:       "hades",
		Status:        "matched",
		YouTubeID:     "yt-res-2",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-res-2", "AH-RES-MANUAL", "private", "")
	if _, err := app.db.conn.Exec(`INSERT INTO yt_playlist_items (playlist_id, video_id, position) VALUES ('pl-manual', 'yt-res-2', 0)`); err != nil {
		t.Fatal(err)
	}

	// Case 3: Explicit "none" opt-out in VideoMetadata -> PlaylistID "" and no tag fallback, snapshot description preserved
	optOutSrc := "/videos/hades_optout.mp4"
	app.config.VideoMetadata[optOutSrc] = VideoMeta{
		PlaylistID: "none",
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:      "AH-RES-NONE",
		SourcePath:    optOutSrc,
		TargetTitle:   "Hades OptOut",
		Description:   "Explicit export description",
		PlaylistID:    "pl-hades-vod",
		PlaylistTitle: "Hades VODs",
		GameTag:       "hades",
		Status:        "matched",
		YouTubeID:     "yt-res-3",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-res-3", "AH-RES-NONE", "private", "")

	// Case 4: Snapshot playlist_id="none" with no VideoMetadata override -> falls back to TagPlaylistConfigs vod & default privacy "private"
	noneSnapSrc := "/videos/hades_nonesnap.mp4"
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-RES-VOD",
		SourcePath:  noneSnapSrc,
		TargetTitle: "Hades VOD Fallback",
		PlaylistID:  "none",
		GameTag:     "hades",
		ContentType: "vod",
		Status:      "matched",
		YouTubeID:   "yt-res-4",
	}); err != nil {
		t.Fatal(err)
	}
	insertTestYouTubeVideo(t, app, "yt-res-4", "AH-RES-VOD", "private", "")

	items, err := app.GetMatchedExports()
	if err != nil {
		t.Fatalf("GetMatchedExports failed: %v", err)
	}
	byID := make(map[string]MatchedExportItem, len(items))
	for _, item := range items {
		byID[item.ExportID] = item
	}

	clipItem := byID["AH-RES-CLIP"]
	if clipItem.Description != "Default channel description\nSubscribe!" {
		t.Fatalf("AH-RES-CLIP expected default description, got %q", clipItem.Description)
	}
	if clipItem.Privacy != "unlisted" {
		t.Fatalf("AH-RES-CLIP expected privacy 'unlisted', got %q", clipItem.Privacy)
	}
	if clipItem.PlaylistID != "pl-hades-clip" || clipItem.PlaylistTitle != "Hades Clips" {
		t.Fatalf("AH-RES-CLIP expected pl-hades-clip / Hades Clips, got %q / %q", clipItem.PlaylistID, clipItem.PlaylistTitle)
	}
	if clipItem.AlreadyInPlaylist || clipItem.EstimatedQuota != quotaVideoMetadataUpdate+quotaPlaylistItemInsert {
		t.Fatalf("AH-RES-CLIP unexpected playlist/quota state: already=%v quota=%d", clipItem.AlreadyInPlaylist, clipItem.EstimatedQuota)
	}

	manualItem := byID["AH-RES-MANUAL"]
	if manualItem.Description != "Explicit video description" {
		t.Fatalf("AH-RES-MANUAL expected explicit description, got %q", manualItem.Description)
	}
	if manualItem.PlaylistID != "pl-manual" || manualItem.PlaylistTitle != "Manual Override Playlist" {
		t.Fatalf("AH-RES-MANUAL expected pl-manual / Manual Override Playlist, got %q / %q", manualItem.PlaylistID, manualItem.PlaylistTitle)
	}
	if !manualItem.AlreadyInPlaylist || manualItem.EstimatedQuota != quotaVideoMetadataUpdate {
		t.Fatalf("AH-RES-MANUAL expected alreadyInPlaylist=true and quota=50, got already=%v quota=%d", manualItem.AlreadyInPlaylist, manualItem.EstimatedQuota)
	}

	noneItem := byID["AH-RES-NONE"]
	if noneItem.Description != "Explicit export description" {
		t.Fatalf("AH-RES-NONE expected snapshot description, got %q", noneItem.Description)
	}
	if noneItem.PlaylistID != "" || noneItem.PlaylistTitle != "" {
		t.Fatalf("AH-RES-NONE expected empty playlist after 'none' opt-out, got %q / %q", noneItem.PlaylistID, noneItem.PlaylistTitle)
	}
	if noneItem.EstimatedQuota != quotaVideoMetadataUpdate {
		t.Fatalf("AH-RES-NONE expected quota=50, got %d", noneItem.EstimatedQuota)
	}

	vodItem := byID["AH-RES-VOD"]
	if vodItem.Privacy != "private" {
		t.Fatalf("AH-RES-VOD expected default privacy 'private', got %q", vodItem.Privacy)
	}
	if vodItem.PlaylistID != "pl-hades-vod" || vodItem.PlaylistTitle != "Hades VODs" {
		t.Fatalf("AH-RES-VOD expected pl-hades-vod / Hades VODs, got %q / %q", vodItem.PlaylistID, vodItem.PlaylistTitle)
	}
}

func TestApplyMatchedExports_AppliesLiveResolvedMetadata(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	app.config.DefaultVideoDescription = "Channel default desc"
	app.config.TagPlaylistConfigs = map[string]TagPlaylistConfig{
		"celeste": {
			VodPlaylistID:  "pl-celeste-vod",
			ClipPlaylistID: "pl-celeste-clip",
		},
	}

	srcFallback := "/videos/celeste_fallback.mp4"
	srcOptOut := "/videos/celeste_optout.mp4"
	app.config.VideoMetadata = map[string]VideoMeta{
		srcFallback: {
			Privacy:     "public",
			ContentType: "clip",
		},
		srcOptOut: {
			Description: "Custom clip desc",
			PlaylistID:  "none",
		},
	}

	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-APPLY-1",
		SourcePath:  srcFallback,
		TargetTitle: "Celeste Clip",
		GameTag:     "celeste",
		Status:      "matched",
		YouTubeID:   "yt-a1",
	}); err != nil {
		t.Fatal(err)
	}
	if err := app.insertExportedVideo(ExportedVideoRecord{
		ExportID:    "AH-APPLY-2",
		SourcePath:  srcOptOut,
		TargetTitle: "Celeste OptOut",
		PlaylistID:  "none",
		GameTag:     "celeste",
		Status:      "matched",
		YouTubeID:   "yt-a2",
	}); err != nil {
		t.Fatal(err)
	}

	type metaCall struct {
		videoID, title, desc, privacy string
	}
	var metaCalls []metaCall
	var playlistCalls []string

	updateFn := func(videoID, title, description, privacy string) error {
		metaCalls = append(metaCalls, metaCall{videoID, title, description, privacy})
		return nil
	}
	playlistFn := func(playlistID, videoID string) error {
		playlistCalls = append(playlistCalls, playlistID+":"+videoID)
		return nil
	}

	res, err := app.applyMatchedExportsWithDeps([]string{"AH-APPLY-1", "AH-APPLY-2"}, true, false, updateFn, playlistFn)
	if err != nil {
		t.Fatalf("applyMatchedExportsWithDeps failed: %v", err)
	}
	if len(res.Applied) != 2 {
		t.Fatalf("expected 2 applied exports, got %v (failed=%v)", res.Applied, res.Failed)
	}

	if len(metaCalls) != 2 {
		t.Fatalf("expected 2 metadata calls, got %d", len(metaCalls))
	}
	if metaCalls[0].desc != "Channel default desc" || metaCalls[0].privacy != "public" {
		t.Fatalf("unexpected meta call 0: %+v", metaCalls[0])
	}
	if metaCalls[1].desc != "Custom clip desc" || metaCalls[1].privacy != "private" {
		t.Fatalf("unexpected meta call 1: %+v", metaCalls[1])
	}

	if len(playlistCalls) != 1 || playlistCalls[0] != "pl-celeste-clip:yt-a1" {
		t.Fatalf("expected only [pl-celeste-clip:yt-a1] playlist call, got %v", playlistCalls)
	}
}
