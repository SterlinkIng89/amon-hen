package backend

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	quotaVideoMetadataUpdate = 50
	quotaPlaylistItemInsert  = 50
)

// MatchedExportItem combines an exported video manifest record with its matched YouTube state.
type MatchedExportItem struct {
	ExportedVideoRecord
	YouTubeTitle      string `json:"youtubeTitle"`
	YouTubePrivacy    string `json:"youtubePrivacy"`
	ThumbnailURL      string `json:"thumbnailUrl"`
	AlreadyInPlaylist bool   `json:"alreadyInPlaylist"`
	EstimatedQuota    int    `json:"estimatedQuota"`
}

// ApplyMatchedExportsResult summarizes the outcome of a batch metadata apply operation.
type ApplyMatchedExportsResult struct {
	Applied        []string          `json:"applied"`
	Failed         map[string]string `json:"failed"`
	Skipped        []string          `json:"skipped"`
	CleanedUpPaths []string          `json:"cleanedUpPaths"`
	StoppedOnQuota bool              `json:"stoppedOnQuota"`
}

type updateYouTubeMetadataFunc func(videoID, title, description, privacy string) error
type addVideoToPlaylistFunc func(playlistID, videoID string) error

// MatchExportedVideos scans synced YouTube videos for AH-XXXXXXXX tracking IDs,
// marks matching manifest rows as 'matched', and links them to their local files.
func (a *App) MatchExportedVideos() (int, error) {
	if a.db == nil || a.db.conn == nil {
		return 0, fmt.Errorf("database not initialized")
	}

	type pendingExport struct {
		exportID     string
		sourcePath   string
		exportedPath string
		gameTag      string
		episode      int
	}

	type ytVideoMatch struct {
		id    string
		title string
	}

	var pending []pendingExport
	ytByExportID := make(map[string]ytVideoMatch)

	a.db.mu.Lock()
	expRows, err := a.db.conn.Query(`
		SELECT export_id, source_path, exported_path, game_tag, episode
		FROM exported_videos
		WHERE status IN ('exported', 'matched', 'failed')
	`)
	if err != nil {
		a.db.mu.Unlock()
		return 0, fmt.Errorf("failed to query exported videos for matching: %w", err)
	}
	for expRows.Next() {
		var p pendingExport
		if err := expRows.Scan(&p.exportID, &p.sourcePath, &p.exportedPath, &p.gameTag, &p.episode); err != nil {
			expRows.Close()
			a.db.mu.Unlock()
			return 0, fmt.Errorf("failed to scan exported video row: %w", err)
		}
		pending = append(pending, p)
	}
	if err := expRows.Err(); err != nil {
		expRows.Close()
		a.db.mu.Unlock()
		return 0, fmt.Errorf("error iterating exported video rows: %w", err)
	}
	expRows.Close()

	if len(pending) == 0 {
		a.db.mu.Unlock()
		return 0, nil
	}

	ytRows, err := a.db.conn.Query(`SELECT id, title FROM yt_videos`)
	if err != nil {
		a.db.mu.Unlock()
		return 0, fmt.Errorf("failed to query yt_videos for matching: %w", err)
	}
	for ytRows.Next() {
		var vidID string
		var title sql.NullString
		if err := ytRows.Scan(&vidID, &title); err != nil {
			ytRows.Close()
			a.db.mu.Unlock()
			return 0, fmt.Errorf("failed to scan yt_videos row: %w", err)
		}
		if !title.Valid {
			continue
		}
		if exportID, ok := ExtractExportID(title.String); ok {
			if _, exists := ytByExportID[exportID]; !exists {
				ytByExportID[exportID] = ytVideoMatch{id: vidID, title: title.String}
			}
		}
	}
	if err := ytRows.Err(); err != nil {
		ytRows.Close()
		a.db.mu.Unlock()
		return 0, fmt.Errorf("error iterating yt_videos rows: %w", err)
	}
	ytRows.Close()
	a.db.mu.Unlock()

	matchedCount := 0
	for _, p := range pending {
		yt, ok := ytByExportID[p.exportID]
		if !ok {
			continue
		}

		a.db.mu.Lock()
		_, err := a.db.conn.Exec(`
			UPDATE exported_videos
			SET youtube_id = ?, status = 'matched', error_msg = ''
			WHERE export_id = ?
		`, yt.id, p.exportID)
		a.db.mu.Unlock()
		if err != nil {
			return matchedCount, fmt.Errorf("failed to update matched export %s: %w", p.exportID, err)
		}

		localPath := a.resolveExistingLocalPath(p.sourcePath, p.exportedPath)
		if localPath != "" {
			if err := a.LinkLocalToYouTube(localPath, yt.id, p.gameTag, p.episode); err != nil {
				appLog("[MatchExportedVideos] Failed to link local file %q to YouTube %s: %v", localPath, yt.id, err)
			}
		}

		matchedCount++
	}

	appLog("[MatchExportedVideos] Evaluated %d pending export(s), matched %d against local yt_videos", len(pending), matchedCount)

	if matchedCount > 0 && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "export-sync:matched", matchedCount)
	}

	return matchedCount, nil
}

