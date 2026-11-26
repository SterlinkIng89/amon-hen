package backend

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// validateGameArtworkURL ensures non-empty artwork URLs use http(s):// or /cache/.
func validateGameArtworkURL(rawURL string) error {
	if rawURL == "" {
		return nil
	}
	lower := strings.ToLower(rawURL)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(rawURL, "/cache/") {
		return nil
	}
	return fmt.Errorf("invalid artwork URL scheme: must start with http://, https://, or /cache/")
}

// findCanonicalTagKeyLocked returns the existing key in TagPlaylistConfigs matching cleanTag
// (exact first, then case-insensitive), or cleanTag if none exists. Caller must hold configMu.
func (a *App) findCanonicalTagKeyLocked(cleanTag string) string {
	if a.config.TagPlaylistConfigs == nil {
		return cleanTag
	}
	if _, ok := a.config.TagPlaylistConfigs[cleanTag]; ok {
		return cleanTag
	}
	for k := range a.config.TagPlaylistConfigs {
		if strings.EqualFold(strings.TrimSpace(k), cleanTag) {
			return k
		}
	}
	return cleanTag
}

// sanitizeArtworkTag converts a game tag into a safe filename prefix.
func sanitizeArtworkTag(tag string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(tag) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			b.WriteRune(unicode.ToLower(r))
		} else {
			b.WriteRune('_')
		}
	}
	s := strings.Trim(b.String(), "_")
	if s == "" {
		return "game"
	}
	return s
}

// validateArtworkSlot ensures the artwork slot is either "poster" or "hero".
func validateArtworkSlot(slot string) error {
	if slot != "poster" && slot != "hero" {
		return fmt.Errorf("invalid artwork slot %q: must be \"poster\" or \"hero\"", slot)
	}
	return nil
}

// updateTagArtwork mutates the Artwork entry for cleanTag under configMu and persists config.json.
func (a *App) updateTagArtwork(cleanTag string, mutate func(current *GameArtworkConfig) *GameArtworkConfig) error {
	a.configMu.Lock()
	if a.config.TagPlaylistConfigs == nil {
		a.config.TagPlaylistConfigs = make(map[string]TagPlaylistConfig)
	}
	canonicalKey := a.findCanonicalTagKeyLocked(cleanTag)
	existing := a.config.TagPlaylistConfigs[canonicalKey]
	existing.Artwork = mutate(existing.Artwork)
	a.config.TagPlaylistConfigs[canonicalKey] = existing
	a.configMu.Unlock()

	return a.saveConfig()
}

// SetTagGameArtwork sets or clears custom poster and hero artwork URLs for a game tag.
func (a *App) SetTagGameArtwork(tag string, posterURL string, heroURL string) error {
	cleanTag := strings.TrimSpace(tag)
	if cleanTag == "" {
		return fmt.Errorf("tag cannot be empty")
	}

	cleanPoster := strings.TrimSpace(posterURL)
	cleanHero := strings.TrimSpace(heroURL)

	if err := validateGameArtworkURL(cleanPoster); err != nil {
		return fmt.Errorf("poster URL: %w", err)
	}
	if err := validateGameArtworkURL(cleanHero); err != nil {
		return fmt.Errorf("hero URL: %w", err)
	}

	return a.updateTagArtwork(cleanTag, func(_ *GameArtworkConfig) *GameArtworkConfig {
		if cleanPoster == "" && cleanHero == "" {
			return nil
		}
		return &GameArtworkConfig{
			PosterURL: cleanPoster,
			HeroURL:   cleanHero,
		}
	})
}

// UploadTagGameArtworkFile opens a native file dialog for poster or hero artwork,
// copies the selected image into the local cache, and persists its /cache/ URL.
func (a *App) UploadTagGameArtworkFile(tag string, slot string) (string, error) {
	cleanTag := strings.TrimSpace(tag)
	if cleanTag == "" {
		return "", fmt.Errorf("tag cannot be empty")
	}
	if err := validateArtworkSlot(slot); err != nil {
		return "", err
	}
	if a.ctx == nil {
		return "", nil
	}

	title := "Select Game Poster Image"
	if slot == "hero" {
		title = "Select Game Hero Banner Image"
	}

	srcPath, err := wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: title,
		Filters: []wruntime.FileFilter{
			{
				DisplayName: "Image Files (*.jpg, *.jpeg, *.png, *.webp)",
				Pattern:     "*.jpg;*.jpeg;*.png;*.webp",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(srcPath) == "" {
		return "", nil
	}

	return a.saveGameArtworkFile(cleanTag, slot, srcPath)
}

// saveGameArtworkFile copies srcPath into <cacheDir>/game_artwork/ and updates the
// corresponding slot in TagPlaylistConfigs[tag].Artwork.
func (a *App) saveGameArtworkFile(tag string, slot string, srcPath string) (string, error) {
	cleanTag := strings.TrimSpace(tag)
	if cleanTag == "" {
		return "", fmt.Errorf("tag cannot be empty")
	}
	if err := validateArtworkSlot(slot); err != nil {
		return "", err
	}
	if a.cacheDir == "" {
		return "", fmt.Errorf("cache directory is not configured")
	}

	artworkDir := filepath.Join(a.cacheDir, "game_artwork")
	if err := os.MkdirAll(artworkDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create game artwork directory: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(srcPath))
	filename := fmt.Sprintf("%s_%s_%d%s", sanitizeArtworkTag(cleanTag), slot, time.Now().UnixNano(), ext)
	destPath := filepath.Join(artworkDir, filename)

	src, err := os.Open(srcPath)
	if err != nil {
		return "", fmt.Errorf("failed to open source artwork file: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		return "", fmt.Errorf("failed to create cached artwork file: %w", err)
	}

	if _, copyErr := io.Copy(dst, src); copyErr != nil {
		dst.Close()
		_ = os.Remove(destPath)
		return "", fmt.Errorf("failed to copy artwork file: %w", copyErr)
	}
	if closeErr := dst.Close(); closeErr != nil {
		_ = os.Remove(destPath)
		return "", fmt.Errorf("failed to finalize artwork file: %w", closeErr)
	}

	cacheURL := "/cache/game_artwork/" + filename
	err = a.updateTagArtwork(cleanTag, func(current *GameArtworkConfig) *GameArtworkConfig {
		var artwork GameArtworkConfig
		if current != nil {
			artwork = *current
		}
		if slot == "poster" {
			artwork.PosterURL = cacheURL
		} else {
			artwork.HeroURL = cacheURL
		}
		return &artwork
	})
	if err != nil {
		return "", err
	}

	return cacheURL, nil
}

// GetTagGameArtwork returns the custom artwork configuration for a game tag.
func (a *App) GetTagGameArtwork(tag string) (GameArtworkConfig, error) {
	cleanTag := strings.TrimSpace(tag)
	if cleanTag == "" {
		return GameArtworkConfig{}, nil
	}

	a.configMu.RLock()
	defer a.configMu.RUnlock()

	canonicalKey := a.findCanonicalTagKeyLocked(cleanTag)
	if cfg, ok := a.config.TagPlaylistConfigs[canonicalKey]; ok && cfg.Artwork != nil {
		return *cfg.Artwork, nil
	}
	return GameArtworkConfig{}, nil
}
