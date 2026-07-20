package backend

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type VideoFile struct {
	Name          string `json:"name"`
	Path          string `json:"path"`
	Size          int64  `json:"size"`
	ModTime       int64  `json:"modTime"`
	Folder        string `json:"folder"`
	Game          string `json:"game"`
	YouTubeTitle  string `json:"youtubeTitle"`
	Description   string `json:"description"`
	Privacy       string `json:"privacy"`
	YouTubeID     string `json:"youtubeId,omitempty"`
	PlaylistID    string `json:"playlistId,omitempty"`
	PlaylistTitle string `json:"playlistTitle,omitempty"`
	Episode       int    `json:"episode"`
	Event         string            `json:"event,omitempty"`
	GameMode      string            `json:"gameMode,omitempty"`
	CustomVars    map[string]string `json:"customVars,omitempty"`
}

// generateYouTubeTitle builds the suggested upload title from video metadata and game profiles.
func (a *App) generateYouTubeTitle(video VideoFile) string {
	game := video.Game
	episode := video.Episode
	profile, hasProfile := a.config.GameProfiles[game]

	re := regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})`)
	stem := strings.TrimSuffix(video.Name, filepath.Ext(video.Name))
	match := re.FindStringSubmatch(stem)

	dateStr := ""
	if match != nil {
		year, month, day := match[1], match[2], match[3]
		d := strings.TrimLeft(day, "0")
		if d == "" {
			d = "0"
		}
		y := year[len(year)-2:]
		dateStr = fmt.Sprintf("%s/%s/%s", d, month, y)
	} else {
		now := time.Now()
		dateStr = fmt.Sprintf("%d/%02d/%s", now.Day(), now.Month(), now.Format("06"))
	}

	if game == "" {
		return dateStr
	}

	if hasProfile && profile.Type == "multiplayer" {
		template := profile.TitleTemplate
		if template == "" {
			template = "{event} - {gamemode} - {date}"
		}
		res := strings.ReplaceAll(template, "{game}", game)
		res = strings.ReplaceAll(res, "{event}", video.Event)
		res = strings.ReplaceAll(res, "{gamemode}", video.GameMode)
		res = strings.ReplaceAll(res, "{date}", dateStr)
		res = strings.ReplaceAll(res, "{episode}", fmt.Sprintf("%d", episode))
		
		if len(video.CustomVars) > 0 {
			for k, v := range video.CustomVars {
				val := v
				if val == "" {
					val = strings.Title(k)
				}
				res = strings.ReplaceAll(res, "{"+k+"}", val)
			}
		}
		
		// Clean up common issues if event/gamemode is missing
		res = strings.ReplaceAll(res, " -  - ", " - ")
		res = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(res), "-"))
		return res
	}

	epSuffix := ""
	if episode > 0 {
		epSuffix = fmt.Sprintf(" — %d", episode)
	}

	return fmt.Sprintf("%s — %s%s", game, dateStr, epSuffix)
}

// episodeCountForTag returns the highest episode number already used for a tag
// by querying yt_videos. It parses the trailing "— N" from titles (covers
// uploaded videos with no explicit episode column) and also checks the episode
// column directly. Falls back to COUNT when no episode suffix is found.
func (a *App) episodeCountForTag(tag string) int {
	if tag == "" {
		return 0
	}

	titlePatternHyphen := tag + " - %"
	titlePatternDash := tag + " \u2014 %"

	epRe := regexp.MustCompile(` (?:—|-) (\d+)$`)

	maxFromTitles := 0
	titleCount := 0

	rows, err := a.db.conn.Query(
		`SELECT title FROM yt_videos WHERE title LIKE ? OR title LIKE ?`,
		titlePatternHyphen, titlePatternDash,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var title string
			if rows.Scan(&title) != nil {
				continue
			}
			titleCount++
			if m := epRe.FindStringSubmatch(title); m != nil {
				if n, err := strconv.Atoi(m[1]); err == nil && n > maxFromTitles {
					maxFromTitles = n
				}
			}
		}
	}

	titleMax := maxFromTitles
	if titleMax == 0 {
		titleMax = titleCount
	}

	var maxEpisode int
	a.db.conn.QueryRow(
		`SELECT COALESCE(MAX(episode), 0) FROM yt_videos WHERE game_tag = ? AND episode IS NOT NULL AND episode > 0 AND local_file IS NOT NULL AND local_file != ''`, tag,
	).Scan(&maxEpisode)

	if maxEpisode > titleMax {
		return maxEpisode
	}
	return titleMax
}

// GetVideosFromFolders scans multiple directories and returns a merged result.
func (a *App) GetVideosFromFolders(folders []string) ([]VideoFile, error) {
	supported := map[string]bool{
		".mp4":  true,
		".mkv":  true,
		".webm": true,
		".mov":  true,
		".avi":  true,
	}
	var videos []VideoFile

	a.db.mu.Lock()
	pMap := make(map[string]string)
	pTitleMap := make(map[string]string)
	linkedFiles := make(map[string]string)
	pathMap := make(map[string]string)

	rows, err := a.db.conn.Query(`
		SELECT pi.video_id, pi.playlist_id, p.title 
		FROM yt_playlist_items pi
		JOIN yt_playlists p ON pi.playlist_id = p.id
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var vid, pid, ptitle string
			if err := rows.Scan(&vid, &pid, &ptitle); err == nil {
				pMap[vid] = pid
				pTitleMap[vid] = ptitle
			}
		}
	}

	vRows, err := a.db.conn.Query(`SELECT id, local_file FROM yt_videos WHERE local_file IS NOT NULL AND local_file != ''`)
	if err == nil {
		defer vRows.Close()
		for vRows.Next() {
			var id string
			var lpath sql.NullString
			if err := vRows.Scan(&id, &lpath); err == nil {
				if lpath.Valid && lpath.String != "" {
					pathMap[lpath.String] = id
					linkedFiles[filepath.Base(lpath.String)] = id
				}
			}
		}
	}
	a.db.mu.Unlock()

	configChanged := false
	for _, dir := range folders {
		fSettings := a.GetFolderSettings(dir)

		filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if !fSettings.Recursive && path != dir {
					return filepath.SkipDir
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(d.Name()))
			if !supported[ext] {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				return nil
			}

			a.configMu.RLock()
			meta := a.config.VideoMetadata[path]
			a.configMu.RUnlock()

			if fSettings.MaxDurationSecs > 0 {
				if meta.DurationSecs == 0 {
					dur, err := a.GetVideoDuration(path)
					if err == nil && dur > 0 {
						meta.DurationSecs = int(dur)
					} else {
						meta.DurationSecs = 999999
					}
					
					a.configMu.Lock()
					if a.config.VideoMetadata == nil {
						a.config.VideoMetadata = make(map[string]VideoMeta)
					}
					a.config.VideoMetadata[path] = meta
					configChanged = true
					a.configMu.Unlock()
				}
				if meta.DurationSecs > fSettings.MaxDurationSecs {
					return nil
				}
			}

			videos = append(videos, VideoFile{
				Name:         d.Name(),
				Path:         path,
				Size:         info.Size(),
				ModTime:      info.ModTime().UnixMilli(),
				Folder:       dir,
				Game:         meta.Game,
				YouTubeTitle: meta.YouTubeTitle,
				Description:  meta.Description,
				Privacy:      meta.Privacy,
				YouTubeID:    meta.YouTubeID,
				PlaylistID:   meta.PlaylistID,
				PlaylistTitle: func() string {
					if t := pTitleMap[meta.YouTubeID]; t != "" {
						return t
					}
					return meta.PlaylistTitle
				}(),
				Episode:    meta.Episode,
				Event:      meta.Event,
				GameMode:   meta.GameMode,
				CustomVars: meta.CustomVars,
			})

			vIdx := len(videos) - 1
			if videos[vIdx].YouTubeID == "" {
				if id, ok := pathMap[path]; ok {
					videos[vIdx].YouTubeID = id
				}
			}
			if videos[vIdx].YouTubeID == "" {
				if id, ok := linkedFiles[d.Name()]; ok {
					videos[vIdx].YouTubeID = id
				}
			}

			if videos[vIdx].PlaylistID == "" && videos[vIdx].YouTubeID != "" {
				videos[vIdx].PlaylistID = pMap[videos[vIdx].YouTubeID]
				videos[vIdx].PlaylistTitle = pTitleMap[videos[vIdx].YouTubeID]
			}
			return nil
		})
	}

	if configChanged {
		a.saveConfig()
	}

	sort.Slice(videos, func(i, j int) bool {
		return videos[i].ModTime < videos[j].ModTime
	})

	// Pre-scan: find the highest explicit episode set in config per tag.
	// Local explicit episodes take priority over the DB count as the counter base.
	localMaxExplicit := make(map[string]int)
	for i := range videos {
		if videos[i].Game != "" && videos[i].Episode > 0 {
			if videos[i].Episode > localMaxExplicit[videos[i].Game] {
				localMaxExplicit[videos[i].Game] = videos[i].Episode
			}
		}
	}

	localCounters := make(map[string]int)

	for i := range videos {
		game := videos[i].Game
		if game == "" {
			continue
		}

		if _, seen := localCounters[game]; !seen {
			a.db.mu.Lock()
			dbBase := a.episodeCountForTag(game)
			a.db.mu.Unlock()

			localBase := localMaxExplicit[game]
			if localBase > 0 {
				localCounters[game] = localBase
			} else {
				localCounters[game] = dbBase
			}
		}

		profile, hasProfile := a.config.GameProfiles[game]
		if hasProfile && profile.Type == "multiplayer" {
			videos[i].Episode = 0
		} else {
			if videos[i].Episode == 0 {
				localCounters[game]++
				videos[i].Episode = localCounters[game]
			} else {
				if videos[i].Episode > localCounters[game] {
					localCounters[game] = videos[i].Episode
				}
			}
		}

		if videos[i].YouTubeTitle == "" {
			videos[i].YouTubeTitle = a.generateYouTubeTitle(videos[i])
		}
	}

	return videos, nil
}

