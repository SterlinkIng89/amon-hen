package backend

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type CatalogVideoDraft struct {
	VideoID         string `json:"videoId"`
	Title           string `json:"title"`
	PublishedAt     string `json:"publishedAt"`
	ThumbnailUrl    string `json:"thumbnailUrl"`
	LocalFile       string `json:"localFile,omitempty"`
	Position        int    `json:"position"`
	ExistingEpisode int    `json:"existingEpisode"`
	Episode         int    `json:"episode"`
	Source          string `json:"source"` // "db" | "title" | "order" | "none"
	Conflict        bool   `json:"conflict"`
}

type CatalogPlaylistSummary struct {
	PlaylistID    string `json:"playlistId"`
	Title         string `json:"title"`
	VideoCount    int    `json:"videoCount"`
	Kind          string `json:"kind"` // "vod" | "clip"
	Tag           string `json:"tag"`
	TagConfidence string `json:"tagConfidence"` // "known" | "guess"
	Linked        bool   `json:"linked"`
}

type PlaylistCatalogDraft struct {
	CatalogPlaylistSummary
	SteamAppID      string              `json:"steamAppId"`
	NeedsSync       bool                `json:"needsSync"`
	ThumbnailConfig *TagThumbnailConfig `json:"thumbnailConfig,omitempty"`
	Videos          []CatalogVideoDraft `json:"videos"`
}

type CatalogAssignment struct {
	VideoID string `json:"videoId"`
	Episode int    `json:"episode"`
}

type CatalogApplyRequest struct {
	PlaylistID  string              `json:"playlistId"`
	Tag         string              `json:"tag"`
	Kind        string              `json:"kind"` // "vod" | "clip"
	Assignments []CatalogAssignment `json:"assignments"`
}

// inferTagFromPlaylistTitle extracts a game tag and content kind (vod vs clip) from a playlist title.
func inferTagFromPlaylistTitle(title string, knownTags []string) (tag, kind, confidence string) {
	clean := strings.TrimSpace(title)
	kind = "vod"

	lower := strings.ToLower(clean)
	if strings.HasSuffix(lower, " clips") {
		clean = strings.TrimSpace(clean[:len(clean)-6])
		kind = "clip"
	} else if strings.HasSuffix(lower, " clip") {
		clean = strings.TrimSpace(clean[:len(clean)-5])
		kind = "clip"
	}

	confidence = "guess"
	tag = clean

	for _, k := range knownTags {
		if strings.EqualFold(strings.TrimSpace(k), clean) {
			tag = k
			confidence = "known"
			break
		}
	}

	return tag, kind, confidence
}

var (
	epRegex1 = regexp.MustCompile(`(?i)\b(?:ep(?:isodio|isode)?\.?|parte|part)\s*#?(\d+)`)
	epRegex2 = regexp.MustCompile(`#(\d+)\s*$`)
)

// inferEpisodes deduces episode numbers for a list of video drafts using DB state, titles, or publication order.
func inferEpisodes(videos []CatalogVideoDraft, sep string) []CatalogVideoDraft {
	result := make([]CatalogVideoDraft, len(videos))
	copy(result, videos)

	hasAnyInferred := false

	// Pass 1: DB or Title parsing
	for i := range result {
		if result[i].ExistingEpisode > 0 {
			result[i].Episode = result[i].ExistingEpisode
			result[i].Source = "db"
			hasAnyInferred = true
			continue
		}

		// Try separator-based suffix e.g. "Game - 12/04/26 - 4"
		if sep != "" && strings.Contains(result[i].Title, sep) {
			parts := strings.Split(result[i].Title, sep)
			lastPart := strings.TrimSpace(parts[len(parts)-1])
			if n, err := strconv.Atoi(lastPart); err == nil && n > 0 {
				result[i].Episode = n
				result[i].Source = "title"
				hasAnyInferred = true
				continue
			}
		}

		// Regex fallbacks: Ep 7, Part 8, etc.
		if m := epRegex1.FindStringSubmatch(result[i].Title); len(m) > 1 {
			if n, err := strconv.Atoi(m[1]); err == nil && n > 0 {
				result[i].Episode = n
				result[i].Source = "title"
				hasAnyInferred = true
				continue
			}
		}

		if m := epRegex2.FindStringSubmatch(result[i].Title); len(m) > 1 {
			if n, err := strconv.Atoi(m[1]); err == nil && n > 0 {
				result[i].Episode = n
				result[i].Source = "title"
				hasAnyInferred = true
				continue
			}
		}

		result[i].Episode = 0
		result[i].Source = "none"
	}

	// Pass 2: Fallback to order if NO videos had any number detected
	if !hasAnyInferred && len(result) > 0 {
		type indexedItem struct {
			index int
			draft CatalogVideoDraft
		}
		items := make([]indexedItem, len(result))
		for i := range result {
			items[i] = indexedItem{index: i, draft: result[i]}
		}

		sort.Slice(items, func(i, j int) bool {
			if items[i].draft.PublishedAt != items[j].draft.PublishedAt {
				return items[i].draft.PublishedAt < items[j].draft.PublishedAt
			}
			return items[i].draft.VideoID < items[j].draft.VideoID
		})

		for order, item := range items {
			result[item.index].Episode = order + 1
			result[item.index].Source = "order"
		}
	}

	// Pass 3: Conflict detection (duplicate non-zero episodes)
	counts := make(map[int]int)
	for _, v := range result {
		if v.Episode > 0 {
			counts[v.Episode]++
		}
	}
	for i := range result {
		if result[i].Episode > 0 && counts[result[i].Episode] > 1 {
			result[i].Conflict = true
		} else {
			result[i].Conflict = false
		}
	}

	return result
}

