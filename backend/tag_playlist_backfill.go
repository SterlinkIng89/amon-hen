package backend

import (
	"sort"
	"strings"
)

// buildPlaylistTagMap builds a lookup map from YouTube playlist ID to its
// configured game tag name, covering both VOD and Clip playlists as well as
// legacy TagPlaylists entries.
func (a *App) buildPlaylistTagMap() map[string]string {
	a.configMu.RLock()
	defer a.configMu.RUnlock()

	playlistToTag := make(map[string]string)

	for tag, cfg := range a.config.TagPlaylistConfigs {
		cleanTag := strings.TrimSpace(tag)
		if cleanTag == "" {
			continue
		}
		if vodID := strings.TrimSpace(cfg.VodPlaylistID); vodID != "" {
			playlistToTag[vodID] = cleanTag
		}
		if clipID := strings.TrimSpace(cfg.ClipPlaylistID); clipID != "" {
			playlistToTag[clipID] = cleanTag
		}
	}

	// Legacy fallback: only fill playlist IDs not already mapped by TagPlaylistConfigs.
	for tag, plID := range a.config.TagPlaylists {
		cleanTag := strings.TrimSpace(tag)
		cleanPL := strings.TrimSpace(plID)
		if cleanTag == "" || cleanPL == "" {
			continue
		}
		if _, exists := playlistToTag[cleanPL]; !exists {
			playlistToTag[cleanPL] = cleanTag
		}
	}

	return playlistToTag
}

// BackfillGameTagsFromPlaylists infers yt_videos.game_tag from linked VOD and
// Clip playlists for any video whose game_tag is currently NULL or empty.
// Existing non-empty game_tag values are never overwritten.
func (a *App) BackfillGameTagsFromPlaylists() (int, error) {
	if a.db == nil || a.db.conn == nil {
		return 0, nil
	}

	playlistToTag := a.buildPlaylistTagMap()
	if len(playlistToTag) == 0 {
		return 0, nil
	}

	playlistIDs := make([]string, 0, len(playlistToTag))
	for plID := range playlistToTag {
		playlistIDs = append(playlistIDs, plID)
	}
	sort.Strings(playlistIDs)

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	tx, err := a.db.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		UPDATE yt_videos
		SET game_tag = ?
		WHERE id IN (SELECT video_id FROM yt_playlist_items WHERE playlist_id = ?)
		  AND (game_tag IS NULL OR TRIM(game_tag) = '')
	`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	totalUpdated := 0
	for _, plID := range playlistIDs {
		res, err := stmt.Exec(playlistToTag[plID], plID)
		if err != nil {
			return 0, err
		}
		if affected, err := res.RowsAffected(); err == nil {
			totalUpdated += int(affected)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return totalUpdated, nil
}
