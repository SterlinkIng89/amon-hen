package backend

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

var validBacklogStatuses = map[string]bool{
	"playing":   true,
	"up_next":   true,
	"candidate": true,
	"on_hold":   true,
	"dropped":   true,
}

var validRatingTiers = map[string]bool{
	"S": true,
	"A": true,
	"B": true,
	"C": true,
	"D": true,
}

// UpsertSteamBacklogItem inserts or updates a backlog item, preserving existing rank on update or auto-incrementing rank on insert.
func (a *App) UpsertSteamBacklogItem(appID int, status string, notes string) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}

	status = strings.ToLower(strings.TrimSpace(status))
	if !validBacklogStatuses[status] {
		status = "candidate"
	}
	notes = strings.TrimSpace(notes)

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	var existingRank int
	err := a.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = ?", appID).Scan(&existingRank)
	if err == sql.ErrNoRows {
		var nextRank int
		_ = a.db.conn.QueryRow("SELECT COALESCE(MAX(rank_order), 0) + 1 FROM steam_backlog_queue").Scan(&nextRank)
		if nextRank <= 0 {
			nextRank = 1
		}
		_, err = a.db.conn.Exec(`
			INSERT INTO steam_backlog_queue (appid, rank_order, status, notes, added_at)
			VALUES (?, ?, ?, ?, ?)
		`, appID, nextRank, status, notes, time.Now().Unix())
		return err
	} else if err != nil {
		return err
	}

	_, err = a.db.conn.Exec(`
		UPDATE steam_backlog_queue
		SET status = ?, notes = ?
		WHERE appid = ?
	`, status, notes, appID)
	return err
}

// ReorderSteamBacklog updates rank_order for given appIDs in consecutive order (1..N).
func (a *App) ReorderSteamBacklog(appIDs []int) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	tx, err := a.db.conn.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("UPDATE steam_backlog_queue SET rank_order = ? WHERE appid = ?")
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for i, appID := range appIDs {
		rank := i + 1
		if _, err := stmt.Exec(rank, appID); err != nil {
			return fmt.Errorf("failed to update rank for appid %d: %w", appID, err)
		}
	}

	return tx.Commit()
}

// RemoveSteamBacklogItem removes a game from the backlog queue.
func (a *App) RemoveSteamBacklogItem(appID int) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, err := a.db.conn.Exec("DELETE FROM steam_backlog_queue WHERE appid = ?", appID)
	return err
}

// UpsertSteamGameRating creates or updates personal tier and score rating for an appID.
func (a *App) UpsertSteamGameRating(appID int, tier string, score int, notes string) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}

	tier = strings.ToUpper(strings.TrimSpace(tier))
	if !validRatingTiers[tier] {
		tier = "A"
	}

	if score < 1 {
		score = 1
	} else if score > 10 {
		score = 10
	}
	notes = strings.TrimSpace(notes)

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, err := a.db.conn.Exec(`
		INSERT INTO steam_game_ratings (appid, tier, score, notes, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(appid) DO UPDATE SET
			tier = excluded.tier,
			score = excluded.score,
			notes = excluded.notes,
			updated_at = excluded.updated_at
	`, appID, tier, score, notes, time.Now().Unix())
	return err
}

// RemoveSteamGameRating removes a game's personal rating.
func (a *App) RemoveSteamGameRating(appID int) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	_, err := a.db.conn.Exec("DELETE FROM steam_game_ratings WHERE appid = ?", appID)
	return err
}
