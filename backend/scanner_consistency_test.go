package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanner_LinkedYouTubeConsistency(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir := t.TempDir()

	file1 := filepath.Join(tmpDir, "clip1.mp4")
	file2 := filepath.Join(tmpDir, "clip2.mp4")

	_ = os.WriteFile(file1, []byte("fake video 1"), 0644)
	_ = os.WriteFile(file2, []byte("fake video 2"), 0644)

	// In database, file1 is linked to YouTube video "yt-100" with game_tag "Control Resonant" and episode 5
	_, err := app.db.conn.Exec(`
		INSERT INTO yt_videos (id, title, game_tag, episode, local_file)
		VALUES ('yt-100', 'Control Resonant Ep 5', 'Control Resonant', 5, ?)
	`, file1)
	if err != nil {
		t.Fatalf("failed to insert video row: %v", err)
	}

	app.config.Folders = []string{tmpDir}
	app.config.VideoMetadata = make(map[string]VideoMeta)

	videos, err := app.GetVideosFromFolders([]string{tmpDir})
	if err != nil {
		t.Fatalf("GetVideosFromFolders failed: %v", err)
	}

	if len(videos) != 2 {
		t.Fatalf("expected 2 videos, got %d", len(videos))
	}

	var linkedVideo VideoFile
	for _, v := range videos {
		if v.Path == file1 {
			linkedVideo = v
		}
	}

	// Linked video should have inherited the DB game tag and episode
	if linkedVideo.Game != "Control Resonant" {
		t.Errorf("expected linked video Game to be 'Control Resonant', got %q", linkedVideo.Game)
	}
	if linkedVideo.Episode != 5 {
		t.Errorf("expected linked video Episode to be 5, got %d", linkedVideo.Episode)
	}

	// Free video (if assigned same game tag via local metadata or continuing)
	// When free video has game "Control Resonant", it should continue at episode 6
	app.config.VideoMetadata[file2] = VideoMeta{Game: "Control Resonant"}
	videos2, err := app.GetVideosFromFolders([]string{tmpDir})
	if err != nil {
		t.Fatalf("GetVideosFromFolders second run failed: %v", err)
	}
	for _, v := range videos2 {
		if v.Path == file2 {
			if v.Episode != 6 {
				t.Errorf("expected free video following anchor episode 5 to receive episode 6, got %d", v.Episode)
			}
		}
	}
}
