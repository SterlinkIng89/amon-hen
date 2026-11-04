package backend

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type CatalogVideoDraft struct {
	VideoID            string `json:"videoId"`
	Title              string `json:"title"`
	PublishedAt        string `json:"publishedAt"`
	ThumbnailUrl       string `json:"thumbnailUrl"`
	Duration           string `json:"duration,omitempty"`
	LocalFile          string `json:"localFile,omitempty"`
	Position           int    `json:"position"`
	ExistingEpisode    int    `json:"existingEpisode"`
	Episode            int    `json:"episode"`
	Source             string `json:"source"` // "db" | "title" | "order" | "none"
	Conflict           bool   `json:"conflict"`
	ThumbnailUpdatedAt int64  `json:"thumbnailUpdatedAt"`
	ThumbnailEpisode   int    `json:"thumbnailEpisode"`
	TitleEpisode       int    `json:"titleEpisode"`
	SortDate           string `json:"sortDate"`
	Mismatch           bool   `json:"mismatch"`
	ChronologyIssue    bool   `json:"chronologyIssue"`
	LocalTitle         string `json:"localTitle,omitempty"`
	TitleMismatch      bool   `json:"titleMismatch,omitempty"`
}

type CatalogPlaylistSummary struct {
	PlaylistID        string `json:"playlistId"`
	Title             string `json:"title"`
	ThumbnailUrl      string `json:"thumbnailUrl"`
	VideoCount        int    `json:"videoCount"`
	Kind              string `json:"kind"` // "vod" | "clip"
	Tag               string `json:"tag"`
	TagConfidence     string `json:"tagConfidence"` // "known" | "guess"
	Linked            bool   `json:"linked"`
	HasCustomTemplate bool   `json:"hasCustomTemplate"`
}

func hasCustomThumbnailConfig(cfg TagThumbnailConfig) bool {
	return cfg.Enabled || cfg.SourceType != "" || cfg.SteamAssetType != ""
}

func (a *App) resolveTagTemplatePreviewURL(tag string) string {
	cleanTag := strings.ToLower(strings.TrimSpace(tag))
	if cleanTag == "" || a.cacheDir == "" {
		return ""
	}
	key := customThumbKey("tag_template_" + cleanTag)
	filePath := filepath.Join(a.cacheDir, "yt_thumbs", key+".jpg")
	info, err := os.Stat(filePath)
	if err != nil || info.IsDir() {
		return ""
	}
	return fmt.Sprintf("/cache/yt_thumbs/%s.jpg?v=%d", key, info.ModTime().Unix())
}

func (a *App) resolvePlaylistThumbnailCandidate(currentThumb, tag, fallbackCustomVidThumb string) string {
	if strings.HasPrefix(currentThumb, "/cache/yt_thumbs/") {
		return currentThumb
	}
	if preview := a.resolveTagTemplatePreviewURL(tag); preview != "" {
		return preview
	}
	if fallbackCustomVidThumb != "" {
		return fallbackCustomVidThumb
	}
	return currentThumb
}

func (a *App) resolveVideoThumbnailCandidateWithInfo(videoID, localFile string, episode *int, currentThumb string) (string, int64, int) {
	if a.cacheDir != "" {
		ytThumbsDir := filepath.Join(a.cacheDir, "yt_thumbs")
		// 1. Check yt:<videoID>
		if videoID != "" {
			key := customThumbKey("yt:" + videoID)
			filePath := filepath.Join(ytThumbsDir, key+".jpg")
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				return fmt.Sprintf("/cache/yt_thumbs/%s.jpg?v=%d", key, info.ModTime().Unix()), info.ModTime().Unix(), 0
			}
		}
		// 2. Check <videoID>_<episode>
		if videoID != "" && episode != nil && *episode > 0 {
			key := customThumbKey(fmt.Sprintf("%s_%d", videoID, *episode))
			filePath := filepath.Join(ytThumbsDir, key+".jpg")
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				return fmt.Sprintf("/cache/yt_thumbs/%s.jpg?v=%d", key, info.ModTime().Unix()), info.ModTime().Unix(), *episode
			}
		}
		// 3. Check localFile
		if localFile != "" {
			key := customThumbKey(localFile)
			filePath := filepath.Join(ytThumbsDir, key+".jpg")
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				return fmt.Sprintf("/cache/yt_thumbs/%s.jpg?v=%d", key, info.ModTime().Unix()), info.ModTime().Unix(), 0
			}
		}
	}
	// Fallback: strip query parameters from i.ytimg.com URLs to prevent 404
	if strings.Contains(currentThumb, "i.ytimg.com") && strings.Contains(currentThumb, "?") {
		return strings.Split(currentThumb, "?")[0], 0, 0
	}
	return currentThumb, 0, 0
}

