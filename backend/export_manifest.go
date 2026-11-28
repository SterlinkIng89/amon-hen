package backend

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"
)

const exportIDAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const exportIDLength = 8

var exportIDRegex = regexp.MustCompile(`(?i)\bAH(?:[-\x{2013}_]|\s+)?([A-Z0-9]{8})\b`)

// ExportedVideoRecord represents a persisted exported video entry in the manifest.
type ExportedVideoRecord struct {
	ExportID      string `json:"exportId"`
	SourcePath    string `json:"sourcePath"`
	ExportedPath  string `json:"exportedPath"`
	TargetTitle   string `json:"targetTitle"`
	Description   string `json:"description"`
	Privacy       string `json:"privacy"`
	GameTag       string `json:"gameTag"`
	PlaylistID    string `json:"playlistId"`
	PlaylistTitle string `json:"playlistTitle"`
	Episode       int    `json:"episode"`
	ContentType   string `json:"contentType"`
	Tags          string `json:"tags"`
	Status        string `json:"status"`
	YouTubeID     string `json:"youtubeId"`
	ErrorMsg      string `json:"errorMsg"`
	ExportedAt    int64  `json:"exportedAt"`
	AppliedAt     int64  `json:"appliedAt"`
}

// GenerateExportID generates a unique, filesystem-safe tracking ID in the form AH-XXXXXXXX.
func GenerateExportID() (string, error) {
	max := big.NewInt(int64(len(exportIDAlphabet)))
	buf := make([]byte, exportIDLength)
	for i := 0; i < exportIDLength; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("failed to generate export ID: %w", err)
		}
		buf[i] = exportIDAlphabet[n.Int64()]
	}
	return "AH-" + string(buf), nil
}

// ExtractExportID extracts an AH-XXXXXXXX tracking ID from a filename or title,
// tolerating hyphen, en-dash, underscore, whitespace, or omitted separators case-insensitively,
// and normalizing the returned ID to uppercase AH-XXXXXXXX.
func ExtractExportID(text string) (string, bool) {
	matches := exportIDRegex.FindStringSubmatch(text)
	if len(matches) < 2 {
		return "", false
	}
	return "AH-" + strings.ToUpper(matches[1]), true
}

func (a *App) insertExportedVideo(rec ExportedVideoRecord) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}

	if rec.ExportID == "" {
		id, err := GenerateExportID()
		if err != nil {
			return err
		}
		rec.ExportID = id
	}
	if rec.Privacy == "" {
		rec.Privacy = "private"
	}
	if rec.Status == "" {
		rec.Status = "exported"
	}
	if rec.ExportedAt == 0 {
		rec.ExportedAt = time.Now().Unix()
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	tx, err := a.db.conn.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin export manifest transaction: %w", err)
	}
	defer tx.Rollback()

	if rec.Status == "exported" && rec.SourcePath != "" {
		if _, err := tx.Exec(`
			UPDATE exported_videos
			SET status = 'superseded'
			WHERE source_path = ? AND status = 'exported' AND export_id != ?
		`, rec.SourcePath, rec.ExportID); err != nil {
			return fmt.Errorf("failed to supersede prior export record: %w", err)
		}
	}

	if _, err := tx.Exec(`
		INSERT INTO exported_videos (
			export_id, source_path, exported_path, target_title, description,
			privacy, game_tag, playlist_id, playlist_title, episode,
			content_type, tags, status, youtube_id, error_msg,
			exported_at, applied_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(export_id) DO UPDATE SET
			source_path = excluded.source_path,
			exported_path = excluded.exported_path,
			target_title = excluded.target_title,
			description = excluded.description,
			privacy = excluded.privacy,
			game_tag = excluded.game_tag,
			playlist_id = excluded.playlist_id,
			playlist_title = excluded.playlist_title,
			episode = excluded.episode,
			content_type = excluded.content_type,
			tags = excluded.tags,
			status = excluded.status,
			youtube_id = excluded.youtube_id,
			error_msg = excluded.error_msg,
			exported_at = excluded.exported_at,
			applied_at = excluded.applied_at
	`, rec.ExportID, rec.SourcePath, rec.ExportedPath, rec.TargetTitle, rec.Description,
		rec.Privacy, rec.GameTag, rec.PlaylistID, rec.PlaylistTitle, rec.Episode,
		rec.ContentType, rec.Tags, rec.Status, rec.YouTubeID, rec.ErrorMsg,
		rec.ExportedAt, rec.AppliedAt); err != nil {
		return fmt.Errorf("failed to insert exported video record: %w", err)
	}

	return tx.Commit()
}

// GetExportedVideos returns persisted exported video records ordered by exported_at DESC.
// An empty statusFilter returns all records.
func (a *App) GetExportedVideos(statusFilter string) ([]ExportedVideoRecord, error) {
	records := make([]ExportedVideoRecord, 0)
	if a.db == nil || a.db.conn == nil {
		return records, fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	query := `
		SELECT export_id, source_path, exported_path, target_title, description,
		       privacy, game_tag, playlist_id, playlist_title, episode,
		       content_type, tags, status, youtube_id, error_msg,
		       exported_at, applied_at
		FROM exported_videos
	`
	var args []interface{}
	filter := strings.TrimSpace(statusFilter)
	if filter != "" {
		query += " WHERE status = ?"
		args = append(args, filter)
	}
	query += " ORDER BY exported_at DESC"

	rows, err := a.db.conn.Query(query, args...)
	if err != nil {
		return records, fmt.Errorf("failed to query exported videos: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var rec ExportedVideoRecord
		if err := rows.Scan(
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
		); err != nil {
			return records, fmt.Errorf("failed to scan exported video record: %w", err)
		}
		records = append(records, rec)
	}

	if err := rows.Err(); err != nil {
		return records, fmt.Errorf("error iterating exported video records: %w", err)
	}

	return records, nil
}

// DeleteExportRecord permanently removes an exported video record by export_id.
func (a *App) DeleteExportRecord(exportID string) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	if _, err := a.db.conn.Exec("DELETE FROM exported_videos WHERE export_id = ?", exportID); err != nil {
		return fmt.Errorf("failed to delete export record: %w", err)
	}
	return nil
}

// DismissExportRecord marks an exported video record as dismissed so it is no longer pending.
func (a *App) DismissExportRecord(exportID string) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	if _, err := a.db.conn.Exec("UPDATE exported_videos SET status = 'dismissed' WHERE export_id = ?", exportID); err != nil {
		return fmt.Errorf("failed to dismiss export record: %w", err)
	}
	return nil
}
