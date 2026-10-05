package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRemoveYouTubeVideoLocal(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Temporary directory for mock video files
	tmpDir := t.TempDir()
	mockVideoPath := filepath.Join(tmpDir, "video1.mp4")
	if err := os.WriteFile(mockVideoPath, []byte("fake video content"), 0644); err != nil {
		t.Fatalf("failed to create mock video file: %v", err)
	}

	// Insert playlist, video, and playlist item
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, privacy)
		VALUES ('pl-1', 'Test Playlist', 'Desc', 1, '', '2026-01-01T00:00:00Z', 'public');
		INSERT INTO yt_videos (id, title, description, published_at, thumbnail_url, view_count, like_count, duration, privacy, local_file)
		VALUES ('vid-1', 'Test Video', 'Desc', '2026-01-01T00:00:00Z', '', 10, 2, '10:00', 'public', ?);
		INSERT INTO yt_playlist_items (playlist_id, video_id, position)
		VALUES ('pl-1', 'vid-1', 0);
	`, mockVideoPath)
	if err != nil {
		t.Fatalf("failed to seed database: %v", err)
	}

	// Test A: remove with deleteLocalFile = false
	err = app.removeYouTubeVideoLocal("vid-1", false)
	if err != nil {
		t.Fatalf("expected removeYouTubeVideoLocal to succeed, got: %v", err)
	}

	// Verify database rows deleted
	var count int
	app.db.conn.QueryRow("SELECT COUNT(*) FROM yt_videos WHERE id = 'vid-1'").Scan(&count)
	if count != 0 {
		t.Errorf("expected yt_videos row to be deleted, found %d", count)
	}
	app.db.conn.QueryRow("SELECT COUNT(*) FROM yt_playlist_items WHERE video_id = 'vid-1'").Scan(&count)
	if count != 0 {
		t.Errorf("expected yt_playlist_items rows to be deleted, found %d", count)
	}

	// Verify local file still exists
	if _, err := os.Stat(mockVideoPath); os.IsNotExist(err) {
		t.Errorf("expected local file to remain when deleteLocalFile is false")
	}

	// Test B: with deleteLocalFile = true
	mockVideoPath2 := filepath.Join(tmpDir, "video2.mp4")
	if err := os.WriteFile(mockVideoPath2, []byte("fake video 2 content"), 0644); err != nil {
		t.Fatalf("failed to create mock video file: %v", err)
	}
	_, err = app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, description, published_at, thumbnail_url, view_count, like_count, duration, privacy, local_file)
		VALUES ('vid-2', 'Test Video 2', 'Desc', '2026-01-01T00:00:00Z', '', 10, 2, '10:00', 'public', ?);
		INSERT INTO yt_playlist_items (playlist_id, video_id, position)
		VALUES ('pl-1', 'vid-2', 1);
	`, mockVideoPath2)
	if err != nil {
		t.Fatalf("failed to seed video 2: %v", err)
	}

	err = app.removeYouTubeVideoLocal("vid-2", true)
	if err != nil {
		t.Fatalf("expected removeYouTubeVideoLocal(deleteLocalFile=true) to succeed, got: %v", err)
	}

	// Verify file was deleted from disk
	if _, err := os.Stat(mockVideoPath2); !os.IsNotExist(err) {
		t.Errorf("expected local file to be deleted from disk, but it still exists")
	}

	// Test C: unknown ID does not error
	err = app.removeYouTubeVideoLocal("non-existent-vid", true)
	if err != nil {
		t.Errorf("expected removeYouTubeVideoLocal for non-existent video to succeed without error, got: %v", err)
	}
}
