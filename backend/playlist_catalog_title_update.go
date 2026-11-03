package backend

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type CatalogTitleChange struct {
	VideoID    string `json:"videoId"`
	OldTitle   string `json:"oldTitle"`
	NewTitle   string `json:"newTitle"`
	OldEpisode int    `json:"oldEpisode"`
	NewEpisode int    `json:"newEpisode"`
}

type CatalogTitleUpdateResult struct {
	Updated []string          `json:"updated"`
	Failed  map[string]string `json:"failed"`
	Skipped []string          `json:"skipped"`
}

// PreviewCatalogTitleUpdates calculates preview title changes for videos whose assigned episode
// differs from their parsed title episode, without performing any remote API calls.
func (a *App) PreviewCatalogTitleUpdates(assignments []CatalogAssignment) ([]CatalogTitleChange, error) {
	if a.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	sep := a.titleSep()
	var changes []CatalogTitleChange

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	for _, asgn := range assignments {
		if asgn.VideoID == "" || asgn.Episode <= 0 {
			continue
		}

		var currentTitle sql.NullString
		err := a.db.conn.QueryRow("SELECT title FROM yt_videos WHERE id = ?", asgn.VideoID).Scan(&currentTitle)
		if err != nil || !currentTitle.Valid || strings.TrimSpace(currentTitle.String) == "" {
			continue
		}

		titleStr := currentTitle.String
		parsedEp, ok := parseEpisodeFromTitle(titleStr, sep)
		if ok && parsedEp == asgn.Episode {
			continue
		}

		newTitle, rewritten := rewriteTitleEpisode(titleStr, sep, asgn.Episode)
		if !rewritten || newTitle == titleStr {
			continue
		}

		changes = append(changes, CatalogTitleChange{
			VideoID:    asgn.VideoID,
			OldTitle:   titleStr,
			NewTitle:   newTitle,
			OldEpisode: parsedEp,
			NewEpisode: asgn.Episode,
		})
	}

	return changes, nil
}

// ApplyCatalogTitleUpdates applies YouTube title rewrites sequentially to YouTube and updates SQLite and local video config.
func (a *App) ApplyCatalogTitleUpdates(assignments []CatalogAssignment) (CatalogTitleUpdateResult, error) {
	result := CatalogTitleUpdateResult{
		Updated: make([]string, 0),
		Failed:  make(map[string]string),
		Skipped: make([]string, 0),
	}

	if a.db == nil {
		return result, fmt.Errorf("database not initialized")
	}

	changes, err := a.PreviewCatalogTitleUpdates(assignments)
	if err != nil {
		return result, err
	}

	if len(changes) == 0 {
		return result, nil
	}

	total := len(changes)
	emitProgress := func(current int, videoID, title string, percentage int) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "catalog:title-update-progress", map[string]interface{}{
				"current":    current,
				"total":      total,
				"videoId":    videoID,
				"title":      title,
				"percentage": percentage,
			})
		}
	}

	for i, ch := range changes {
		emitProgress(i+1, ch.VideoID, ch.NewTitle, int(float64(i)/float64(total)*100))

		if err := a.UpdateYouTubeVideoMetadata(ch.VideoID, ch.NewTitle, "", ""); err != nil {
			result.Failed[ch.VideoID] = err.Error()
			emitProgress(i+1, ch.VideoID, ch.NewTitle, int(float64(i+1)/float64(total)*100))

			if strings.Contains(strings.ToLower(err.Error()), "quota") {
				appLog("[ApplyCatalogTitleUpdates] Stopping title updates due to quota error: %v", err)
				break
			}
			continue
		}

		result.Updated = append(result.Updated, ch.VideoID)
		emitProgress(i+1, ch.VideoID, ch.NewTitle, int(float64(i+1)/float64(total)*100))

		a.db.mu.Lock()
		var localFile sql.NullString
		_ = a.db.conn.QueryRow("SELECT local_file FROM yt_videos WHERE id = ?", ch.VideoID).Scan(&localFile)
		a.db.mu.Unlock()

		if localFile.Valid && strings.TrimSpace(localFile.String) != "" {
			lf := strings.TrimSpace(localFile.String)
			a.configMu.Lock()
			if a.config.VideoMetadata != nil {
				if meta, exists := a.config.VideoMetadata[lf]; exists {
					meta.YouTubeTitle = ch.NewTitle
					meta.Episode = ch.NewEpisode
					a.config.VideoMetadata[lf] = meta
				}
			}
			a.configMu.Unlock()
		}
	}

	a.saveConfig()
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "catalog:title-update-done", result)
	}
	appLog("[Catalog] Applied %d title updates on YouTube (%d failed)", len(result.Updated), len(result.Failed))
	return result, nil
}

// ApplySingleVideoTitleUpdate updates a single video's title on YouTube and syncs SQLite and local config.
func (a *App) ApplySingleVideoTitleUpdate(videoID string, newTitle string) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}
	cleanVideoID := strings.TrimSpace(videoID)
	cleanNewTitle := strings.TrimSpace(newTitle)
	if cleanVideoID == "" {
		return fmt.Errorf("video ID is required")
	}
	if cleanNewTitle == "" {
		return fmt.Errorf("title cannot be empty")
	}

	if err := a.UpdateYouTubeVideoMetadata(cleanVideoID, cleanNewTitle, "", ""); err != nil {
		return err
	}

	a.db.mu.Lock()
	var localFile sql.NullString
	_ = a.db.conn.QueryRow("SELECT local_file FROM yt_videos WHERE id = ?", cleanVideoID).Scan(&localFile)
	a.db.mu.Unlock()

	if localFile.Valid && strings.TrimSpace(localFile.String) != "" {
		lf := strings.TrimSpace(localFile.String)
		a.configMu.Lock()
		if a.config.VideoMetadata != nil {
			if meta, exists := a.config.VideoMetadata[lf]; exists {
				meta.YouTubeTitle = cleanNewTitle
				a.config.VideoMetadata[lf] = meta
			}
		}
		a.configMu.Unlock()
		_ = a.saveConfig()
	}

	appLog("[ApplySingleVideoTitleUpdate] Updated title for %s to %q", cleanVideoID, cleanNewTitle)
	return nil
}