// GetVideos scans a single directory (backward compat).
func (a *App) GetVideos(dirPath string) ([]VideoFile, error) {
	return a.GetVideosFromFolders([]string{dirPath})
}

// DeleteFiles removes files from disk, config, and unlinks them from yt_videos.
func (a *App) DeleteFiles(paths []string) error {
	var errs []string
	for _, p := range paths {
		info, statErr := os.Stat(p)

		err := os.Remove(p)
		if err != nil {
			if !os.IsNotExist(err) {
				errs = append(errs, fmt.Sprintf("failed to delete %s: %v", filepath.Base(p), err))
			}
		}

		if statErr == nil {
			key := cacheKey(p, info.ModTime())
			thumbPath := filepath.Join(a.cacheDir, "thumbs", key+".png")
			previewPath := filepath.Join(a.cacheDir, "previews", key+".jpg")
			os.Remove(thumbPath)
			os.Remove(previewPath)
		}

		if a.db != nil {
			a.db.mu.Lock()
			a.db.conn.Exec(
				`UPDATE yt_videos SET local_file = NULL WHERE local_file = ?`, p,
			)
			a.db.mu.Unlock()
		}

		delete(a.config.VideoGames, p)
		delete(a.config.VideoMetadata, p)
	}
	a.saveConfig()
	if len(errs) > 0 {
		return fmt.Errorf("some files could not be deleted: %s", strings.Join(errs, ", "))
	}
	return nil
}