func (a *App) hasPendingExports() bool {
	if a.db == nil || a.db.conn == nil {
		return false
	}
	a.db.mu.Lock()
	defer a.db.mu.Unlock()
	var exists int
	err := a.db.conn.QueryRow(`SELECT 1 FROM exported_videos WHERE status = 'exported' LIMIT 1`).Scan(&exists)
	return err == nil && exists == 1
}

// GetMatchedExports returns all matched or failed exported video records enriched with YouTube metadata and quota estimates.
func (a *App) GetMatchedExports() ([]MatchedExportItem, error) {
	items := make([]MatchedExportItem, 0)
	if a.db == nil || a.db.conn == nil {
		return items, fmt.Errorf("database not initialized")
	}

	if a.hasPendingExports() {
		if _, err := a.MatchExportedVideos(); err != nil {
			appLog("[GetMatchedExports] Auto-match failed: %v", err)
		}
	}

	liveTitles := a.snapshotLiveYouTubeTitles()

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`
		SELECT e.export_id, e.source_path, e.exported_path, e.target_title, e.description,
		       e.privacy, e.game_tag, e.playlist_id, e.playlist_title, e.episode,
		       e.content_type, e.tags, e.status, e.youtube_id, e.error_msg,
		       e.exported_at, e.applied_at,
		       v.title, v.privacy, v.thumbnail_url,
		       CASE
		           WHEN e.playlist_id != '' AND e.youtube_id != '' AND EXISTS (
		               SELECT 1 FROM yt_playlist_items pi
		               WHERE pi.playlist_id = e.playlist_id AND pi.video_id = e.youtube_id
		           ) THEN 1
		           ELSE 0
		       END AS already_in_playlist
		FROM exported_videos e
		LEFT JOIN yt_videos v ON v.id = e.youtube_id
		WHERE e.status IN ('matched', 'failed')
		ORDER BY e.exported_at DESC
	`)
	if err != nil {
		return items, fmt.Errorf("failed to query matched exports: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var item MatchedExportItem
		var ytTitle, ytPrivacy, thumbURL sql.NullString
		var alreadyInPlaylist int
		if err := rows.Scan(
			&item.ExportID,
			&item.SourcePath,
			&item.ExportedPath,
			&item.TargetTitle,
			&item.Description,
			&item.Privacy,
			&item.GameTag,
			&item.PlaylistID,
			&item.PlaylistTitle,
			&item.Episode,
			&item.ContentType,
			&item.Tags,
			&item.Status,
			&item.YouTubeID,
			&item.ErrorMsg,
			&item.ExportedAt,
			&item.AppliedAt,
			&ytTitle,
			&ytPrivacy,
			&thumbURL,
			&alreadyInPlaylist,
		); err != nil {
			return items, fmt.Errorf("failed to scan matched export item: %w", err)
		}

		if liveTitle, ok := liveTitles[item.SourcePath]; ok {
			item.TargetTitle = liveTitle
		}
		item.YouTubeTitle = ytTitle.String
		item.YouTubePrivacy = ytPrivacy.String
		item.ThumbnailURL = thumbURL.String
		item.AlreadyInPlaylist = alreadyInPlaylist == 1
		item.EstimatedQuota = quotaVideoMetadataUpdate
		if item.PlaylistID != "" && !item.AlreadyInPlaylist {
			item.EstimatedQuota += quotaPlaylistItemInsert
		}

		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return items, fmt.Errorf("error iterating matched exports: %w", err)
	}

	return items, nil
}

func (a *App) snapshotLiveYouTubeTitles() map[string]string {
	a.configMu.RLock()
	defer a.configMu.RUnlock()

	titles := make(map[string]string, len(a.config.VideoMetadata))
	for path, meta := range a.config.VideoMetadata {
		if title := strings.TrimSpace(meta.YouTubeTitle); title != "" {
			titles[path] = title
		}
	}
	return titles
}

// UpdateExportTargetTitle updates the target_title for an editable exported video record.
func (a *App) UpdateExportTargetTitle(exportID string, targetTitle string) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}

	cleanID := strings.TrimSpace(exportID)
	if cleanID == "" {
		return fmt.Errorf("export ID cannot be empty")
	}

	cleanTitle := strings.TrimSpace(targetTitle)
	if cleanTitle == "" {
		return fmt.Errorf("target title cannot be empty")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	res, err := a.db.conn.Exec(`
		UPDATE exported_videos
		SET target_title = ?
		WHERE export_id = ? AND status IN ('exported', 'matched', 'failed')
	`, cleanTitle, cleanID)
	if err != nil {
		return fmt.Errorf("failed to update target title for export %s: %w", cleanID, err)
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check updated rows for export %s: %w", cleanID, err)
	}
	if affected == 0 {
		return fmt.Errorf("no editable export found for ID %s", cleanID)
	}

	return nil
}