func (a *App) resolveVideoThumbnailCandidate(videoID, localFile string, episode *int, currentThumb string) string {
	url, _, _ := a.resolveVideoThumbnailCandidateWithInfo(videoID, localFile, episode, currentThumb)
	return url
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
	UpdateLocal bool                `json:"updateLocal"`
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

func resolveSortDate(title, publishedAt string) string {
	if d := extractTitleDate(title); d != "" {
		return d
	}
	return publishedAt
}

func extractCalendarDate(draft CatalogVideoDraft) string {
	d := draft.SortDate
	if d == "" {
		d = extractTitleDate(draft.Title)
	}
	if d == "" && len(draft.PublishedAt) >= 10 {
		d = draft.PublishedAt[:10]
	}
	if len(d) >= 10 {
		return d[:10]
	}
	return d
}

// compareVideoChronology returns true if a should appear strictly before b in chronological order.
func compareVideoChronology(a, b CatalogVideoDraft) bool {
	dateA := extractCalendarDate(a)
	dateB := extractCalendarDate(b)

	if dateA != dateB {
		if dateA != "" && dateB != "" {
			return dateA < dateB
		}
		if dateA != "" {
			return true
		}
		if dateB != "" {
			return false
		}
	}

	// Same calendar day: do NOT use PublishedAt time (upload order can be inverted).
	// Tie-break by TitleEpisode if both have it
	if a.TitleEpisode > 0 && b.TitleEpisode > 0 && a.TitleEpisode != b.TitleEpisode {
		return a.TitleEpisode < b.TitleEpisode
	}

	// Tie-break by Position in playlist
	if a.Position != b.Position {
		return a.Position < b.Position
	}

	return a.VideoID < b.VideoID
}

// validateChronology verifies that drafts with positive episodes on earlier calendar dates strictly precede those on later calendar dates.
func validateChronology(drafts []CatalogVideoDraft) error {
	type dayStat struct {
		minEp int
		maxEp int
	}
	dayMap := make(map[string]*dayStat)
	var dates []string

	for _, d := range drafts {
		if d.Episode <= 0 {
			continue
		}
		date := extractCalendarDate(d)
		if date == "" {
			continue
		}
		if stat, exists := dayMap[date]; exists {
			if d.Episode < stat.minEp {
				stat.minEp = d.Episode
			}
			if d.Episode > stat.maxEp {
				stat.maxEp = d.Episode
			}
		} else {
			dayMap[date] = &dayStat{
				minEp: d.Episode,
				maxEp: d.Episode,
			}
			dates = append(dates, date)
		}
	}

	if len(dates) <= 1 {
		return nil
	}

	sort.Strings(dates)
	k := len(dates)
	prefixMax := make([]int, k)
	prefixMax[0] = dayMap[dates[0]].maxEp
	for i := 1; i < k; i++ {
		prefixMax[i] = prefixMax[i-1]
		if ep := dayMap[dates[i]].maxEp; ep > prefixMax[i] {
			prefixMax[i] = ep
		}
	}

	suffixMin := make([]int, k)
	suffixMin[k-1] = dayMap[dates[k-1]].minEp
	for i := k - 2; i >= 0; i-- {
		suffixMin[i] = suffixMin[i+1]
		if ep := dayMap[dates[i]].minEp; ep < suffixMin[i] {
			suffixMin[i] = ep
		}
	}

	for i := 0; i < k-1; i++ {
		if prefixMax[i] >= suffixMin[i+1] {
			return fmt.Errorf("chronological inversion detected: day %s has episode %d which cannot precede day %s with episode %d",
				dates[i], prefixMax[i], dates[i+1], suffixMin[i+1])
		}
	}
	return nil
}

// inferEpisodes deduces episode numbers for a list of video drafts using DB state, titles, or publication order.
func inferEpisodes(videos []CatalogVideoDraft, sep string) []CatalogVideoDraft {
	result := make([]CatalogVideoDraft, len(videos))
	copy(result, videos)

	hasAnyInferred := false

	// Pass 1: DB or Title parsing
	for i := range result {
		result[i].SortDate = resolveSortDate(result[i].Title, result[i].PublishedAt)
		ep, _ := parseEpisodeFromTitle(result[i].Title, sep)
		result[i].TitleEpisode = ep

		if result[i].ExistingEpisode > 0 {
			result[i].Episode = result[i].ExistingEpisode
			result[i].Source = "db"
			result[i].Mismatch = result[i].TitleEpisode > 0 && result[i].ExistingEpisode != result[i].TitleEpisode
			hasAnyInferred = true
			continue
		}

		if result[i].TitleEpisode > 0 {
			result[i].Episode = result[i].TitleEpisode
			result[i].Source = "title"
			result[i].Mismatch = false
			hasAnyInferred = true
			continue
		}

		result[i].Episode = 0
		result[i].Source = "none"
		result[i].Mismatch = false
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

	// Pass 4: Chronology inversion detection (cross-day calendar date ordering)
	type dayStat struct {
		minEp   int
		maxEp   int
		indices []int
	}
	dayMap := make(map[string]*dayStat)
	var dates []string

	for i := range result {
		result[i].ChronologyIssue = false
		if result[i].Episode <= 0 {
			continue
		}
		date := extractCalendarDate(result[i])
		if date == "" {
			continue
		}
		if stat, exists := dayMap[date]; exists {
			if result[i].Episode < stat.minEp {
				stat.minEp = result[i].Episode
			}
			if result[i].Episode > stat.maxEp {
				stat.maxEp = result[i].Episode
			}
			stat.indices = append(stat.indices, i)
		} else {
			dayMap[date] = &dayStat{
				minEp:   result[i].Episode,
				maxEp:   result[i].Episode,
				indices: []int{i},
			}
			dates = append(dates, date)
		}
	}

	if len(dates) > 1 {
		sort.Strings(dates)
		k := len(dates)
		prefixMax := make([]int, k)
		prefixMax[0] = dayMap[dates[0]].maxEp
		for i := 1; i < k; i++ {
			prefixMax[i] = prefixMax[i-1]
			if ep := dayMap[dates[i]].maxEp; ep > prefixMax[i] {
				prefixMax[i] = ep
			}
		}

		suffixMin := make([]int, k)
		suffixMin[k-1] = dayMap[dates[k-1]].minEp
		for i := k - 2; i >= 0; i-- {
			suffixMin[i] = suffixMin[i+1]
			if ep := dayMap[dates[i]].minEp; ep < suffixMin[i] {
				suffixMin[i] = ep
			}
		}

		for i := 0; i < k; i++ {
			for _, idx := range dayMap[dates[i]].indices {
				ep := result[idx].Episode
				if (i > 0 && ep <= prefixMax[i-1]) || (i < k-1 && ep >= suffixMin[i+1]) {
					result[idx].ChronologyIssue = true
				}
			}
		}
	}

	return result
}

type playlistLinkInfo struct {
	tag  string
	kind string
}

// playlistLinkMap builds a lookup table from YouTube playlist ID to its linked game tag and content kind.
func (cfg *Config) playlistLinkMap() map[string]playlistLinkInfo {
	m := make(map[string]playlistLinkInfo)
	if cfg == nil {
		return m
	}
	if cfg.TagPlaylistConfigs != nil {
		for tag, c := range cfg.TagPlaylistConfigs {
			if c.VodPlaylistID != "" {
				m[c.VodPlaylistID] = playlistLinkInfo{tag: tag, kind: "vod"}
			}
			if c.ClipPlaylistID != "" {
				m[c.ClipPlaylistID] = playlistLinkInfo{tag: tag, kind: "clip"}
			}
		}
	}
	if cfg.TagPlaylists != nil {
		for tag, plId := range cfg.TagPlaylists {
			if plId != "" {
				if _, exists := m[plId]; !exists {
					m[plId] = playlistLinkInfo{tag: tag, kind: "vod"}
				}
			}
		}
	}
	return m
}

// resolvePlaylistLink looks up whether a playlist ID is mapped to a game tag in config.
func (a *App) resolvePlaylistLink(playlistID string) (tag string, kind string, linked bool) {
	if playlistID == "" {
		return "", "", false
	}
	a.configMu.Lock()
	defer a.configMu.Unlock()

	link, ok := a.config.playlistLinkMap()[playlistID]
	if ok {
		return link.tag, link.kind, true
	}
	return "", "", false
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
	playlistLinkMap := a.config.playlistLinkMap()
	a.configMu.Unlock()

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`
		SELECT p.id, COALESCE(p.title, ''), COALESCE(p.video_count, 0), COALESCE(p.thumbnail_url, ''),
		       COALESCE((
		           SELECT v.thumbnail_url
		           FROM yt_playlist_items pi
		           JOIN yt_videos v ON pi.video_id = v.id
		           WHERE pi.playlist_id = p.id AND COALESCE(v.custom_thumb_updated_at, 0) > 0
		           ORDER BY v.custom_thumb_updated_at DESC, pi.position ASC
		           LIMIT 1
		       ), '')
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
		var customVidThumb string
		if err := rows.Scan(&s.PlaylistID, &s.Title, &s.VideoCount, &s.ThumbnailUrl, &customVidThumb); err != nil {
			continue
		}

		if link, ok := playlistLinkMap[s.PlaylistID]; ok {
			s.Tag = link.tag
			s.Kind = link.kind
			s.TagConfidence = "known"
			s.Linked = true
		} else {
			s.Tag, s.Kind, s.TagConfidence = inferTagFromPlaylistTitle(s.Title, knownTags)
			s.Linked = false
		}

		tagCfg := a.GetTagPlaylistConfig(s.Tag)
		s.HasCustomTemplate = hasCustomThumbnailConfig(tagCfg.ThumbnailConfig)
		s.ThumbnailUrl = a.resolvePlaylistThumbnailCandidate(s.ThumbnailUrl, s.Tag, customVidThumb)

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
	var plThumb string
	err = a.db.conn.QueryRow(`SELECT COALESCE(title, ''), COALESCE(video_count, 0), COALESCE(thumbnail_url, '') FROM yt_playlists WHERE id = ?`, playlistID).Scan(&plTitle, &videoCount, &plThumb)
	if err != nil {
		a.db.mu.Unlock()
		return draft, fmt.Errorf("playlist not found: %w", err)
	}

	// Fetch videos linked in this playlist
	rows, err := a.db.conn.Query(`
		SELECT v.id, COALESCE(v.title, ''), COALESCE(v.published_at, ''), COALESCE(v.thumbnail_url, ''),
		       COALESCE(v.local_file, ''), pi.position, COALESCE(v.episode, 0), COALESCE(v.custom_thumb_updated_at, 0),
		       COALESCE(v.custom_thumb_episode, 0), COALESCE(v.duration, '')
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
		if err := rows.Scan(&vd.VideoID, &vd.Title, &vd.PublishedAt, &vd.ThumbnailUrl, &localFile, &vd.Position, &vd.ExistingEpisode, &vd.ThumbnailUpdatedAt, &vd.ThumbnailEpisode, &vd.Duration); err == nil {
			vd.LocalFile = localFile
			resolvedThumb, _, matchedEpisode := a.resolveVideoThumbnailCandidateWithInfo(vd.VideoID, vd.LocalFile, &vd.ExistingEpisode, vd.ThumbnailUrl)
			vd.ThumbnailUrl = resolvedThumb
			if vd.ThumbnailEpisode <= 0 && matchedEpisode > 0 {
				vd.ThumbnailEpisode = matchedEpisode
			}
			vids = append(vids, vd)
		}
	}
	a.db.mu.Unlock()

	tag, kind, isLinked := a.resolvePlaylistLink(playlistID)
	var conf string
	if isLinked {
		conf = "known"
	} else {
		tag, kind, conf = inferTagFromPlaylistTitle(plTitle, knownTags)
	}

	draft.PlaylistID = playlistID
	draft.Title = plTitle
	draft.ThumbnailUrl = plThumb
	draft.VideoCount = videoCount
	draft.Kind = kind
	draft.Tag = tag
	draft.TagConfidence = conf
	draft.Linked = isLinked

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
			vids[i].Mismatch = false
			vids[i].ChronologyIssue = false
			ep, _ := parseEpisodeFromTitle(vids[i].Title, a.titleSep())
			vids[i].TitleEpisode = ep
			vids[i].SortDate = resolveSortDate(vids[i].Title, vids[i].PublishedAt)
		}
		draft.Videos = vids
	}

	for i := range draft.Videos {
		v := &draft.Videos[i]
		if v.LocalFile != "" {
			info, err := os.Stat(v.LocalFile)
			if err == nil && !info.IsDir() {
				a.configMu.RLock()
				meta := a.config.VideoMetadata[v.LocalFile]
				a.configMu.RUnlock()

				vFile := VideoFile{
					Name:        filepath.Base(v.LocalFile),
					Path:        v.LocalFile,
					Size:        info.Size(),
					ModTime:     info.ModTime().UnixMilli(),
					Game:        meta.Game,
					Episode:     v.Episode,
					Event:       meta.Event,
					GameMode:    meta.GameMode,
					CustomVars:  meta.CustomVars,
					ContentType: a.resolveContentType(meta, v.LocalFile),
				}
				if vFile.Game == "" && draft.Tag != "" {
					vFile.Game = draft.Tag
				}
				generated := a.generateYouTubeTitle(vFile)
				v.LocalTitle = generated
				if generated != "" && !titlesMatch(generated, v.Title) {
					v.TitleMismatch = true
					v.Mismatch = true
				}
			}
		}
	}

	// Thumbnail config for tag
	tagCfg := a.GetTagPlaylistConfig(tag)
	if hasCustomThumbnailConfig(tagCfg.ThumbnailConfig) {
		draft.ThumbnailConfig = &tagCfg.ThumbnailConfig
	}
	draft.HasCustomTemplate = hasCustomThumbnailConfig(tagCfg.ThumbnailConfig)

	var customVidThumb string
	for _, vid := range vids {
		if vid.ThumbnailUpdatedAt > 0 && vid.ThumbnailUrl != "" {
			customVidThumb = vid.ThumbnailUrl
			break
		}
	}
	draft.ThumbnailUrl = a.resolvePlaylistThumbnailCandidate(draft.ThumbnailUrl, tag, customVidThumb)

	return draft, nil
}

