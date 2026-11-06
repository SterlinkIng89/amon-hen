package backend

import (
	"fmt"
	"testing"
	"time"
)

func TestGenerateYouTubeTitle_ModTimeFallback(t *testing.T) {
	app := &App{
		config: Config{
			TitleSeparator: " — ",
			GameProfiles: map[string]GameProfile{
				"League of Legends": {
					Type:          "multiplayer",
					TitleTemplate: "{game} — {date} — {event}",
				},
			},
		},
	}

	// 2026-04-08 in local timezone
	recDate := time.Date(2026, time.April, 8, 15, 30, 0, 0, time.Local)
	modTime := recDate.UnixMilli()

	video := VideoFile{
		Name:     "League of Legends ARAM Highlight.mp4",
		Game:     "League of Legends",
		Event:    "ARAM",
		ModTime:  modTime,
	}

	title := app.generateYouTubeTitle(video)
	expected := "League of Legends — 8/04/26 — ARAM"
	if title != expected {
		t.Fatalf("expected title %q, got %q", expected, title)
	}
}

func TestGenerateYouTubeTitle_ClipContentType_ModTimeFallback(t *testing.T) {
	app := &App{
		config: Config{
			TitleSeparator: " — ",
		},
	}

	recDate := time.Date(2026, time.April, 8, 10, 0, 0, 0, time.Local)
	modTime := recDate.UnixMilli()

	video := VideoFile{
		Name:        "outplayed_recording.mp4",
		Game:        "League of Legends",
		Event:       "Pentakill",
		ContentType: "clip",
		ModTime:     modTime,
	}

	title := app.generateYouTubeTitle(video)
	expected := "League of Legends — 8/04/26 — Pentakill"
	if title != expected {
		t.Fatalf("expected title %q, got %q", expected, title)
	}
}

func TestGenerateYouTubeTitle_FilenamePrefixTakesPrecedence(t *testing.T) {
	app := &App{
		config: Config{
			TitleSeparator: " — ",
			GameProfiles: map[string]GameProfile{
				"League of Legends": {
					Type:          "multiplayer",
					TitleTemplate: "{game} — {date} — {event}",
				},
			},
		},
	}

	// ModTime is April 8, 2026
	modTime := time.Date(2026, time.April, 8, 12, 0, 0, 0, time.Local).UnixMilli()

	// Filename has prefix 2026-05-12
	video := VideoFile{
		Name:     "2026-05-12_League_Highlight.mp4",
		Game:     "League of Legends",
		Event:    "Finals",
		ModTime:  modTime,
	}

	title := app.generateYouTubeTitle(video)
	expected := "League of Legends — 12/05/26 — Finals"
	if title != expected {
		t.Fatalf("expected title %q, got %q", expected, title)
	}
}

func TestGenerateYouTubeTitle_ZeroModTimeFallback(t *testing.T) {
	app := &App{
		config: Config{
			TitleSeparator: " — ",
			GameProfiles: map[string]GameProfile{
				"League of Legends": {
					Type:          "multiplayer",
					TitleTemplate: "{game} — {date} — {event}",
				},
			},
		},
	}

	video := VideoFile{
		Name:     "unknown_date_clip.mp4",
		Game:     "League of Legends",
		Event:    "Solo",
		ModTime:  0,
	}

	now := time.Now()
	expectedDate := fmt.Sprintf("%d/%02d/%s", now.Day(), now.Month(), now.Format("06"))
	expected := fmt.Sprintf("League of Legends — %s — Solo", expectedDate)

	title := app.generateYouTubeTitle(video)
	if title != expected {
		t.Fatalf("expected title %q, got %q", expected, title)
	}
}