// ApplyMatchedExports applies YouTube metadata updates, optional playlist additions,
// and optional temporary exported file cleanup for the given export IDs.
func (a *App) ApplyMatchedExports(exportIDs []string, includePlaylists bool, deleteExportedFiles bool) (ApplyMatchedExportsResult, error) {
	return a.applyMatchedExportsWithDeps(exportIDs, includePlaylists, deleteExportedFiles, a.UpdateYouTubeVideoMetadata, a.AddVideoToPlaylist)
}

func (a *App) applyMatchedExportsWithDeps(
	exportIDs []string,
	includePlaylists bool,
	deleteExportedFiles bool,
	updateMetadataFn updateYouTubeMetadataFunc,
	addToPlaylistFn addVideoToPlaylistFunc,
) (ApplyMatchedExportsResult, error) {
	result := ApplyMatchedExportsResult{
		Applied:        make([]string, 0),
		Failed:         make(map[string]string),
		Skipped:        make([]string, 0),
		CleanedUpPaths: make([]string, 0),
	}

	if a.db == nil || a.db.conn == nil {
		return result, fmt.Errorf("database not initialized")
	}

	if len(exportIDs) == 0 {
		return result, nil
	}

	var targets []ExportedVideoRecord
	seenIDs := make(map[string]bool, len(exportIDs))

	a.db.mu.Lock()
	for _, rawID := range exportIDs {
		id := strings.TrimSpace(rawID)
		if id == "" || seenIDs[id] {
			continue
		}
		seenIDs[id] = true

		var rec ExportedVideoRecord
		err := a.db.conn.QueryRow(`
			SELECT export_id, source_path, exported_path, target_title, description,
			       privacy, game_tag, playlist_id, playlist_title, episode,
			       content_type, tags, status, youtube_id, error_msg,
			       exported_at, applied_at
			FROM exported_videos
			WHERE export_id = ?
		`, id).Scan(
			&rec.ExportID,
			&rec.SourcePath,
			&rec.ExportedPath,
			&rec.TargetTitle,
			&rec.Description,
			&rec.Privacy,
			&rec.GameTag,
			&rec.PlaylistID,
			&rec.PlaylistTitle,
			&rec.Episode,
			&rec.ContentType,
			&rec.Tags,
			&rec.Status,
			&rec.YouTubeID,
			&rec.ErrorMsg,
			&rec.ExportedAt,
			&rec.AppliedAt,
		)
		if err != nil || (rec.Status != "matched" && rec.Status != "failed") || strings.TrimSpace(rec.YouTubeID) == "" {
			result.Skipped = append(result.Skipped, id)
			continue
		}
		targets = append(targets, rec)
	}
	a.db.mu.Unlock()

	total := len(targets)
	if total == 0 {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "export-sync:done", result)
		}
		return result, nil
	}

	emitProgress := func(current int, exportID, videoID, title string, percentage int) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "export-sync:progress", map[string]interface{}{
				"current":    current,
				"total":      total,
				"exportId":   exportID,
				"videoId":    videoID,
				"title":      title,
				"percentage": percentage,
			})
		}
	}

	handleApplyError := func(i int, rec ExportedVideoRecord, stage string, err error) bool {
		result.Failed[rec.ExportID] = err.Error()
		emitProgress(i+1, rec.ExportID, rec.YouTubeID, rec.TargetTitle, int(float64(i+1)/float64(total)*100))
		if isQuotaExceededError(err) {
			result.StoppedOnQuota = true
			appLog("[ApplyMatchedExports] Stopping batch apply during %s due to quota error: %v", stage, err)
			return true
		}
		a.markExportApplyFailed(rec.ExportID, err.Error())
		return false
	}

	for i, rec := range targets {
		emitProgress(i+1, rec.ExportID, rec.YouTubeID, rec.TargetTitle, int(float64(i)/float64(total)*100))

		if err := updateMetadataFn(rec.YouTubeID, rec.TargetTitle, rec.Description, rec.Privacy); err != nil {
			if handleApplyError(i, rec, "metadata update", err) {
				break
			}
			continue
		}

		if includePlaylists && rec.PlaylistID != "" && !a.isVideoInPlaylist(rec.PlaylistID, rec.YouTubeID) {
			if err := addToPlaylistFn(rec.PlaylistID, rec.YouTubeID); err != nil {
				if handleApplyError(i, rec, "playlist insert", err) {
					break
				}
				continue
			}
		}

		if err := a.markExportApplied(rec.ExportID); err != nil {
			result.Failed[rec.ExportID] = err.Error()
			emitProgress(i+1, rec.ExportID, rec.YouTubeID, rec.TargetTitle, int(float64(i+1)/float64(total)*100))
			continue
		}

		result.Applied = append(result.Applied, rec.ExportID)

		if deleteExportedFiles {
			cleaned := a.cleanupTemporaryExportFiles(rec.ExportedPath, rec.SourcePath)
			result.CleanedUpPaths = append(result.CleanedUpPaths, cleaned...)
		}

		emitProgress(i+1, rec.ExportID, rec.YouTubeID, rec.TargetTitle, int(float64(i+1)/float64(total)*100))
	}

	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "export-sync:done", result)
	}
	appLog("[ExportSync] Applied %d matched exports (%d failed, %d skipped, stoppedOnQuota=%v)",
		len(result.Applied), len(result.Failed), len(result.Skipped), result.StoppedOnQuota)

	return result, nil
}

