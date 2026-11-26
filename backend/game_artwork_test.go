package backend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestArtworkApp(t *testing.T) *App {
	t.Helper()
	tmpDir := t.TempDir()
	return &App{
		cacheDir:   filepath.Join(tmpDir, "cache"),
		configPath: filepath.Join(tmpDir, "config.json"),
	}
}

func TestTagGameArtwork_SetAndPersist(t *testing.T) {
	app := newTestArtworkApp(t)

	poster := "https://example.com/poster.jpg"
	hero := "/cache/game_artwork/lol_hero_123.png"

	if err := app.SetTagGameArtwork("League of Legends", poster, hero); err != nil {
		t.Fatalf("SetTagGameArtwork failed: %v", err)
	}

	got, err := app.GetTagGameArtwork("League of Legends")
	if err != nil {
		t.Fatalf("GetTagGameArtwork failed: %v", err)
	}
	if got.PosterURL != poster || got.HeroURL != hero {
		t.Fatalf("expected (%q, %q), got (%q, %q)", poster, hero, got.PosterURL, got.HeroURL)
	}

	// Verify config.json persistence under tag_playlist_configs[tag].artwork
	raw, err := os.ReadFile(app.configPath)
	if err != nil {
		t.Fatalf("failed to read config.json: %v", err)
	}
	var diskCfg Config
	if err := json.Unmarshal(raw, &diskCfg); err != nil {
		t.Fatalf("failed to unmarshal config.json: %v", err)
	}
	entry, ok := diskCfg.TagPlaylistConfigs["League of Legends"]
	if !ok || entry.Artwork == nil {
		t.Fatalf("expected persisted artwork in config.json, got: %+v", diskCfg.TagPlaylistConfigs)
	}
	if entry.Artwork.PosterURL != poster || entry.Artwork.HeroURL != hero {
		t.Fatalf("persisted artwork mismatch: %+v", entry.Artwork)
	}
}

func TestTagGameArtwork_URLValidation(t *testing.T) {
	app := newTestArtworkApp(t)

	validCases := []struct {
		poster string
		hero   string
	}{
		{"http://cdn.example.com/p.jpg", "https://cdn.example.com/h.png"},
		{"/cache/game_artwork/a.webp", ""},
		{"", "/cache/game_artwork/b.jpg"},
		{"", ""},
	}
	for _, tc := range validCases {
		if err := app.SetTagGameArtwork("Valorant", tc.poster, tc.hero); err != nil {
			t.Fatalf("expected valid URLs (%q, %q) to succeed, got error: %v", tc.poster, tc.hero, err)
		}
	}

	invalidURLs := []string{
		"javascript:alert(1)",
		"file:///C:/secret.png",
		"data:image/png;base64,AAAA",
		"ftp://example.com/img.png",
		"relative/path.png",
	}
	for _, bad := range invalidURLs {
		if err := app.SetTagGameArtwork("Valorant", bad, ""); err == nil {
			t.Fatalf("expected invalid poster URL %q to be rejected", bad)
		}
		if err := app.SetTagGameArtwork("Valorant", "", bad); err == nil {
			t.Fatalf("expected invalid hero URL %q to be rejected", bad)
		}
	}

	if err := app.SetTagGameArtwork("   ", "https://example.com/p.jpg", ""); err == nil {
		t.Fatalf("expected empty tag to be rejected")
	}
}

func TestTagGameArtwork_ClearArtwork(t *testing.T) {
	app := newTestArtworkApp(t)

	if err := app.SetTagGameArtwork("Valorant", "https://example.com/p.jpg", "https://example.com/h.jpg"); err != nil {
		t.Fatalf("initial SetTagGameArtwork failed: %v", err)
	}
	if err := app.SetTagGameArtwork("Valorant", "  ", ""); err != nil {
		t.Fatalf("clearing SetTagGameArtwork failed: %v", err)
	}

	app.configMu.RLock()
	entry := app.config.TagPlaylistConfigs["Valorant"]
	app.configMu.RUnlock()
	if entry.Artwork != nil {
		t.Fatalf("expected Artwork to be nil after clearing, got: %+v", entry.Artwork)
	}

	got, err := app.GetTagGameArtwork("Valorant")
	if err != nil {
		t.Fatalf("GetTagGameArtwork failed: %v", err)
	}
	if got.PosterURL != "" || got.HeroURL != "" {
		t.Fatalf("expected empty GameArtworkConfig, got: %+v", got)
	}
}

