package backend

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// TitleNormalizationDraft represents a persisted title normalization draft for a YouTube video.
type TitleNormalizationDraft struct {
	VideoID       string            `json:"videoId"`
	PlaylistID    string            `json:"playlistId"`
	GameTag       string            `json:"gameTag"`
	ProfileType   string            `json:"profileType"`
	Event         string            `json:"event"`
	GameMode      string            `json:"gameMode"`
	DateOverride  string            `json:"dateOverride"`
	Episode       int               `json:"episode"`
	CustomVars    map[string]string `json:"customVars"`
	ProposedTitle string            `json:"proposedTitle"`
	Status        string            `json:"status"` // "draft" | "ready" | "synced"
	UpdatedAt     int64             `json:"updatedAt"`
}

type sqlExecer interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
}

type rowScanner interface {
	Scan(dest ...interface{}) error
}

const upsertTitleNormalizationDraftQuery = `
	INSERT INTO title_normalization_drafts (
		video_id, playlist_id, game_tag, profile_type, event,
		game_mode, date_override, episode, custom_vars_json,
		proposed_title, status, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(video_id) DO UPDATE SET
		playlist_id = excluded.playlist_id,
		game_tag = excluded.game_tag,
		profile_type = excluded.profile_type,
		event = excluded.event,
		game_mode = excluded.game_mode,
		date_override = excluded.date_override,
		episode = excluded.episode,
		custom_vars_json = excluded.custom_vars_json,
		proposed_title = excluded.proposed_title,
		status = excluded.status,
		updated_at = excluded.updated_at
`

const selectTitleNormalizationDraftColumns = `
	SELECT video_id, playlist_id, game_tag, profile_type, event,
	       game_mode, date_override, episode, custom_vars_json,
	       proposed_title, status, updated_at
	FROM title_normalization_drafts
`

func marshalCustomVars(vars map[string]string) (string, error) {
	if vars == nil {
		return "{}", nil
	}
	raw, err := json.Marshal(vars)
	if err != nil {
		return "", fmt.Errorf("failed to marshal customVars: %w", err)
	}
	return string(raw), nil
}

func unmarshalCustomVars(raw string) (map[string]string, error) {
	result := make(map[string]string)
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "{}" || trimmed == "null" {
		return result, nil
	}
	if err := json.Unmarshal([]byte(trimmed), &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal customVars: %w", err)
	}
	if result == nil {
		result = make(map[string]string)
	}
	return result, nil
}

func upsertTitleNormalizationDraft(exec sqlExecer, draft TitleNormalizationDraft, now int64) error {
	videoID := strings.TrimSpace(draft.VideoID)
	if videoID == "" {
		return fmt.Errorf("videoId is required")
	}

	customVarsJSON, err := marshalCustomVars(draft.CustomVars)
	if err != nil {
		return err
	}

	status := strings.TrimSpace(draft.Status)
	if status == "" {
		status = "draft"
	}

	if _, err := exec.Exec(
		upsertTitleNormalizationDraftQuery,
		videoID,
		draft.PlaylistID,
		draft.GameTag,
		draft.ProfileType,
		draft.Event,
		draft.GameMode,
		draft.DateOverride,
		draft.Episode,
		customVarsJSON,
		draft.ProposedTitle,
		status,
		now,
	); err != nil {
		return fmt.Errorf("failed to upsert title normalization draft %q: %w", videoID, err)
	}
	return nil
}

func scanTitleNormalizationDraft(scanner rowScanner) (TitleNormalizationDraft, error) {
	var draft TitleNormalizationDraft
	var customVarsJSON string
	if err := scanner.Scan(
		&draft.VideoID,
		&draft.PlaylistID,
		&draft.GameTag,
		&draft.ProfileType,
		&draft.Event,
		&draft.GameMode,
		&draft.DateOverride,
		&draft.Episode,
		&customVarsJSON,
		&draft.ProposedTitle,
		&draft.Status,
		&draft.UpdatedAt,
	); err != nil {
		return TitleNormalizationDraft{}, err
	}

	customVars, err := unmarshalCustomVars(customVarsJSON)
	if err != nil {
		return TitleNormalizationDraft{}, err
	}
	draft.CustomVars = customVars
	return draft, nil
}

