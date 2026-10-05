package backend

import (
	"database/sql"
	"time"
)

// UploadSession represents a persisted resumable YouTube upload session.
type UploadSession struct {
	VideoPath     string `json:"videoPath"`
	UploadURL     string `json:"uploadUrl"`
	TotalBytes    int64  `json:"totalBytes"`
	BytesUploaded int64  `json:"bytesUploaded"`
	FileMtime     int64  `json:"fileMtime"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Privacy       string `json:"privacy"`
	PlaylistID    string `json:"playlistId"`
	GameTag       string `json:"gameTag"`
	Episode       int    `json:"episode"`
	Status        string `json:"status"` // "uploading" | "interrupted"
	UpdatedAt     int64  `json:"updatedAt"`
}

// SaveUploadSession inserts or updates an upload session in the database.
func (db *DB) SaveUploadSession(s UploadSession) error {
	if db == nil || db.conn == nil {
		return nil
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	now := s.UpdatedAt
	if now == 0 {
		now = time.Now().Unix()
	}
	status := s.Status
	if status == "" {
		status = "uploading"
	}

	_, err := db.conn.Exec(`
		INSERT INTO upload_sessions (
			video_path, upload_url, total_bytes, bytes_uploaded, file_mtime,
			title, description, privacy, playlist_id, game_tag, episode,
			status, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(video_path) DO UPDATE SET
			upload_url = excluded.upload_url,
			total_bytes = excluded.total_bytes,
			bytes_uploaded = excluded.bytes_uploaded,
			file_mtime = excluded.file_mtime,
			title = excluded.title,
			description = excluded.description,
			privacy = excluded.privacy,
			playlist_id = excluded.playlist_id,
			game_tag = excluded.game_tag,
			episode = excluded.episode,
			status = excluded.status,
			updated_at = excluded.updated_at
	`, s.VideoPath, s.UploadURL, s.TotalBytes, s.BytesUploaded, s.FileMtime,
		s.Title, s.Description, s.Privacy, s.PlaylistID, s.GameTag, s.Episode,
		status, now)

	return err
}

// UpdateUploadProgress updates bytes_uploaded and updated_at for an active session.
func (db *DB) UpdateUploadProgress(path string, bytes int64) error {
	if db == nil || db.conn == nil {
		return nil
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.conn.Exec(`
		UPDATE upload_sessions
		SET bytes_uploaded = ?, updated_at = ?
		WHERE video_path = ?
	`, bytes, time.Now().Unix(), path)
	return err
}

// SetUploadSessionStatus updates the status for a given session.
func (db *DB) SetUploadSessionStatus(path, status string) error {
	if db == nil || db.conn == nil {
		return nil
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.conn.Exec(`
		UPDATE upload_sessions
		SET status = ?, updated_at = ?
		WHERE video_path = ?
	`, status, time.Now().Unix(), path)
	return err
}

// GetUploadSession retrieves a session by video path, returning nil if not found.
func (db *DB) GetUploadSession(path string) (*UploadSession, error) {
	if db == nil || db.conn == nil {
		return nil, nil
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	row := db.conn.QueryRow(`
		SELECT video_path, upload_url, total_bytes, bytes_uploaded, file_mtime,
		       title, description, privacy, playlist_id, game_tag, episode,
		       status, updated_at
		FROM upload_sessions
		WHERE video_path = ?
	`, path)

	var s UploadSession
	var desc, priv, plID, gt sql.NullString
	err := row.Scan(
		&s.VideoPath, &s.UploadURL, &s.TotalBytes, &s.BytesUploaded, &s.FileMtime,
		&s.Title, &desc, &priv, &plID, &gt, &s.Episode,
		&s.Status, &s.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if desc.Valid {
		s.Description = desc.String
	}
	if priv.Valid {
		s.Privacy = priv.String
	}
	if plID.Valid {
		s.PlaylistID = plID.String
	}
	if gt.Valid {
		s.GameTag = gt.String
	}

	return &s, nil
}

// ListUploadSessions retrieves all active/persisted upload sessions.
func (db *DB) ListUploadSessions() ([]UploadSession, error) {
	if db == nil || db.conn == nil {
		return nil, nil
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	rows, err := db.conn.Query(`
		SELECT video_path, upload_url, total_bytes, bytes_uploaded, file_mtime,
		       title, description, privacy, playlist_id, game_tag, episode,
		       status, updated_at
		FROM upload_sessions
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []UploadSession
	for rows.Next() {
		var s UploadSession
		var desc, priv, plID, gt sql.NullString
		if err := rows.Scan(
			&s.VideoPath, &s.UploadURL, &s.TotalBytes, &s.BytesUploaded, &s.FileMtime,
			&s.Title, &desc, &priv, &plID, &gt, &s.Episode,
			&s.Status, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if desc.Valid {
			s.Description = desc.String
		}
		if priv.Valid {
			s.Privacy = priv.String
		}
		if plID.Valid {
			s.PlaylistID = plID.String
		}
		if gt.Valid {
			s.GameTag = gt.String
		}
		sessions = append(sessions, s)
	}

	return sessions, rows.Err()
}

// DeleteUploadSession removes an upload session by video path.
func (db *DB) DeleteUploadSession(path string) error {
	if db == nil || db.conn == nil {
		return nil
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.conn.Exec(`DELETE FROM upload_sessions WHERE video_path = ?`, path)
	return err
}

// MarkStaleUploadsInterrupted changes any 'uploading' sessions to 'interrupted'
// (called upon application startup).
func (db *DB) MarkStaleUploadsInterrupted() error {
	if db == nil || db.conn == nil {
		return nil
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.conn.Exec(`
		UPDATE upload_sessions
		SET status = 'interrupted', updated_at = ?
		WHERE status = 'uploading'
	`, time.Now().Unix())
	return err
}