// ListCatalogPlaylists lists YouTube playlists with inferred tag metadata and link status.
func (a *App) ListCatalogPlaylists() ([]CatalogPlaylistSummary, error) {
	if a.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	knownTags, err := a.GetAllGameTags()
	if err != nil {
		knownTags = []string{}
	}

	a.configMu.Lock()
	linkedVodMap := make(map[string]bool)
	linkedClipMap := make(map[string]bool)
	if a.config.TagPlaylistConfigs != nil {
		for _, cfg := range a.config.TagPlaylistConfigs {
			if cfg.VodPlaylistID != "" {
				linkedVodMap[cfg.VodPlaylistID] = true
			}
			if cfg.ClipPlaylistID != "" {
				linkedClipMap[cfg.ClipPlaylistID] = true
			}
		}
	}
	if a.config.TagPlaylists != nil {
		for _, plId := range a.config.TagPlaylists {
			if plId != "" {
				linkedVodMap[plId] = true
			}
		}
	}
	a.configMu.Unlock()

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`
		SELECT p.id, COALESCE(p.title, ''), COALESCE(p.video_count, 0)
		FROM yt_playlists p
		ORDER BY COALESCE(
			(SELECT MAX(v.published_at) FROM yt_videos v JOIN yt_playlist_items pi ON v.id = pi.video_id WHERE pi.playlist_id = p.id),
			p.published_at,
			''
		) DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []CatalogPlaylistSummary
	for rows.Next() {
		var s CatalogPlaylistSummary
		if err := rows.Scan(&s.PlaylistID, &s.Title, &s.VideoCount); err != nil {
			continue
		}

		s.Tag, s.Kind, s.TagConfidence = inferTagFromPlaylistTitle(s.Title, knownTags)
		if s.Kind == "clip" {
			s.Linked = linkedClipMap[s.PlaylistID]
		} else {
			s.Linked = linkedVodMap[s.PlaylistID]
		}

		summaries = append(summaries, s)
	}

	return summaries, nil
}

// GetPlaylistCatalogDraft retrieves all items in a playlist and builds a pre-populated catalog draft.
func (a *App) GetPlaylistCatalogDraft(playlistID string) (PlaylistCatalogDraft, error) {
	var draft PlaylistCatalogDraft
	if a.db == nil || playlistID == "" {
		return draft, fmt.Errorf("invalid arguments")
	}

	knownTags, err := a.GetAllGameTags()
	if err != nil {
		knownTags = []string{}
	}

	a.db.mu.Lock()
	var plTitle string
	var videoCount int
	err = a.db.conn.QueryRow(`SELECT COALESCE(title, ''), COALESCE(video_count, 0) FROM yt_playlists WHERE id = ?`, playlistID).Scan(&plTitle, &videoCount)
	if err != nil {
		a.db.mu.Unlock()
		return draft, fmt.Errorf("playlist not found: %w", err)
	}

	// Fetch videos linked in this playlist
	rows, err := a.db.conn.Query(`
		SELECT v.id, COALESCE(v.title, ''), COALESCE(v.published_at, ''), COALESCE(v.thumbnail_url, ''),
		       COALESCE(v.local_file, ''), pi.position, COALESCE(v.episode, 0)
		FROM yt_playlist_items pi
		JOIN yt_videos v ON pi.video_id = v.id
		WHERE pi.playlist_id = ?
		ORDER BY pi.position ASC
	`, playlistID)
	if err != nil {
		a.db.mu.Unlock()
		return draft, err
	}
	defer rows.Close()

	var vids []CatalogVideoDraft
	for rows.Next() {
		var vd CatalogVideoDraft
		var localFile string
		if err := rows.Scan(&vd.VideoID, &vd.Title, &vd.PublishedAt, &vd.ThumbnailUrl, &localFile, &vd.Position, &vd.ExistingEpisode); err == nil {
			vd.LocalFile = localFile
			vids = append(vids, vd)
		}
	}
	a.db.mu.Unlock()

	tag, kind, conf := inferTagFromPlaylistTitle(plTitle, knownTags)

	a.configMu.Lock()
	linked := false
	if a.config.TagPlaylistConfigs != nil {
		if cfg, ok := a.config.TagPlaylistConfigs[tag]; ok {
			if (kind == "clip" && cfg.ClipPlaylistID == playlistID) || (kind == "vod" && cfg.VodPlaylistID == playlistID) {
				linked = true
			}
		}
	}
	a.configMu.Unlock()

	draft.PlaylistID = playlistID
	draft.Title = plTitle
	draft.VideoCount = videoCount
	draft.Kind = kind
	draft.Tag = tag
	draft.TagConfidence = conf
	draft.Linked = linked

	// Check if full sync is needed
	if videoCount > 0 && len(vids) == 0 {
		draft.NeedsSync = true
	}

	// Steam AppID resolution
	appId := a.GetSteamAppID(tag)
	if appId == "NOT_FOUND" {
		appId = ""
	}
	draft.SteamAppID = appId

	// Infer episodes if VOD
	if kind == "vod" {
		draft.Videos = inferEpisodes(vids, a.titleSep())
	} else {
		for i := range vids {
			vids[i].Episode = 0
			vids[i].Source = "none"
			vids[i].Conflict = false
		}
		draft.Videos = vids
	}

	// Thumbnail config for tag
	tagCfg := a.GetTagPlaylistConfig(tag)
	if tagCfg.ThumbnailConfig.SourceType != "" || tagCfg.ThumbnailConfig.SteamAssetType != "" || tagCfg.ThumbnailConfig.Enabled {
		draft.ThumbnailConfig = &tagCfg.ThumbnailConfig
	}

	return draft, nil
}

// ApplyPlaylistCatalog updates local database game tags, episodes, and TagPlaylistConfigs.
func (a *App) ApplyPlaylistCatalog(req CatalogApplyRequest) error {
	if a.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if strings.TrimSpace(req.Tag) == "" {
		return fmt.Errorf("tag cannot be empty")
	}

	tag := strings.TrimSpace(req.Tag)

	a.db.mu.Lock()
	tx, err := a.db.conn.Begin()
	if err != nil {
		a.db.mu.Unlock()
		return err
	}

	updateStmt, err := tx.Prepare(`UPDATE yt_videos SET game_tag = ?, episode = ? WHERE id = ?`)
	if err != nil {
		tx.Rollback()
		a.db.mu.Unlock()
		return err
	}
	defer updateStmt.Close()

	for _, asgn := range req.Assignments {
		if asgn.VideoID == "" {
			continue
		}
		var epVal interface{}
		if req.Kind == "clip" || asgn.Episode <= 0 {
			epVal = nil
		} else {
			epVal = asgn.Episode
		}

		if _, err := updateStmt.Exec(tag, epVal, asgn.VideoID); err != nil {
			tx.Rollback()
			a.db.mu.Unlock()
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		a.db.mu.Unlock()
		return err
	}
	a.db.mu.Unlock()

	// Update persistent TagPlaylistConfigs
	a.configMu.Lock()
	if a.config.TagPlaylistConfigs == nil {
		a.config.TagPlaylistConfigs = make(map[string]TagPlaylistConfig)
	}
	if a.config.TagPlaylists == nil {
		a.config.TagPlaylists = make(map[string]string)
	}

	existingCfg := a.config.TagPlaylistConfigs[tag]
	if req.Kind == "clip" {
		existingCfg.ClipPlaylistID = req.PlaylistID
	} else {
		existingCfg.VodPlaylistID = req.PlaylistID
		a.config.TagPlaylists[tag] = req.PlaylistID
	}
	a.config.TagPlaylistConfigs[tag] = existingCfg
	a.configMu.Unlock()

	a.saveConfig()
	appLog("[Catalog] Applied catalog for tag %q (%s) to playlist %s with %d assignments", tag, req.Kind, req.PlaylistID, len(req.Assignments))
	return nil
}
