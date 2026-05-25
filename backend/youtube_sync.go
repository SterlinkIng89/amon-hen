package backend

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
	ID            string `json:"id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	PublishedAt   string `json:"publishedAt"`
	ThumbnailUrl  string `json:"thumbnailUrl"`
	ViewCount     uint64 `json:"viewCount"`
	LikeCount     uint64 `json:"likeCount"`
	Duration      string `json:"duration"`
	Privacy       string `json:"privacy"`
	LocalFile     string `json:"localFile,omitempty"`
	PlaylistTitle string `json:"playlistTitle,omitempty"`
}

type YTPlaylist struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	VideoCount   int64  `json:"videoCount"`
	ThumbnailUrl string `json:"thumbnailUrl"`
	PublishedAt  string `json:"publishedAt"`
}

// SyncChannelData downloads all videos and playlists from the channel and saves them to SQLite.
// After upserting every live item it purges rows that no longer exist on YouTube
// (i.e. videos/playlists the user deleted from the YouTube website).
func (a *App) SyncChannelData() error {
	if !a.IsYouTubeAuthed() {
		return fmt.Errorf("not authenticated")
	}

	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return err
	}

	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Fetching channel info...")

	// 1. Get user's uploads playlist ID
	start := time.Now()
	channelsResp, err := svc.Channels.List([]string{"contentDetails"}).Mine(true).Do()
	a.logAPICall("channels.list", "", "mine", QuotaChannelsList, start, err)
	if err != nil {
		if isInsufficientPermissions(err) {
			runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Re-authentication required. Please press Sync again after authorizing.")
			go a.StartYouTubeAuth()
			return fmt.Errorf("insufficient permissions, please re-auth and try again")
		}
		return err
	}

	if len(channelsResp.Items) == 0 {
		return fmt.Errorf("no channel found")
	}

	uploadsPlaylistID := channelsResp.Items[0].ContentDetails.RelatedPlaylists.Uploads
	now := time.Now().Unix()

	// 2. Fetch all playlists
	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Syncing playlists...")
	seenPlaylists, err := a.syncPlaylists(svc, now)
	if err != nil {
		fmt.Println("Error syncing playlists:", err)
	}

	// 3. Fetch all videos from uploads playlist
	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Syncing videos...")
	seenVideos, err := a.syncVideos(svc, uploadsPlaylistID, now)
	if err != nil {
		return err
	}

	// 4. Purge rows that no longer exist on YouTube.
	// This handles videos/playlists the user deleted via the YouTube website.
	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Cleaning up deleted items...")
	if err := a.purgeDeletedVideos(seenVideos); err != nil {
		fmt.Println("Error purging deleted videos:", err)
	}
	if err := a.purgeDeletedPlaylists(seenPlaylists); err != nil {
		fmt.Println("Error purging deleted playlists:", err)
	}

	runtime.EventsEmit(a.ctx, "youtube:sync-done", true)
	return nil
}

// purgeDeletedVideos removes from yt_videos (and yt_playlist_items) any video
// whose ID was not returned by the YouTube API during this sync pass.
// seenIDs is the complete set of video IDs fetched from the uploads playlist.
func (a *App) purgeDeletedVideos(seenIDs map[string]bool) error {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	// Collect all local IDs
	rows, err := a.db.conn.Query("SELECT id FROM yt_videos")
	if err != nil {
		return err
	}
	var toDelete []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil && !seenIDs[id] {
			toDelete = append(toDelete, id)
		}
	}
	rows.Close()

	if len(toDelete) == 0 {
		return nil
	}

	tx, err := a.db.conn.Begin()
	if err != nil {
		return err
	}
	for _, id := range toDelete {
		tx.Exec("DELETE FROM yt_videos WHERE id = ?", id)
		tx.Exec("DELETE FROM yt_playlist_items WHERE video_id = ?", id)
		fmt.Printf("Purged deleted video: %s\n", id)
	}
	return tx.Commit()
}

// purgeDeletedPlaylists removes playlists (and their items) that no longer
// exist on YouTube. seenIDs is the set of playlist IDs fetched this sync.
func (a *App) purgeDeletedPlaylists(seenIDs map[string]bool) error {
	if len(seenIDs) == 0 {
		// If syncPlaylists errored and returned nothing, skip to be safe.
		return nil
	}

	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	rows, err := a.db.conn.Query("SELECT id FROM yt_playlists")
	if err != nil {
		return err
	}
	var toDelete []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil && !seenIDs[id] {
			toDelete = append(toDelete, id)
		}
	}
	rows.Close()

	if len(toDelete) == 0 {
		return nil
	}

	tx, err := a.db.conn.Begin()
	if err != nil {
		return err
	}
	for _, id := range toDelete {
		tx.Exec("DELETE FROM yt_playlists WHERE id = ?", id)
		tx.Exec("DELETE FROM yt_playlist_items WHERE playlist_id = ?", id)
		fmt.Printf("Purged deleted playlist: %s\n", id)
	}
	return tx.Commit()
}

// syncPlaylists fetches all playlists from YouTube and upserts them into SQLite.
// It returns the set of playlist IDs seen so the caller can purge stale rows.
func (a *App) syncPlaylists(svc *youtube.Service, syncTime int64) (map[string]bool, error) {
	type playlistEntry struct {
		id          string
		remoteCount int64
	}
	var toSync []playlistEntry
	seenIDs := make(map[string]bool)

	pageToken := ""
	for {
		call := svc.Playlists.List([]string{"snippet", "contentDetails"}).Mine(true).MaxResults(50)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		start := time.Now()
		resp, err := call.Do()
		a.logAPICall("playlists.list", "", "mine", QuotaPlaylistsList, start, err)
		if err != nil {
			return seenIDs, err
		}

		a.db.mu.Lock()
		tx, _ := a.db.conn.Begin()
		for _, item := range resp.Items {
			seenIDs[item.Id] = true
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

			toSync = append(toSync, playlistEntry{
				id:          item.Id,
				remoteCount: int64(item.ContentDetails.ItemCount),
			})
		}
		tx.Commit()
		a.db.mu.Unlock()

		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	// Sync playlist items only when the video count has changed since last sync.
	for _, entry := range toSync {
		var localCount int64
		a.db.mu.Lock()
		a.db.conn.QueryRow("SELECT COUNT(*) FROM yt_playlist_items WHERE playlist_id = ?", entry.id).Scan(&localCount)
		a.db.mu.Unlock()

		if localCount == entry.remoteCount {
			continue
		}
		a.syncPlaylistItems(svc, entry.id, syncTime)
	}
	return seenIDs, nil
}

// UpdateYouTubeVideoMetadata updates video title/description/privacy on YouTube.
// Reads the current snippet from local SQLite instead of doing an extra videos.list API call.
func (a *App) UpdateYouTubeVideoMetadata(videoID, title, description, privacy string) error {
	if !a.IsYouTubeAuthed() {
		return fmt.Errorf("not authenticated")
	}

	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return err
	}

	// Read current local data to build the full snippet without a network round-trip.
	// CategoryId defaults to 22 (People & Blogs) if unknown — YouTube requires it in updates.
	a.db.mu.Lock()
	var localTitle, localDesc sql.NullString
	a.db.conn.QueryRow("SELECT title, description FROM yt_videos WHERE id = ?", videoID).Scan(&localTitle, &localDesc)
	a.db.mu.Unlock()

	// Merge: use provided values, fall back to what we have locally
	finalTitle := title
	if finalTitle == "" && localTitle.Valid {
		finalTitle = localTitle.String
	}
	finalDesc := description
	if finalDesc == "" && localDesc.Valid {
		finalDesc = localDesc.String
	}

	video := &youtube.Video{
		Id: videoID,
		Snippet: &youtube.VideoSnippet{
			Title:       finalTitle,
			Description: finalDesc,
			CategoryId:  "22", // required field for updates
		},
		Status: &youtube.VideoStatus{
			PrivacyStatus: privacy,
		},
	}

	start := time.Now()
	_, err = svc.Videos.Update([]string{"snippet", "status"}, video).Do()
	a.logAPICall("videos.update", videoID, finalTitle, QuotaVideosUpdate, start, err)
	if err != nil {
		return err
	}

	// Update local database
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
		start := time.Now()
		resp, err := call.Do()
		a.logAPICall("playlistItems.list", playlistID, playlistID, QuotaPlaylistItemsList, start, err)
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

// syncVideos fetches all videos from the uploads playlist and upserts them into SQLite.
// It returns the set of video IDs seen so the caller can purge stale rows.
func (a *App) syncVideos(svc *youtube.Service, uploadsPlaylistID string, syncTime int64) (map[string]bool, error) {
	pageToken := ""
	totalProcessed := 0
	seenIDs := make(map[string]bool)

	for {
		call := svc.PlaylistItems.List([]string{"contentDetails"}).PlaylistId(uploadsPlaylistID).MaxResults(50)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		start := time.Now()
		resp, err := call.Do()
		a.logAPICall("playlistItems.list", uploadsPlaylistID, "uploads", QuotaPlaylistItemsList, start, err)
		if err != nil {
			return seenIDs, err
		}

		var videoIDs []string
		for _, item := range resp.Items {
			id := item.ContentDetails.VideoId
			videoIDs = append(videoIDs, id)
			seenIDs[id] = true
		}

		if len(videoIDs) > 0 {
			// Fetch full details for this batch
			start2 := time.Now()
			vidResp, err := svc.Videos.List([]string{"snippet", "contentDetails", "statistics", "status"}).Id(videoIDs...).Do()
			a.logAPICall("videos.list", strings.Join(videoIDs, ","), fmt.Sprintf("%d videos", len(videoIDs)), QuotaVideosList, start2, err)
			if err != nil {
				return seenIDs, err
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
			runtime.EventsEmit(a.ctx, "youtube:sync-progress", fmt.Sprintf("Syncing videos... (%d)", totalProcessed))
		}

		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}
	return seenIDs, nil
}

// SyncRecentVideos fetches only the most recent videos from the uploads playlist
// (up to maxVideos) and upserts them into SQLite. No purge step is performed.
// This is much cheaper than a full SyncChannelData and is used after an upload
// finishes or when the user wants a quick refresh.
func (a *App) SyncRecentVideos(maxVideos int) error {
	if !a.IsYouTubeAuthed() {
		return fmt.Errorf("not authenticated")
	}
	if maxVideos <= 0 {
		maxVideos = 20
	}

	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return err
	}

	runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Fetching recent videos...")

	// Get uploads playlist ID
	start := time.Now()
	channelsResp, err := svc.Channels.List([]string{"contentDetails"}).Mine(true).Do()
	a.logAPICall("channels.list", "", "mine", QuotaChannelsList, start, err)
	if err != nil {
		if isInsufficientPermissions(err) {
			runtime.EventsEmit(a.ctx, "youtube:sync-progress", "Re-authentication required.")
			go a.StartYouTubeAuth()
			return fmt.Errorf("insufficient permissions, please re-auth and try again")
		}
		return err
	}
	if len(channelsResp.Items) == 0 {
		return fmt.Errorf("no channel found")
	}
	uploadsPlaylistID := channelsResp.Items[0].ContentDetails.RelatedPlaylists.Uploads
	syncTime := time.Now().Unix()

	// Fetch only the first page(s) needed to get maxVideos results
	var videoIDs []string
	pageToken := ""
	for len(videoIDs) < maxVideos {
		pageSize := int64(maxVideos - len(videoIDs))
		if pageSize > 50 {
			pageSize = 50
		}
		call := svc.PlaylistItems.List([]string{"contentDetails"}).
			PlaylistId(uploadsPlaylistID).
			MaxResults(pageSize)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		start2 := time.Now()
		resp, err := call.Do()
		a.logAPICall("playlistItems.list", uploadsPlaylistID, "recent", QuotaPlaylistItemsList, start2, err)
		if err != nil {
			return err
		}
		for _, item := range resp.Items {
			videoIDs = append(videoIDs, item.ContentDetails.VideoId)
		}
		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	if len(videoIDs) == 0 {
		runtime.EventsEmit(a.ctx, "youtube:sync-done", true)
		return nil
	}

	// Fetch full details and upsert
	start3 := time.Now()
	vidResp, err := svc.Videos.List([]string{"snippet", "contentDetails", "statistics", "status"}).Id(videoIDs...).Do()
	a.logAPICall("videos.list", strings.Join(videoIDs, ","), fmt.Sprintf("%d recent videos", len(videoIDs)), QuotaVideosList, start3, err)
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

	runtime.EventsEmit(a.ctx, "youtube:sync-done", true)
	return nil
}

func isInsufficientPermissions(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	// Only return true if it's clearly a permissions/scope issue, NOT a quota issue
	if strings.Contains(msg, "quota") || strings.Contains(msg, "limit") {
		return false
	}
	return strings.Contains(msg, "insufficient authentication scopes") ||
		strings.Contains(msg, "caller does not have permission") ||
		strings.Contains(msg, "insufficient permissions") ||
		strings.Contains(msg, "permissiondenied")
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
		SELECT v.id, v.title, v.description, v.published_at, v.thumbnail_url, v.view_count, v.like_count, v.duration, v.privacy, v.local_file,
		       (SELECT p.title FROM yt_playlists p JOIN yt_playlist_items pi ON p.id = pi.playlist_id WHERE pi.video_id = v.id LIMIT 1) as playlist_title
		FROM yt_videos v
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
		var playlistTitle sql.NullString
		if err := rows.Scan(&v.ID, &v.Title, &v.Description, &v.PublishedAt, &v.ThumbnailUrl, &v.ViewCount, &v.LikeCount, &v.Duration, &v.Privacy, &localFile, &playlistTitle); err != nil {
			fmt.Println("Error scanning video row:", err)
			continue
		}
		if localFile.Valid {
			v.LocalFile = localFile.String
		}
		if playlistTitle.Valid {
			v.PlaylistTitle = playlistTitle.String
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
func (a *App) LinkLocalToYouTube(localPath, ytVideoId, gameTag string, episode int) error {
	a.db.mu.Lock()
	_, err := a.db.conn.Exec("UPDATE yt_videos SET local_file = ?, game_tag = ?, episode = ? WHERE id = ?", localPath, gameTag, episode, ytVideoId)
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
