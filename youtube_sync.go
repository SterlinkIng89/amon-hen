package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	youtube "google.golang.org/api/youtube/v3"
)

type YTVideo struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	PublishedAt  string `json:"publishedAt"`
	ThumbnailUrl string `json:"thumbnailUrl"`
	ViewCount    uint64 `json:"viewCount"`
	LikeCount    uint64 `json:"likeCount"`
	Duration     string `json:"duration"`
	Privacy      string `json:"privacy"`
	LocalFile    string `json:"localFile,omitempty"`
}

type YTPlaylist struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	VideoCount   int64  `json:"videoCount"`
	ThumbnailUrl string `json:"thumbnailUrl"`
	PublishedAt  string `json:"publishedAt"`
}

// SyncChannelData downloads all videos and playlists from the channel and saves them to SQLite
func (a *App) SyncChannelData() error {
	if !a.IsYouTubeAuthed() {
		return fmt.Errorf("not authenticated")
	}

	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return err
	}

	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Obteniendo información del canal...")

	// 1. Get user's uploads playlist ID
	channelsCall := svc.Channels.List([]string{"contentDetails"}).Mine(true)
	channelsResp, err := channelsCall.Do()
	if err != nil {
		// Check for insufficient permissions and trigger re-auth
		if isInsufficientPermissions(err) {
			runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Se requiere re-autenticación para ampliar permisos. Abriendo navegador...")
			go func() {
				a.StartYouTubeAuth()
				a.SyncChannelData() // retry after auth
			}()
			return fmt.Errorf("insufficient permissions, re-auth started")
		}
		return err
	}

	if len(channelsResp.Items) == 0 {
		return fmt.Errorf("no channel found")
	}

	uploadsPlaylistID := channelsResp.Items[0].ContentDetails.RelatedPlaylists.Uploads
	now := time.Now().Unix()

	// 2. Fetch all playlists
	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Sincronizando playlists...")
	err = a.syncPlaylists(svc, now)
	if err != nil {
		fmt.Println("Error syncing playlists:", err)
	}

	// 3. Fetch all videos from uploads playlist
	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Sincronizando videos...")
	err = a.syncVideos(svc, uploadsPlaylistID, now)
	if err != nil {
		return err
	}

	runtime.EventsEmit(a.ctx, "youtube:sync-done", true)
	return nil
}

func (a *App) syncPlaylists(svc *youtube.Service, syncTime int64) error {
	var playlistIDs []string
	pageToken := ""
	for {
		call := svc.Playlists.List([]string{"snippet", "contentDetails"}).Mine(true).MaxResults(50)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			return err
		}

		a.db.mu.Lock()
		tx, _ := a.db.conn.Begin()
		for _, item := range resp.Items {
			playlistIDs = append(playlistIDs, item.Id)
			thumb := ""
			if item.Snippet.Thumbnails != nil && item.Snippet.Thumbnails.Medium != nil {
				thumb = item.Snippet.Thumbnails.Medium.Url
			}

			tx.Exec(`INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, synced_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
				title=excluded.title, description=excluded.description, video_count=excluded.video_count,
				thumbnail_url=excluded.thumbnail_url, published_at=excluded.published_at, synced_at=excluded.synced_at`,
				item.Id, item.Snippet.Title, item.Snippet.Description, item.ContentDetails.ItemCount, thumb, item.Snippet.PublishedAt, syncTime)
		}
		tx.Commit()
		a.db.mu.Unlock()

		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	// Sincronizar items de cada playlist después de cerrar la transacción principal
	for _, id := range playlistIDs {
		a.syncPlaylistItems(svc, id, syncTime)
	}
	return nil
}

func (a *App) UpdateYouTubeVideoMetadata(videoID, title, description, privacy string) error {
	if !a.IsYouTubeAuthed() {
		return fmt.Errorf("not authenticated")
	}

	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return err
	}

	// 1. Fetch current video to preserve other snippet fields (like category, tags, etc)
	listCall := svc.Videos.List([]string{"snippet", "status"}).Id(videoID)
	listResp, err := listCall.Do()
	if err != nil {
		return err
	}
	if len(listResp.Items) == 0 {
		return fmt.Errorf("video not found on YouTube")
	}

	video := listResp.Items[0]
	video.Snippet.Title = title
	video.Snippet.Description = description
	video.Status.PrivacyStatus = privacy

	// 2. Perform the update
	updateCall := svc.Videos.Update([]string{"snippet", "status"}, video)
	_, err = updateCall.Do()
	if err != nil {
		return err
	}

	// 3. Update local database
	a.db.mu.Lock()
	defer a.db.mu.Unlock()
	_, err = a.db.conn.Exec(`
		UPDATE yt_videos 
		SET title = ?, description = ?, privacy = ? 
		WHERE id = ?`,
		title, description, privacy, videoID)

	return err
}

