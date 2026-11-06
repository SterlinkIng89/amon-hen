package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLegacyConfigPrivacyMigration(t *testing.T) {
	app := &App{
		config: Config{
			VideoMetadata: map[string]VideoMeta{
				"/videos/unuploaded_legacy.mp4": {
					Game:            "League of Legends",
					Privacy:         "unlisted",
					PrivacyOverride: false,
					YouTubeID:       "",
				},
				"/videos/uploaded_video.mp4": {
					Game:            "League of Legends",
					Privacy:         "unlisted",
					PrivacyOverride: false,
					YouTubeID:       "yt-12345",
				},
				"/videos/explicit_override.mp4": {
					Game:            "League of Legends",
					Privacy:         "private",
					PrivacyOverride: true,
					YouTubeID:       "",
				},
			},
		},
	}

	app.migrateLegacyPrivacy()

	// 1. Unuploaded legacy file with implicit unlisted must have privacy cleared
	legacyMeta := app.config.VideoMetadata["/videos/unuploaded_legacy.mp4"]
	if legacyMeta.Privacy != "" {
		t.Errorf("expected legacy unuploaded privacy to be cleared to empty string, got %q", legacyMeta.Privacy)
	}
	if legacyMeta.PrivacyOverride {
		t.Errorf("expected PrivacyOverride to be false for migrated legacy video")
	}

	// 2. Uploaded video must retain its YouTube privacy status
	uploadedMeta := app.config.VideoMetadata["/videos/uploaded_video.mp4"]
	if uploadedMeta.Privacy != "unlisted" {
		t.Errorf("expected uploaded video privacy %q, got %q", "unlisted", uploadedMeta.Privacy)
	}

	// 3. Unuploaded video with explicit user override must retain its privacy
	overrideMeta := app.config.VideoMetadata["/videos/explicit_override.mp4"]
	if overrideMeta.Privacy != "private" {
		t.Errorf("expected explicit override privacy %q, got %q", "private", overrideMeta.Privacy)
	}
	if !overrideMeta.PrivacyOverride {
		t.Errorf("expected PrivacyOverride to remain true for explicit override")
	}
}

func TestSaveVideoMetadata_UnuploadedExplicitOverride(t *testing.T) {
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "config.json")

	testPath := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testPath, []byte("fake video content"), 0644); err != nil {
		t.Fatalf("failed to create fake video: %v", err)
	}

	app := &App{
		configPath: cfgPath,
		thumbSem:   make(chan struct{}, 2),
		config: Config{
			VideoMetadata: map[string]VideoMeta{
				testPath: {
					DurationSecs: 60,
				},
			},
		},
	}

	// Case 1: Save with explicit privacy on unuploaded video
	err := app.SaveVideoMetadata(testPath, "Hades", "Hades - Ep 1", "Desc", "private", "", 1, "", "", nil)
	if err != nil {
		t.Fatalf("SaveVideoMetadata failed: %v", err)
	}

	meta := app.config.VideoMetadata[testPath]
	if meta.Privacy != "private" {
		t.Errorf("expected Privacy %q, got %q", "private", meta.Privacy)
	}
	if !meta.PrivacyOverride {
		t.Errorf("expected PrivacyOverride to be true when explicit privacy provided")
	}

	// Case 2: Save with empty privacy on unuploaded video -> resets override
	err = app.SaveVideoMetadata(testPath, "Hades", "Hades - Ep 1", "Desc", "", "", 1, "", "", nil)
	if err != nil {
		t.Fatalf("SaveVideoMetadata failed: %v", err)
	}

	meta = app.config.VideoMetadata[testPath]
	if meta.Privacy != "" {
		t.Errorf("expected Privacy to be empty string, got %q", meta.Privacy)
	}
	if meta.PrivacyOverride {
		t.Errorf("expected PrivacyOverride to be false when empty privacy provided")
	}
}
