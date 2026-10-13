package backend

import (
	"context"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/api/googleapi"
	"google.golang.org/api/youtube/v3"
)

const maxYouTubeThumbnailBytes = 2 * 1024 * 1024

// validateThumbnailFile checks if the given file exists, has a supported format (.jpg, .jpeg, .png),
// and does not exceed YouTube's 2MB file size limit.
func validateThumbnailFile(path string) error {
	fi, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("failed to access thumbnail file: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
		return fmt.Errorf("unsupported format %q: YouTube custom thumbnails must be JPG or PNG", ext)
	}

	if fi.Size() > maxYouTubeThumbnailBytes {
		return fmt.Errorf("thumbnail file size (%.2f MB) exceeds maximum allowed size of 2 MB", float64(fi.Size())/(1024*1024))
	}

	return nil
}

// pickThumbnailURL inspects a YouTube ThumbnailSetResponse and returns the highest quality URL available.
func pickThumbnailURL(resp *youtube.ThumbnailSetResponse) string {
	if resp == nil || len(resp.Items) == 0 || resp.Items[0] == nil {
		return ""
	}
	details := resp.Items[0]

	if details.Maxres != nil && details.Maxres.Url != "" {
		return details.Maxres.Url
	}
	if details.Standard != nil && details.Standard.Url != "" {
		return details.Standard.Url
	}
	if details.High != nil && details.High.Url != "" {
		return details.High.Url
	}
	if details.Medium != nil && details.Medium.Url != "" {
		return details.Medium.Url
	}
	if details.Default != nil && details.Default.Url != "" {
		return details.Default.Url
	}

	return ""
}

// friendlyThumbnailError translates YouTube API errors into human-readable action-oriented messages.
func friendlyThumbnailError(err error) error {
	if err == nil {
		return nil
	}

	var gErr *googleapi.Error
	if errors.As(err, &gErr) {
		if strings.Contains(strings.ToUpper(gErr.Message), "INVALID_ASPECT_RATIO") {
			return fmt.Errorf("invalid aspect ratio: YouTube playlist cover images must have a 1:1 (square) aspect ratio")
		}
		for _, item := range gErr.Errors {
			if strings.EqualFold(item.Reason, "INVALID_ASPECT_RATIO") {
				return fmt.Errorf("invalid aspect ratio: YouTube playlist cover images must have a 1:1 (square) aspect ratio")
			}
		}
		if gErr.Code == http.StatusUnauthorized {
			return fmt.Errorf("YouTube authentication expired. Please re-authenticate your account in Settings")
		}
		if gErr.Code == http.StatusNotFound {
			return fmt.Errorf("video not found on YouTube (it may have been deleted or private)")
		}
		if gErr.Code == http.StatusForbidden {
			for _, item := range gErr.Errors {
				if strings.EqualFold(item.Reason, "quotaExceeded") || strings.EqualFold(item.Reason, "rateLimitExceeded") {
					return fmt.Errorf("YouTube API quota exceeded (custom thumbnail updates cost 50 units). Try again when your daily quota resets")
				}
			}
			return fmt.Errorf("permission denied: verify that your YouTube channel is phone-verified to upload custom thumbnails")
		}
		return fmt.Errorf("YouTube API error (%d): %s", gErr.Code, gErr.Message)
	}

	if strings.Contains(strings.ToUpper(err.Error()), "INVALID_ASPECT_RATIO") {
		return fmt.Errorf("invalid aspect ratio: YouTube playlist cover images must have a 1:1 (square) aspect ratio")
	}

	return err
}