func (a *App) syncPlaylistItems(svc *youtube.Service, playlistID string, syncTime int64) error {
	pageToken := ""
	for {
		call := svc.PlaylistItems.List([]string{"snippet", "contentDetails"}).PlaylistId(playlistID).MaxResults(50)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			return err
		}

		for _, item := range resp.Items {
			a.db.conn.Exec(`INSERT INTO yt_playlist_items (playlist_id, video_id, position)
				VALUES (?, ?, ?)
				ON CONFLICT(playlist_id, video_id) DO UPDATE SET position=excluded.position`,
				playlistID, item.ContentDetails.VideoId, item.Snippet.Position)
		}

		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}
	return nil
}

func (a *App) syncVideos(svc *youtube.Service, uploadsPlaylistID string, syncTime int64) error {
	pageToken := ""
	totalProcessed := 0

	for {
		call := svc.PlaylistItems.List([]string{"contentDetails"}).PlaylistId(uploadsPlaylistID).MaxResults(50)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			return err
		}

		var videoIDs []string
		for _, item := range resp.Items {
			videoIDs = append(videoIDs, item.ContentDetails.VideoId)
		}

		if len(videoIDs) > 0 {
			// Fetch full details for these videos
			vidCall := svc.Videos.List([]string{"snippet", "contentDetails", "statistics", "status"}).Id(videoIDs...)
			vidResp, err := vidCall.Do()
			if err != nil {
				return err
			}

			a.db.mu.Lock()
			tx, _ := a.db.conn.Begin()
			for _, vid := range vidResp.Items {
				thumb := ""
				if vid.Snippet.Thumbnails != nil {
					if vid.Snippet.Thumbnails.High != nil {
						thumb = vid.Snippet.Thumbnails.High.Url
					} else if vid.Snippet.Thumbnails.Default != nil {
						thumb = vid.Snippet.Thumbnails.Default.Url
					}
				}

				tx.Exec(`INSERT INTO yt_videos (id, title, description, published_at, thumbnail_url, view_count, like_count, duration, privacy, synced_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(id) DO UPDATE SET
					title=excluded.title, description=excluded.description, published_at=excluded.published_at,
					thumbnail_url=excluded.thumbnail_url, view_count=excluded.view_count, like_count=excluded.like_count,
					duration=excluded.duration, privacy=excluded.privacy, synced_at=excluded.synced_at`,
					vid.Id, vid.Snippet.Title, vid.Snippet.Description, vid.Snippet.PublishedAt, thumb,
					vid.Statistics.ViewCount, vid.Statistics.LikeCount, vid.ContentDetails.Duration, vid.Status.PrivacyStatus, syncTime)
			}
			tx.Commit()
			a.db.mu.Unlock()

			totalProcessed += len(videoIDs)
			runtime.EventsEmit(a.ctx, "youtube:sync-progress", fmt.Sprintf("Sincronizando videos... (%d)", totalProcessed))
		}

		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}
	return nil
}

func isInsufficientPermissions(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "insufficient authentication scopes") ||
		strings.Contains(msg, "caller does not have permission") ||
		strings.Contains(msg, "insufficient permissions") ||
		strings.Contains(msg, "403")
}

// GetChannelVideos returns a paginated list of videos from SQLite
func (a *App) GetChannelVideosPaginated(page, limit int, sortBy, search string) (map[string]interface{}, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	offset := (page - 1) * limit

	orderBy := "published_at DESC"
	if sortBy == "title" {
		orderBy = "title ASC"
	} else if sortBy == "views" {
		orderBy = "view_count DESC"
	}

	where := "1=1"
	args := []interface{}{}
	if search != "" {
		where = "title LIKE ?"
		args = append(args, "%"+search+"%")
	}

	query := fmt.Sprintf(`
		SELECT id, title, description, published_at, thumbnail_url, view_count, like_count, duration, privacy, local_file
		FROM yt_videos
		WHERE %s
		ORDER BY %s
		LIMIT ? OFFSET ?`, where, orderBy)

	args = append(args, limit, offset)

	rows, err := a.db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []YTVideo
	for rows.Next() {
		var v YTVideo
		var localFile sql.NullString
		if err := rows.Scan(&v.ID, &v.Title, &v.Description, &v.PublishedAt, &v.ThumbnailUrl, &v.ViewCount, &v.LikeCount, &v.Duration, &v.Privacy, &localFile); err != nil {
			continue
		}
		if localFile.Valid {
			v.LocalFile = localFile.String
		}
		videos = append(videos, v)
	}

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM yt_videos WHERE %s", where)
	countArgs := []interface{}{}
	if search != "" {
		countArgs = append(countArgs, "%"+search+"%")
	}
	a.db.conn.QueryRow(countQuery, countArgs...).Scan(&total)

	return map[string]interface{}{
		"videos": videos,
		"total":  total,
	}, nil
}

