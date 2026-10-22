package backend

import (
	"fmt"
	"time"
	_ "time/tzdata"
)

// YouTube Data API v3 quota costs per operation
const (
	DailyQuotaLimit        = 10000
	QuotaChannelsList      = 1
	QuotaVideosList        = 1
	QuotaVideosInsert      = 1600
	QuotaVideosUpdate      = 50
	QuotaPlaylistsList     = 1
	QuotaPlaylistsInsert   = 50
	QuotaPlaylistItemsList = 1
	QuotaPlaylistItemsInsert = 50
	QuotaPlaylistItemsDelete = 50
	QuotaThumbnailsSet       = 50
	QuotaPlaylistImagesInsert = 50
)

// APILog represents a single YouTube API call record
type APILog struct {
	ID            int64  `json:"id"`
	Ts            int64  `json:"ts"`
	Operation     string `json:"operation"`
	ResourceID    string `json:"resourceId"`
	ResourceTitle string `json:"resourceTitle"`
	Success       bool   `json:"success"`
	ErrorMsg      string `json:"errorMsg"`
	QuotaCost     int    `json:"quotaCost"`
	DurationMs    int64  `json:"durationMs"`
}

// logAPICall inserts a record into api_logs.
// Call this immediately after every YouTube API .Do() call.
func (a *App) logAPICall(operation, resourceID, resourceTitle string, quotaCost int, startedAt time.Time, callErr error) {
	durationMs := time.Since(startedAt).Milliseconds()
	success := 1
	errMsg := ""
	if callErr != nil {
		success = 0
		errMsg = callErr.Error()
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, err := a.db.conn.Exec(
		`INSERT INTO api_logs (ts, operation, resource_id, resource_title, success, error_msg, quota_cost, duration_ms)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		time.Now().Unix(), operation, resourceID, resourceTitle, success, errMsg, quotaCost, durationMs,
	)
	if err != nil {
		fmt.Printf("api_logger: failed to insert log: %v\n", err)
	}
}

// GetAPILogs returns the last N API log entries, newest first.
// This is exposed to the frontend for the dev panel.
func (a *App) GetAPILogs(limit int) ([]APILog, error) {
	if limit <= 0 {
		limit = 100
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(
		`SELECT id, ts, operation, resource_id, resource_title, success, error_msg, quota_cost, duration_ms
		 FROM api_logs
		 ORDER BY id DESC
		 LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []APILog
	for rows.Next() {
		var l APILog
		var resourceID, resourceTitle, errMsg string
		var success int
		if err := rows.Scan(&l.ID, &l.Ts, &l.Operation, &resourceID, &resourceTitle, &success, &errMsg, &l.QuotaCost, &l.DurationMs); err != nil {
			continue
		}
		l.ResourceID = resourceID
		l.ResourceTitle = resourceTitle
		l.Success = success == 1
		l.ErrorMsg = errMsg
		logs = append(logs, l)
	}
	return logs, nil
}

// QuotaStatus represents the current daily quota usage and next reset time.
type QuotaStatus struct {
	Used      int   `json:"used"`
	Limit     int   `json:"limit"`
	Remaining int   `json:"remaining"`
	ResetsAt  int64 `json:"resetsAt"` // unix seconds, next midnight America/Los_Angeles
}

var pacificLocation = func() *time.Location {
	loc, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		return time.FixedZone("PST", -8*3600)
	}
	return loc
}()

// quotaWindow returns the start of the current Pacific Time day and the next Pacific midnight.
// Google resets daily YouTube Data API v3 quotas at midnight America/Los_Angeles (Pacific Time).
func quotaWindow(now time.Time) (time.Time, time.Time) {
	nowPT := now.In(pacificLocation)
	y, m, d := nowPT.Date()
	start := time.Date(y, m, d, 0, 0, 0, 0, pacificLocation)
	next := time.Date(y, m, d+1, 0, 0, 0, 0, pacificLocation)
	return start, next
}

// GetQuotaStatus returns the current estimated quota status and countdown timestamp.
// Exposed to the frontend.
func (a *App) GetQuotaStatus() (QuotaStatus, error) {
	start, next := quotaWindow(time.Now())

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	var used int
	err := a.db.conn.QueryRow(
		`SELECT COALESCE(SUM(quota_cost), 0) FROM api_logs WHERE ts >= ? AND ts < ? AND success = 1`,
		start.Unix(), next.Unix(),
	).Scan(&used)
	if err != nil {
		return QuotaStatus{
			Limit:     DailyQuotaLimit,
			Remaining: DailyQuotaLimit,
			ResetsAt:  next.Unix(),
		}, err
	}

	remaining := DailyQuotaLimit - used
	if remaining < 0 {
		remaining = 0
	}

	return QuotaStatus{
		Used:      used,
		Limit:     DailyQuotaLimit,
		Remaining: remaining,
		ResetsAt:  next.Unix(),
	}, nil
}

// GetQuotaUsedToday returns the total estimated quota units consumed today (Pacific Time).
// Exposed to the frontend.
func (a *App) GetQuotaUsedToday() (int, error) {
	status, err := a.GetQuotaStatus()
	return status.Used, err
}
