package backend

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type VideoFile struct {
	Name          string `json:"name"`
	Path          string `json:"path"`
	Size          int64  `json:"size"`
	ModTime       int64  `json:"modTime"` // Unix timestamp in milliseconds
	Folder        string `json:"folder"`  // Source folder path
	Game          string `json:"game"`    // Game tag from config
	YouTubeTitle  string `json:"youtubeTitle"`
	Description   string `json:"description"`
	Privacy       string `json:"privacy"`
	YouTubeID     string `json:"youtubeId,omitempty"`
	PlaylistID    string `json:"playlistId,omitempty"`
	PlaylistTitle string `json:"playlistTitle,omitempty"`
	Episode       int    `json:"episode"`
}

// generateYouTubeTitle replicates the frontend logic to create a suggested title
func generateYouTubeTitle(filename string, game string, episode int) string {
	// Pattern: YYYY-MM-DD
	re := regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})`)
	stem := strings.TrimSuffix(filename, filepath.Ext(filename))
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

	epSuffix := ""
	if episode > 0 {
		epSuffix = fmt.Sprintf(" - %d", episode)
	}

	return fmt.Sprintf("%s - %s%s", game, dateStr, epSuffix)
}

// episodeCountForTag counts YouTube videos whose title starts with "<tag> - ".
// This works for 1000+ pre-existing videos that have no game_tag in the DB,
// because the title format is always "<tag> - <date>".
// It also takes into account any explicitly-set episodes via game_tag+episode columns.
func (a *App) episodeCountForTag(tag string) int {
	if tag == "" {
		return 0
	}

	// Pattern: title starts exactly with "<tag> - "
	titlePattern := tag + " - %"

	var titleCount, maxEpisode int
	// Count by title match (covers pre-existing 1000+ videos)
	a.db.conn.QueryRow(
		`SELECT COUNT(*) FROM yt_videos WHERE title LIKE ?`, titlePattern,
	).Scan(&titleCount)

	// Also check explicit episode numbers stored via this app's upload workflow
	a.db.conn.QueryRow(
		`SELECT COALESCE(MAX(episode), 0) FROM yt_videos WHERE game_tag = ? AND episode IS NOT NULL AND episode > 0`, tag,
	).Scan(&maxEpisode)

	// Return whichever is larger — title count covers all historical uploads,
	// max episode covers cases where episodes were manually set.
	if maxEpisode > titleCount {
		return maxEpisode
	}
	return titleCount
}

// GetVideosFromFolders scans multiple directories and returns a merged result
func (a *App) GetVideosFromFolders(folders []string) ([]VideoFile, error) {
	supported := map[string]bool{
		".mp4":  true,
		".mkv":  true,
		".webm": true,
		".mov":  true,
		".avi":  true,
	}
	var videos []VideoFile

	// Pre-load playlist info and linked files from DB
	a.db.mu.Lock()
	pMap := make(map[string]string)        // yt_id -> playlist_id
	pTitleMap := make(map[string]string)   // yt_id -> playlist_title
	linkedFiles := make(map[string]string) // filename -> yt_id (fallback matching)
	pathMap := make(map[string]string)     // full_path -> yt_id

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

	// Fetch linked video paths for matching
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

	// First pass: scan all files and load metadata
	configChanged := false
	for _, dir := range folders {
		fSettings := a.GetFolderSettings(dir)

		filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				// If not recursive, skip subdirectories except the base dir itself
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

			meta := a.config.VideoMetadata[path]

			// Filter by max duration if set
			if fSettings.MaxDurationSecs > 0 {
				if meta.DurationSecs == 0 {
					// Fetch and cache duration
					dur, err := a.GetVideoDuration(path)
					if err == nil && dur > 0 {
						meta.DurationSecs = int(dur)
						if a.config.VideoMetadata == nil {
							a.config.VideoMetadata = make(map[string]VideoMeta)
						}
						a.config.VideoMetadata[path] = meta
						configChanged = true
					} else {
						meta.DurationSecs = 999999
						a.config.VideoMetadata[path] = meta
						configChanged = true
					}
				}
				if meta.DurationSecs > fSettings.MaxDurationSecs {
					return nil // skip this file
				}
			}

			videos = append(videos, VideoFile{
				Name:          d.Name(),
				Path:          path,
				Size:          info.Size(),
				ModTime:       info.ModTime().UnixMilli(),
				Folder:        dir,
				Game:          meta.Game,
				YouTubeTitle:  meta.YouTubeTitle,
				Description:   meta.Description,
				Privacy:       meta.Privacy,
				YouTubeID:     meta.YouTubeID,
				PlaylistID:    meta.PlaylistID,
				PlaylistTitle: pTitleMap[meta.YouTubeID],
				Episode:       meta.Episode,
			})

			vIdx := len(videos) - 1
			// Fallback 1: Match by full path in DB
			if videos[vIdx].YouTubeID == "" {
				if id, ok := pathMap[path]; ok {
					videos[vIdx].YouTubeID = id
				}
			}
			// Fallback 2: Match by filename in DB (useful if file was moved)
			if videos[vIdx].YouTubeID == "" {
				if id, ok := linkedFiles[d.Name()]; ok {
					videos[vIdx].YouTubeID = id
				}
			}

			// Fallback playlist ID if missing in config but found in DB
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

	// Second pass: Sort by ModTime (ascending) and assign episode numbers
	sort.Slice(videos, func(i, j int) bool {
		return videos[i].ModTime < videos[j].ModTime
	})

	localCounters := make(map[string]int)

	for i := range videos {
		game := videos[i].Game
		if game == "" {
			continue
		}

		if _, seen := localCounters[game]; !seen {
			a.db.mu.Lock()
			localCounters[game] = a.episodeCountForTag(game)
			a.db.mu.Unlock()
		}

		if videos[i].Episode == 0 {
			localCounters[game]++
			videos[i].Episode = localCounters[game]
		} else {
			if videos[i].Episode > localCounters[game] {
				localCounters[game] = videos[i].Episode
			}
		}

		if videos[i].YouTubeTitle == "" {
			videos[i].YouTubeTitle = generateYouTubeTitle(videos[i].Name, videos[i].Game, videos[i].Episode)
		}
	}

	return videos, nil
}

// GetVideos scans a single directory (backward compat)
func (a *App) GetVideos(dirPath string) ([]VideoFile, error) {
	return a.GetVideosFromFolders([]string{dirPath})
}

// DeleteFiles removes the given file paths from disk, config, and unlinks them
// from the yt_videos table (clears local_file without deleting the YouTube video).
func (a *App) DeleteFiles(paths []string) error {
	var errs []string
	for _, p := range paths {
		// Get info before deleting to calculate cache keys
		info, statErr := os.Stat(p)

		err := os.Remove(p)
		if err != nil {
			if !os.IsNotExist(err) {
				errs = append(errs, fmt.Sprintf("failed to delete %s: %v", filepath.Base(p), err))
			}
		}

		// Clean up cache if stat was successful
		if statErr == nil {
			key := cacheKey(p, info.ModTime())
			thumbPath := filepath.Join(a.cacheDir, "thumbs", key+".png")
			previewPath := filepath.Join(a.cacheDir, "previews", key+".jpg")
			os.Remove(thumbPath)
			os.Remove(previewPath)
		}

		// Unlink from yt_videos — clears local_file so the YouTube video
		// stays in the channel but is no longer linked to a local file.
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