// validateVodAssignments checks for duplicate positive episode numbers and chronological inversions before applying VOD catalog.
func (a *App) validateVodAssignments(playlistID string, assignments []CatalogAssignment) error {
	seenEp := make(map[int]string)
	var positiveAssignedIDs []string
	for _, asgn := range assignments {
		if asgn.VideoID == "" || asgn.Episode <= 0 {
			continue
		}
		if prevID, exists := seenEp[asgn.Episode]; exists {
			return fmt.Errorf("duplicate episode number %d assigned to multiple videos (%s, %s)", asgn.Episode, prevID, asgn.VideoID)
		}
		seenEp[asgn.Episode] = asgn.VideoID
		positiveAssignedIDs = append(positiveAssignedIDs, asgn.VideoID)
	}

	if len(positiveAssignedIDs) <= 1 {
		return nil
	}

	placeholders := make([]string, len(positiveAssignedIDs))
	args := make([]interface{}, 0, len(positiveAssignedIDs)+1)
	args = append(args, playlistID)
	for i, id := range positiveAssignedIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}

	rows, err := a.db.conn.Query(fmt.Sprintf(`
		SELECT v.id, COALESCE(v.title, ''), COALESCE(v.published_at, ''), COALESCE(pi.position, 0)
		FROM yt_videos v
		LEFT JOIN yt_playlist_items pi ON pi.video_id = v.id AND pi.playlist_id = ?
		WHERE v.id IN (%s)
	`, strings.Join(placeholders, ",")), args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	type vidMeta struct {
		title       string
		publishedAt string
		position    int
	}
	metaMap := make(map[string]vidMeta)
	for rows.Next() {
		var id, title, publishedAt string
		var position int
		if err := rows.Scan(&id, &title, &publishedAt, &position); err == nil {
			metaMap[id] = vidMeta{
				title:       title,
				publishedAt: publishedAt,
				position:    position,
			}
		}
	}

	var drafts []CatalogVideoDraft
	for _, asgn := range assignments {
		if asgn.Episode > 0 && asgn.VideoID != "" {
			m := metaMap[asgn.VideoID]
			drafts = append(drafts, CatalogVideoDraft{
				VideoID:     asgn.VideoID,
				Title:       m.title,
				PublishedAt: m.publishedAt,
				SortDate:    resolveSortDate(m.title, m.publishedAt),
				Position:    m.position,
				Episode:     asgn.Episode,
			})
		}
	}

	return validateChronology(drafts)
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
	if req.Kind == "vod" {
		if err := a.validateVodAssignments(req.PlaylistID, req.Assignments); err != nil {
			a.db.mu.Unlock()
			return err
		}
	}

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

	type localSyncEntry struct {
		localFile string
		episode   int
	}
	var localSyncList []localSyncEntry

	var selectLocalStmt *sql.Stmt
	if req.UpdateLocal {
		selectLocalStmt, err = tx.Prepare(`SELECT local_file FROM yt_videos WHERE id = ?`)
		if err != nil {
			tx.Rollback()
			a.db.mu.Unlock()
			return err
		}
		defer selectLocalStmt.Close()
	}

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

		if req.UpdateLocal && selectLocalStmt != nil {
			var lf sql.NullString
			if sErr := selectLocalStmt.QueryRow(asgn.VideoID).Scan(&lf); sErr == nil && lf.Valid && strings.TrimSpace(lf.String) != "" {
				localSyncList = append(localSyncList, localSyncEntry{
					localFile: strings.TrimSpace(lf.String),
					episode:   asgn.Episode,
				})
			}
		}
	}

	if err := tx.Commit(); err != nil {
		a.db.mu.Unlock()
		return err
	}
	a.db.mu.Unlock()

	// Update persistent TagPlaylistConfigs and optionally local video metadata
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

	if req.UpdateLocal && len(localSyncList) > 0 {
		if a.config.VideoGames == nil {
			a.config.VideoGames = make(map[string]string)
		}
		if a.config.VideoMetadata == nil {
			a.config.VideoMetadata = make(map[string]VideoMeta)
		}
		for _, entry := range localSyncList {
			a.config.VideoGames[entry.localFile] = tag
			meta := a.config.VideoMetadata[entry.localFile]
			meta.Game = tag
			meta.Episode = entry.episode
			meta.PlaylistID = req.PlaylistID
			if req.Kind != "" {
				meta.ContentType = req.Kind
			}
			a.config.VideoMetadata[entry.localFile] = meta
		}
	}
	a.configMu.Unlock()

	a.saveConfig()
	appLog("[Catalog] Applied catalog for tag %q (%s) to playlist %s with %d assignments (local updated: %d)", tag, req.Kind, req.PlaylistID, len(req.Assignments), len(localSyncList))
	return nil
}