// GetTitleNormalizationDrafts returns all drafts for playlistID (or all drafts when playlistID is empty),
// ordered by updated_at DESC. Always returns a non-nil slice when no drafts exist.
func (a *App) GetTitleNormalizationDrafts(playlistID string) ([]TitleNormalizationDraft, error) {
	drafts := make([]TitleNormalizationDraft, 0)
	if a.db == nil || a.db.conn == nil {
		return drafts, fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	query := selectTitleNormalizationDraftColumns
	var args []interface{}
	if strings.TrimSpace(playlistID) != "" {
		query += " WHERE playlist_id = ?"
		args = append(args, playlistID)
	}
	query += " ORDER BY updated_at DESC"

	rows, err := a.db.conn.Query(query, args...)
	if err != nil {
		return drafts, fmt.Errorf("failed to query title normalization drafts: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		draft, err := scanTitleNormalizationDraft(rows)
		if err != nil {
			return drafts, fmt.Errorf("failed to scan title normalization draft: %w", err)
		}
		drafts = append(drafts, draft)
	}

	if err := rows.Err(); err != nil {
		return drafts, fmt.Errorf("error iterating title normalization drafts: %w", err)
	}

	return drafts, nil
}

// GetTitleNormalizationDraft returns the persisted draft for videoID, or nil, nil if not found.
func (a *App) GetTitleNormalizationDraft(videoID string) (*TitleNormalizationDraft, error) {
	if a.db == nil || a.db.conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if strings.TrimSpace(videoID) == "" {
		return nil, nil
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	row := a.db.conn.QueryRow(selectTitleNormalizationDraftColumns+" WHERE video_id = ?", videoID)
	draft, err := scanTitleNormalizationDraft(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query title normalization draft %q: %w", videoID, err)
	}
	return &draft, nil
}

// SaveTitleNormalizationDraft validates and upserts a single title normalization draft.
func (a *App) SaveTitleNormalizationDraft(draft TitleNormalizationDraft) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	return upsertTitleNormalizationDraft(a.db.conn, draft, time.Now().Unix())
}

// SaveTitleNormalizationDraftsBatch upserts multiple title normalization drafts inside a single transaction.
func (a *App) SaveTitleNormalizationDraftsBatch(drafts []TitleNormalizationDraft) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}
	if len(drafts) == 0 {
		return nil
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	tx, err := a.db.conn.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin title normalization draft batch transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().Unix()
	for _, draft := range drafts {
		if err := upsertTitleNormalizationDraft(tx, draft, now); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit title normalization draft batch: %w", err)
	}
	return nil
}

// MarkTitleNormalizationDraftSynced marks an existing draft as synced with the final applied title.
func (a *App) MarkTitleNormalizationDraftSynced(videoID string, syncedTitle string) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}
	trimmedID := strings.TrimSpace(videoID)
	if trimmedID == "" {
		return fmt.Errorf("videoId is required")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	if _, err := a.db.conn.Exec(`
		UPDATE title_normalization_drafts
		SET status = 'synced',
		    proposed_title = ?,
		    updated_at = ?
		WHERE video_id = ?
	`, syncedTitle, time.Now().Unix(), trimmedID); err != nil {
		return fmt.Errorf("failed to mark title normalization draft %q synced: %w", trimmedID, err)
	}
	return nil
}

// DeleteTitleNormalizationDraft removes a title normalization draft by video_id.
func (a *App) DeleteTitleNormalizationDraft(videoID string) error {
	if a.db == nil || a.db.conn == nil {
		return fmt.Errorf("database not initialized")
	}
	trimmedID := strings.TrimSpace(videoID)
	if trimmedID == "" {
		return fmt.Errorf("videoId is required")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	if _, err := a.db.conn.Exec("DELETE FROM title_normalization_drafts WHERE video_id = ?", trimmedID); err != nil {
		return fmt.Errorf("failed to delete title normalization draft %q: %w", trimmedID, err)
	}
	return nil
}
