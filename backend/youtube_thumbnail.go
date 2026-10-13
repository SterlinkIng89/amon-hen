package backend

import (
	"context"
	"errors"
	"fmt"
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