func TestTagGameArtwork_CaseInsensitiveLookup(t *testing.T) {
	app := newTestArtworkApp(t)

	if err := app.SetTagGameArtwork("League of Legends", "https://example.com/p.jpg", ""); err != nil {
		t.Fatalf("SetTagGameArtwork failed: %v", err)
	}

	got, err := app.GetTagGameArtwork("  league OF legends  ")
	if err != nil {
		t.Fatalf("GetTagGameArtwork failed: %v", err)
	}
	if got.PosterURL != "https://example.com/p.jpg" {
		t.Fatalf("expected case-insensitive lookup to return poster URL, got: %+v", got)
	}

	// Updating with different casing should preserve the canonical key
	if err := app.SetTagGameArtwork("LEAGUE OF LEGENDS", "https://example.com/p2.jpg", "https://example.com/h2.jpg"); err != nil {
		t.Fatalf("SetTagGameArtwork update failed: %v", err)
	}
	app.configMu.RLock()
	count := len(app.config.TagPlaylistConfigs)
	entry := app.config.TagPlaylistConfigs["League of Legends"]
	app.configMu.RUnlock()
	if count != 1 || entry.Artwork == nil || entry.Artwork.HeroURL != "https://example.com/h2.jpg" {
		t.Fatalf("expected canonical key reuse, got count=%d entry=%+v", count, entry)
	}

	missing, err := app.GetTagGameArtwork("Unknown Game")
	if err != nil {
		t.Fatalf("GetTagGameArtwork for missing tag failed: %v", err)
	}
	if missing != (GameArtworkConfig{}) {
		t.Fatalf("expected empty GameArtworkConfig for unconfigured tag, got: %+v", missing)
	}
}

func TestTagGameArtwork_SaveGameArtworkFile(t *testing.T) {
	app := newTestArtworkApp(t)

	srcDir := t.TempDir()
	posterSrc := filepath.Join(srcDir, "poster_src.png")
	heroSrc := filepath.Join(srcDir, "hero_src.webp")
	posterData := []byte("fake-png-bytes")
	heroData := []byte("fake-webp-bytes")
	if err := os.WriteFile(posterSrc, posterData, 0644); err != nil {
		t.Fatalf("failed to write poster source file: %v", err)
	}
	if err := os.WriteFile(heroSrc, heroData, 0644); err != nil {
		t.Fatalf("failed to write hero source file: %v", err)
	}

	posterURL, err := app.saveGameArtworkFile("League of Legends", "poster", posterSrc)
	if err != nil {
		t.Fatalf("saveGameArtworkFile poster failed: %v", err)
	}
	if !strings.HasPrefix(posterURL, "/cache/game_artwork/") || !strings.HasSuffix(posterURL, ".png") {
		t.Fatalf("unexpected poster cache URL: %s", posterURL)
	}

	cachedPosterPath := filepath.Join(app.cacheDir, filepath.FromSlash(strings.TrimPrefix(posterURL, "/cache/")))
	gotPosterBytes, err := os.ReadFile(cachedPosterPath)
	if err != nil {
		t.Fatalf("failed to read cached poster file: %v", err)
	}
	if string(gotPosterBytes) != string(posterData) {
		t.Fatalf("cached poster content mismatch")
	}

	heroURL, err := app.saveGameArtworkFile("league of legends", "hero", heroSrc)
	if err != nil {
		t.Fatalf("saveGameArtworkFile hero failed: %v", err)
	}
	if !strings.HasPrefix(heroURL, "/cache/game_artwork/") || !strings.HasSuffix(heroURL, ".webp") {
		t.Fatalf("unexpected hero cache URL: %s", heroURL)
	}

	// Both slots should now be present without overwriting each other
	got, err := app.GetTagGameArtwork("League of Legends")
	if err != nil {
		t.Fatalf("GetTagGameArtwork failed: %v", err)
	}
	if got.PosterURL != posterURL || got.HeroURL != heroURL {
		t.Fatalf("expected (%q, %q), got (%q, %q)", posterURL, heroURL, got.PosterURL, got.HeroURL)
	}

	if _, err := app.saveGameArtworkFile("League of Legends", "banner", posterSrc); err == nil {
		t.Fatalf("expected invalid slot to be rejected")
	}
}
