package backend

import (
	"testing"
)

func TestSanitizeClipTitle(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"Lethal Company - Clip", "Lethal Company - Clip"},
		{"Game / Clip : 1 <best>", "Game _ Clip _ 1 _best_"},
		{"   Padded Title   ", "Padded Title"},
		{`Invalid\Chars*?"<>|`, "Invalid_Chars______"},
	}

	for _, c := range cases {
		got := sanitizeClipTitle(c.input)
		if got != c.expected {
			t.Errorf("sanitizeClipTitle(%q) = %q, expected %q", c.input, got, c.expected)
		}
	}
}

func TestApplyClipMetadata_OmitGameTag(t *testing.T) {
	app := &App{
		config: Config{
			VideoMetadata: map[string]VideoMeta{
				"/videos/parent.mp4": {
					Game:         "Lethal Company",
					YouTubeTitle: "Parent VOD",
					Description:  "Fun stream",
					Privacy:      "unlisted",
					PlaylistID:   "PL123",
					Episode:      2,
					GameMode:     "Co-op",
					CustomVars: map[string]string{
						"map": "Experimentation",
					},
				},
			},
			VideoGames: map[string]string{
				"/videos/parent.mp4": "Lethal Company",
				// Simulate stale entry for clipPath if it previously existed
				"/videos/clip.mp4": "Lethal Company",
			},
		},
	}

	app.applyClipMetadata("/videos/parent.mp4", "/videos/clip.mp4", "Lethal Company - clip - Clip")

	clipMeta, exists := app.config.VideoMetadata["/videos/clip.mp4"]
	if !exists {
		t.Fatalf("expected clip metadata to exist in VideoMetadata")
	}

	// Must NOT inherit game tag in VideoMetadata.Game
	if clipMeta.Game != "" {
		t.Errorf("expected clip Game to be empty string, got %q", clipMeta.Game)
	}

	// Must NOT inherit or preserve entry in config.VideoGames
	if gameTag, hasGame := app.config.VideoGames["/videos/clip.mp4"]; hasGame {
		t.Errorf("expected clip to be omitted from VideoGames, got %q", gameTag)
	}

	// Other metadata must be preserved
	if clipMeta.YouTubeTitle != "Lethal Company - clip - Clip" {
		t.Errorf("expected YouTubeTitle %q, got %q", "Lethal Company - clip - Clip", clipMeta.YouTubeTitle)
	}
	if clipMeta.Event != "Lethal Company - clip - Clip" {
		t.Errorf("expected Event %q, got %q", "Lethal Company - clip - Clip", clipMeta.Event)
	}
	if clipMeta.Description != "Fun stream" {
		t.Errorf("expected Description %q, got %q", "Fun stream", clipMeta.Description)
	}
	if clipMeta.Privacy != "unlisted" {
		t.Errorf("expected Privacy %q, got %q", "unlisted", clipMeta.Privacy)
	}
	if clipMeta.PlaylistID != "PL123" {
		t.Errorf("expected PlaylistID %q, got %q", "PL123", clipMeta.PlaylistID)
	}
	if clipMeta.Episode != 2 {
		t.Errorf("expected Episode 2, got %d", clipMeta.Episode)
	}
	if clipMeta.GameMode != "Co-op" {
		t.Errorf("expected GameMode %q, got %q", "Co-op", clipMeta.GameMode)
	}
	if clipMeta.CustomVars["map"] != "Experimentation" {
		t.Errorf("expected CustomVars['map'] to be %q, got %q", "Experimentation", clipMeta.CustomVars["map"])
	}
}

func TestApplyClipMetadata_WithoutParentMeta(t *testing.T) {
	app := &App{
		config: Config{
			VideoMetadata: map[string]VideoMeta{},
			VideoGames:    map[string]string{},
		},
	}

	app.applyClipMetadata("/videos/untracked.mp4", "/videos/clip.mp4", "Untracked - Clip")

	clipMeta, exists := app.config.VideoMetadata["/videos/clip.mp4"]
	if !exists {
		t.Fatalf("expected clip metadata to exist in VideoMetadata")
	}

	if clipMeta.Game != "" {
		t.Errorf("expected clip Game to be empty string, got %q", clipMeta.Game)
	}
	if clipMeta.YouTubeTitle != "Untracked - Clip" {
		t.Errorf("expected YouTubeTitle %q, got %q", "Untracked - Clip", clipMeta.YouTubeTitle)
	}
	if _, hasGame := app.config.VideoGames["/videos/clip.mp4"]; hasGame {
		t.Errorf("expected clip to be omitted from VideoGames")
	}
}