// persistThumbnailURL updates the cached thumbnail_url for the given video ID in the local SQLite database.
func (a *App) persistThumbnailURL(videoID string, url string) error {
	if a.db == nil || videoID == "" {
		return nil
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, err := a.db.conn.Exec("UPDATE yt_videos SET thumbnail_url = ? WHERE id = ?", url, videoID)
	return err
}

// setYouTubeThumbnailInternal validates the image, sends it to the YouTube API, and returns the resulting URL.
func (a *App) setYouTubeThumbnailInternal(videoID string, imagePath string) (string, error) {
	if videoID == "" {
		return "", fmt.Errorf("videoID cannot be empty")
	}
	if imagePath == "" {
		return "", fmt.Errorf("imagePath cannot be empty")
	}

	if err := validateThumbnailFile(imagePath); err != nil {
		return "", err
	}

	file, err := os.Open(imagePath)
	if err != nil {
		return "", fmt.Errorf("failed to open thumbnail image: %w", err)
	}
	defer file.Close()

	svc, err := a.youtubeClient(context.Background())
	if err != nil {
		return "", fmt.Errorf("failed to get YouTube service: %w", err)
	}

	call := svc.Thumbnails.Set(videoID).Media(file)
	resp, err := call.Do()
	if err != nil {
		appLog("[YouTube] Failed to set thumbnail for video %s: %v", videoID, err)
		return "", friendlyThumbnailError(err)
	}

	thumbURL := pickThumbnailURL(resp)
	appLog("[YouTube] Successfully set thumbnail for video %s (url: %s)", videoID, thumbURL)
	return thumbURL, nil
}

// UpdateYouTubeThumbnail sets a custom thumbnail for an existing YouTube video,
// updates the local database cache with a cache-busting timestamp, and returns the thumbnail URL.
func (a *App) UpdateYouTubeThumbnail(videoID string, imagePath string) (string, error) {
	thumbURL, err := a.setYouTubeThumbnailInternal(videoID, imagePath)
	if err != nil {
		return "", err
	}

	persistedURL := thumbURL
	if persistedURL != "" {
		persistedURL = fmt.Sprintf("%s?v=%d", persistedURL, time.Now().Unix())
		if pErr := a.persistThumbnailURL(videoID, persistedURL); pErr != nil {
			appLog("[YouTube] Warning: failed to persist thumbnail_url in local DB for %s: %v", videoID, pErr)
		}
	}

	return persistedURL, nil
}

// persistPlaylistThumbnailURL updates the cached thumbnail_url for the given playlist ID in the local SQLite database.
func (a *App) persistPlaylistThumbnailURL(playlistID string, url string) error {
	if a.db == nil || playlistID == "" {
		return nil
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, err := a.db.conn.Exec("UPDATE yt_playlists SET thumbnail_url = ? WHERE id = ?", url, playlistID)
	return err
}

// ensureSquareImage verifies if an image has a 1:1 aspect ratio. If not, it crops it to a centered square
// and writes it to a temporary JPEG file, returning the path to use and a cleanup callback.
func ensureSquareImage(imagePath string) (string, func(), error) {
	file, err := os.Open(imagePath)
	if err != nil {
		return "", func() {}, fmt.Errorf("failed to open thumbnail image: %w", err)
	}
	defer file.Close()

	cfg, _, err := image.DecodeConfig(file)
	if err != nil {
		return imagePath, func() {}, nil
	}

	if cfg.Width == cfg.Height {
		return imagePath, func() {}, nil
	}

	if _, err := file.Seek(0, 0); err != nil {
		return imagePath, func() {}, nil
	}

	img, _, err := image.Decode(file)
	if err != nil {
		return imagePath, func() {}, nil
	}

	bounds := img.Bounds()
	size := bounds.Dx()
	if bounds.Dy() < size {
		size = bounds.Dy()
	}

	x0 := bounds.Min.X + (bounds.Dx()-size)/2
	y0 := bounds.Min.Y + (bounds.Dy()-size)/2
	cropRect := image.Rect(x0, y0, x0+size, y0+size)

	squareImg := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.Draw(squareImg, squareImg.Bounds(), img, cropRect.Min, draw.Src)

	tmpFile, err := os.CreateTemp("", "playlist_square_*.jpg")
	if err != nil {
		return imagePath, func() {}, nil
	}
	tmpPath := tmpFile.Name()

	if err := jpeg.Encode(tmpFile, squareImg, &jpeg.Options{Quality: 92}); err != nil {
		tmpFile.Close()
		_ = os.Remove(tmpPath)
		return imagePath, func() {}, nil
	}
	tmpFile.Close()

	cleanup := func() {
		_ = os.Remove(tmpPath)
	}
	return tmpPath, cleanup, nil
}

// setYouTubePlaylistThumbnailInternal validates the image, sends it to the YouTube API, and returns an error if failed.
func (a *App) setYouTubePlaylistThumbnailInternal(playlistID string, imagePath string) error {
	if playlistID == "" {
		return fmt.Errorf("playlistID cannot be empty")
	}
	if imagePath == "" {
		return fmt.Errorf("imagePath cannot be empty")
	}

	if err := validateThumbnailFile(imagePath); err != nil {
		return err
	}

	file, err := os.Open(imagePath)
	if err != nil {
		return fmt.Errorf("failed to open thumbnail image: %w", err)
	}
	defer file.Close()

	svc, err := a.youtubeClient(context.Background())
	if err != nil {
		return fmt.Errorf("failed to get YouTube service: %w", err)
	}

	resource := &youtube.PlaylistImage{
		Snippet: &youtube.PlaylistImageSnippet{
			PlaylistId: playlistID,
			Type:       "hero",
		},
	}

	start := time.Now()
	call := svc.PlaylistImages.Insert(resource).Part("snippet").Media(file)
	_, err = call.Do()
	a.logAPICall("playlistImages.insert", playlistID, playlistID, 50, start, err)
	if err != nil {
		appLog("[YouTube] Failed to set thumbnail for playlist %s: %v", playlistID, err)
		return friendlyThumbnailError(err)
	}

	appLog("[YouTube] Successfully set thumbnail for playlist %s", playlistID)
	return nil
}

// SetYouTubePlaylistThumbnail uploads a custom cover image to a YouTube playlist via playlistImages.insert,
// caches the image locally in yt_thumbs, updates the local yt_playlists table, and returns the cached URL.
func (a *App) SetYouTubePlaylistThumbnail(playlistID string, imagePath string) (string, error) {
	if playlistID == "" {
		return "", fmt.Errorf("playlistID cannot be empty")
	}
	if imagePath == "" {
		return "", fmt.Errorf("imagePath cannot be empty")
	}

	uploadPath, cleanup, err := ensureSquareImage(imagePath)
	if err != nil {
		return "", err
	}
	defer cleanup()

	if err := a.setYouTubePlaylistThumbnailInternal(playlistID, uploadPath); err != nil {
		return "", err
	}

	// 2. Cache file locally in yt_thumbs directory for immediate local preview
	cacheDir := filepath.Join(a.cacheDir, "yt_thumbs")
	_ = os.MkdirAll(cacheDir, 0755)

	key := customThumbKey("playlist_" + playlistID)
	destPath := filepath.Join(cacheDir, key+".jpg")

	// If source is not already destination, copy bytes
	if filepath.Clean(uploadPath) != filepath.Clean(destPath) {
		if data, readErr := os.ReadFile(uploadPath); readErr == nil {
			_ = os.WriteFile(destPath, data, 0644)
		}
	}

	cachedURL := fmt.Sprintf("/cache/yt_thumbs/%s.jpg?v=%d", key, time.Now().Unix())
	if pErr := a.persistPlaylistThumbnailURL(playlistID, cachedURL); pErr != nil {
		appLog("[YouTube] Warning: failed to persist thumbnail_url in local DB for playlist %s: %v", playlistID, pErr)
	}

	return cachedURL, nil
}