// GetChannelPlaylists returns all playlists from SQLite
func (a *App) GetChannelPlaylists(sortBy string) ([]YTPlaylist, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	orderBy := "published_at DESC"
	if sortBy == "title" {
		orderBy = "title ASC"
	} else if sortBy == "videos" {
		orderBy = "video_count DESC"
	}

	rows, err := a.db.conn.Query(fmt.Sprintf(`
		SELECT id, title, description, video_count, thumbnail_url, published_at
		FROM yt_playlists
		ORDER BY %s`, orderBy))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var playlists []YTPlaylist
	for rows.Next() {
		var p YTPlaylist
		if err := rows.Scan(&p.ID, &p.Title, &p.Description, &p.VideoCount, &p.ThumbnailUrl, &p.PublishedAt); err != nil {
			continue
		}
		playlists = append(playlists, p)
	}
	return playlists, nil
}

// GetPlaylistVideos returns videos belonging to a specific playlist
func (a *App) GetPlaylistVideos(playlistID string) ([]YTVideo, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query(`
		SELECT v.id, v.title, v.description, v.published_at, v.thumbnail_url, 
		       v.view_count, v.like_count, v.duration, v.privacy, v.local_file
		FROM yt_videos v
		JOIN yt_playlist_items pi ON v.id = pi.video_id
		WHERE pi.playlist_id = ?
		ORDER BY pi.position ASC`, playlistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []YTVideo
	for rows.Next() {
		var v YTVideo
		var localFile sql.NullString
		err := rows.Scan(&v.ID, &v.Title, &v.Description, &v.PublishedAt, &v.ThumbnailUrl,
			&v.ViewCount, &v.LikeCount, &v.Duration, &v.Privacy, &localFile)
		if err != nil {
			continue
		}
		if localFile.Valid {
			v.LocalFile = localFile.String
		}
		videos = append(videos, v)
	}
	return videos, nil
}

// LinkLocalToYouTube links a local file to a YouTube ID in both SQLite and config
func (a *App) LinkLocalToYouTube(localPath, ytVideoId string) error {
	a.db.mu.Lock()
	_, err := a.db.conn.Exec("UPDATE yt_videos SET local_file = ? WHERE id = ?", localPath, ytVideoId)
	a.db.mu.Unlock()
	if err != nil {
		return err
	}

	// Update config as well
	if a.config.VideoMetadata == nil {
		a.config.VideoMetadata = make(map[string]VideoMeta)
	}
	meta := a.config.VideoMetadata[localPath]
	meta.YouTubeID = ytVideoId
	a.config.VideoMetadata[localPath] = meta
	return a.saveConfig()
}

// UnlinkLocalVideo removes the link
func (a *App) UnlinkLocalVideo(localPath string) error {
	a.db.mu.Lock()
	_, err := a.db.conn.Exec("UPDATE yt_videos SET local_file = NULL WHERE local_file = ?", localPath)
	a.db.mu.Unlock()
	if err != nil {
		return err
	}

	if meta, ok := a.config.VideoMetadata[localPath]; ok {
		meta.YouTubeID = ""
		a.config.VideoMetadata[localPath] = meta
		return a.saveConfig()
	}
	return nil
}

// GetSyncStatus returns sync timestamp and count
func (a *App) GetSyncStatus() (map[string]interface{}, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	var count int
	var lastSync sql.NullInt64
	a.db.conn.QueryRow("SELECT COUNT(*), MAX(synced_at) FROM yt_videos").Scan(&count, &lastSync)

	var lastSyncVal int64
	if lastSync.Valid {
		lastSyncVal = lastSync.Int64
	}

	return map[string]interface{}{
		"count":    count,
		"lastSync": lastSyncVal,
	}, nil
}