func (a *App) isVideoInPlaylist(playlistID, videoID string) bool {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	var exists int
	err := a.db.conn.QueryRow(
		"SELECT 1 FROM yt_playlist_items WHERE playlist_id = ? AND video_id = ? LIMIT 1",
		playlistID, videoID,
	).Scan(&exists)
	return err == nil && exists == 1
}

func (a *App) markExportApplied(exportID string) error {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, err := a.db.conn.Exec(`
		UPDATE exported_videos
		SET status = 'applied', applied_at = ?, error_msg = ''
		WHERE export_id = ?
	`, time.Now().Unix(), exportID)
	return err
}

func (a *App) markExportApplyFailed(exportID, errMsg string) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, _ = a.db.conn.Exec(`
		UPDATE exported_videos
		SET status = 'failed', error_msg = ?
		WHERE export_id = ?
	`, errMsg, exportID)
}

func isQuotaExceededError(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "quota")
}

func (a *App) resolveExistingLocalPath(sourcePath, exportedPath string) string {
	if sourcePath != "" {
		if info, err := os.Stat(sourcePath); err == nil && !info.IsDir() {
			return sourcePath
		}
		if backupPath, ok := a.ResolveBackupPath(sourcePath); ok {
			return backupPath
		}
	}
	if exportedPath != "" {
		if info, err := os.Stat(exportedPath); err == nil && !info.IsDir() {
			return exportedPath
		}
	}
	return ""
}

func (a *App) isActiveYouTubeLocalFile(exportedPath string) bool {
	if a.db == nil || a.db.conn == nil || strings.TrimSpace(exportedPath) == "" {
		return false
	}

	absExported := normalizePath(exportedPath)
	cleanExported := filepath.Clean(exportedPath)

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`SELECT local_file FROM yt_videos WHERE local_file IS NOT NULL AND local_file != ''`)
	if err != nil {
		return true
	}
	defer rows.Close()

	for rows.Next() {
		var localFile string
		if err := rows.Scan(&localFile); err != nil {
			continue
		}
		if strings.EqualFold(normalizePath(localFile), absExported) || strings.EqualFold(filepath.Clean(localFile), cleanExported) {
			return true
		}
	}
	return false
}

func (a *App) cleanupTemporaryExportFiles(exportedPath, sourcePath string) []string {
	cleaned := make([]string, 0)
	if strings.TrimSpace(exportedPath) == "" {
		return cleaned
	}

	cleanExported := filepath.Clean(exportedPath)
	cleanSource := ""
	if strings.TrimSpace(sourcePath) != "" {
		cleanSource = filepath.Clean(sourcePath)
	}

	// Never delete the original source file.
	if cleanSource != "" && strings.EqualFold(cleanExported, cleanSource) {
		return cleaned
	}

	// Never delete any file inside the configured backup folder.
	if backupFolder := strings.TrimSpace(a.GetBackupFolder()); backupFolder != "" {
		if isPathWithinRoot(normalizePath(backupFolder), normalizePath(cleanExported), true) {
			return cleaned
		}
	}

	// Never delete a file that is currently linked as the active local_file in yt_videos.
	if a.isActiveYouTubeLocalFile(cleanExported) {
		return cleaned
	}

	if err := os.Remove(cleanExported); err == nil {
		cleaned = append(cleaned, cleanExported)
	}

	sidecarPath := strings.TrimSuffix(cleanExported, filepath.Ext(cleanExported)) + ".txt"
	if sidecarPath != cleanExported && (cleanSource == "" || !strings.EqualFold(sidecarPath, cleanSource)) {
		if err := os.Remove(sidecarPath); err == nil {
			cleaned = append(cleaned, sidecarPath)
		}
	}

	return cleaned
}
