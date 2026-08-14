package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
	youtube "google.golang.org/api/youtube/v3"
)

var youtubeScopes = []string{
	"https://www.googleapis.com/auth/youtube.upload",
	"https://www.googleapis.com/auth/youtube",
}

func (a *App) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     a.config.YouTubeClientID,
		ClientSecret: a.config.YouTubeClientSecret,
		RedirectURL:  "http://127.0.0.1:8085/callback",
		Scopes:       youtubeScopes,
		Endpoint:     google.Endpoint,
	}
}

// SaveYouTubeCredentials stores the Google OAuth client credentials
func (a *App) SaveYouTubeCredentials(clientID, clientSecret string) error {
	a.config.YouTubeClientID = clientID
	a.config.YouTubeClientSecret = clientSecret
	// Invalidate cached service since credentials changed
	a.ytSvcMu.Lock()
	a.ytSvc = nil
	a.ytSvcMu.Unlock()
	return a.saveConfig()
}

// ImportYouTubeJSON opens a file dialog to select the Google OAuth JSON and parses it
func (a *App) ImportYouTubeJSON() error {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select YouTube OAuth JSON",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	})
	if err != nil || path == "" {
		return err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var secret struct {
		Installed struct {
			ClientID     string `json:"client_id"`
			ClientSecret string `json:"client_secret"`
		} `json:"installed"`
		Web struct {
			ClientID     string `json:"client_id"`
			ClientSecret string `json:"client_secret"`
		} `json:"web"`
	}

	if err := json.Unmarshal(data, &secret); err != nil {
		return fmt.Errorf("invalid JSON format: %w", err)
	}

	id := secret.Installed.ClientID
	key := secret.Installed.ClientSecret
	if id == "" {
		id = secret.Web.ClientID
		key = secret.Web.ClientSecret
	}

	if id == "" || key == "" {
		appLog("[YouTube Auth] Failed to import JSON: missing client_id or client_secret")
		return fmt.Errorf("could not find client_id or client_secret in JSON")
	}

	appLog("[YouTube Auth] Credentials imported successfully from JSON")
	return a.SaveYouTubeCredentials(id, key)
}

// IsYouTubeAuthed returns true if a valid refresh token is stored
func (a *App) IsYouTubeAuthed() bool {
	if a.config.YouTubeTokenJSON == "" {
		return false
	}
	var token oauth2.Token
	if err := json.Unmarshal([]byte(a.config.YouTubeTokenJSON), &token); err != nil {
		return false
	}
	return token.RefreshToken != ""
}

// StartYouTubeAuth opens the browser for OAuth and waits for the callback
func (a *App) StartYouTubeAuth() error {
	if a.config.YouTubeClientID == "" || a.config.YouTubeClientSecret == "" {
		return fmt.Errorf("YouTube credentials not configured")
	}

	cfg := a.oauthConfig()
	authURL := cfg.AuthCodeURL("amon-hen", oauth2.AccessTypeOffline, oauth2.ApprovalForce, oauth2.SetAuthURLParam("prompt", "select_account"))

	// Open browser to Google consent page
	appLog("[YouTube Auth] Starting OAuth flow in browser")
	runtime.BrowserOpenURL(a.ctx, authURL)

	// Start local callback server
	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)

	listener, err := net.Listen("tcp", "127.0.0.1:8085")
	if err != nil {
		appLog("[YouTube Auth] Failed to start local callback server: %v", err)
		return fmt.Errorf("failed to start callback server: %w", err)
	}

	mux := http.NewServeMux()
	server := &http.Server{Handler: mux}

	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		if code == "" {
			errCh <- fmt.Errorf("no authorization code received")
			w.Write([]byte("<html><body><h2>Authorization failed. You can close this tab.</h2></body></html>"))
			return
		}
		w.Write([]byte("<html><body><h2>Authorization successful! You can close this tab and return to Amon Hen.</h2></body></html>"))
		codeCh <- code
	})

	go server.Serve(listener)

	// Wait up to 5 minutes for the user to authorize
	select {
	case code := <-codeCh:
		server.Close()
		token, err := cfg.Exchange(context.Background(), code)
		if err != nil {
			return fmt.Errorf("token exchange failed: %w", err)
		}
		tokenJSON, err := json.Marshal(token)
		if err != nil {
			return err
		}
		a.config.YouTubeTokenJSON = string(tokenJSON)
		if err := a.saveConfig(); err != nil {
			return err
		}
		// Invalidate cached service so next call uses new token
		a.ytSvcMu.Lock()
		a.ytSvc = nil
		a.ytSvcMu.Unlock()
		runtime.EventsEmit(a.ctx, "youtube:auth-complete", nil)
		appLog("[YouTube Auth] Authorization successful, token saved")
		return nil

	case err := <-errCh:
		server.Close()
		appLog("[YouTube Auth] Authorization failed: %v", err)
		return err

	case <-time.After(5 * time.Minute):
		server.Close()
		appLog("[YouTube Auth] Authorization timed out (5 minutes)")
		return fmt.Errorf("authorization timed out")
	}
}

// youtubeClient returns a cached authenticated YouTube API client.
// It only creates a new service or refreshes the token when strictly needed,
// avoiding a token endpoint round-trip on every single API operation.
func (a *App) youtubeClient(ctx context.Context) (*youtube.Service, error) {
	if a.config.YouTubeTokenJSON == "" {
		return nil, fmt.Errorf("not authenticated with YouTube")
	}

	a.ytSvcMu.Lock()
	defer a.ytSvcMu.Unlock()

	// Return the cached service if we already have one
	if a.ytSvc != nil {
		return a.ytSvc, nil
	}

	var token oauth2.Token
	if err := json.Unmarshal([]byte(a.config.YouTubeTokenJSON), &token); err != nil {
		return nil, err
	}
	cfg := a.oauthConfig()
	tokenSource := cfg.TokenSource(ctx, &token)

	// Refresh the token once and persist if it changed
	newToken, err := tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
	}
	if newToken.AccessToken != token.AccessToken {
		tokenJSON, _ := json.Marshal(newToken)
		a.config.YouTubeTokenJSON = string(tokenJSON)
		a.saveConfig()
	}

	svc, err := youtube.NewService(ctx, option.WithTokenSource(tokenSource))
	if err != nil {
		return nil, err
	}
	a.ytSvc = svc
	return svc, nil
}

// progressReader wraps an io.Reader and emits upload progress events
type progressReader struct {
	r          io.Reader
	total      int64
	read       int64
	lastPct    int
	lastUpdate time.Time
	lastRead   int64
	onProg     func(int, float64) // percent, speed in bytes/sec
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.r.Read(p)
	pr.read += int64(n)
	if pr.total > 0 {
		pct := int(float64(pr.read) / float64(pr.total) * 100)
		now := time.Now()
		elapsed := now.Sub(pr.lastUpdate)
		
		if pct != pr.lastPct || elapsed >= time.Second {
			speed := 0.0
			if elapsed.Seconds() > 0 {
				speed = float64(pr.read-pr.lastRead) / elapsed.Seconds()
			}
			pr.lastPct = pct
			pr.lastUpdate = now
			pr.lastRead = pr.read
			pr.onProg(pct, speed)
		}
	}
	return n, err
}

// YouTubeChannel represents basic info about a YT channel
type YouTubeChannel struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Thumbnail string `json:"thumbnail"`
}

// channelInfoCache caches the channel info in memory for the session
var (
	channelInfoCache   *YouTubeChannel
	channelInfoCacheMu sync.Mutex
)

// GetYouTubeChannelInfo fetches the current authenticated user's channel info.
// Result is cached in memory for the session to avoid repeated API calls.
func (a *App) GetYouTubeChannelInfo() (*YouTubeChannel, error) {
	channelInfoCacheMu.Lock()
	if channelInfoCache != nil {
		defer channelInfoCacheMu.Unlock()
		return channelInfoCache, nil
	}
	channelInfoCacheMu.Unlock()

	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return nil, err
	}

	call := svc.Channels.List([]string{"snippet"}).Mine(true)
	start := time.Now()
	resp, err := call.Do()
	a.logAPICall("channels.list", "", "mine", QuotaChannelsList, start, err)
	if err != nil {
		return nil, err
	}

	if len(resp.Items) == 0 {
		return nil, fmt.Errorf("no channel found")
	}

	channel := resp.Items[0]
	result := &YouTubeChannel{
		ID:        channel.Id,
		Title:     channel.Snippet.Title,
		Thumbnail: channel.Snippet.Thumbnails.Default.Url,
	}

	channelInfoCacheMu.Lock()
	channelInfoCache = result
	channelInfoCacheMu.Unlock()

	return result, nil
}

// CreatePlaylist creates a new YouTube playlist and saves it to the local DB.
func (a *App) CreatePlaylist(title, description, privacy string) (string, error) {
	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return "", err
	}

	playlist := &youtube.Playlist{
		Snippet: &youtube.PlaylistSnippet{
			Title:       title,
			Description: description,
		},
		Status: &youtube.PlaylistStatus{
			PrivacyStatus: privacy,
		},
	}

	start := time.Now()
	res, err := svc.Playlists.Insert([]string{"snippet", "status"}, playlist).Do()
	a.logAPICall("playlists.insert", "", title, QuotaPlaylistsInsert, start, err)
	if err != nil {
		fmt.Printf("Error creating playlist: %v\n", err)
		return "", err
	}

	// Persist immediately so the playlist is available without a full sync
	if a.db != nil {
		a.db.mu.Lock()
		a.db.conn.Exec(`
			INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, synced_at)
			VALUES (?, ?, ?, 0, '', ?, ?)
			ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description`,
			res.Id, title, description, res.Snippet.PublishedAt, time.Now().Unix())
		a.db.mu.Unlock()
	}

	return res.Id, nil
}

// GetOrCreatePlaylist returns the YouTube playlist ID for the given title.
// It checks the local DB first, then the YouTube API, and only creates a new
// playlist if none with that title is found — preventing accidental duplicates.
func (a *App) GetOrCreatePlaylist(title, description, privacy string) (string, error) {
	if title == "" {
		return "", fmt.Errorf("playlist title cannot be empty")
	}

	// 1. Check local DB for an existing playlist with this exact title
	if a.db != nil {
		a.db.mu.Lock()
		var existingID string
		err := a.db.conn.QueryRow(
			"SELECT id FROM yt_playlists WHERE LOWER(title) = LOWER(?) LIMIT 1", title,
		).Scan(&existingID)
		a.db.mu.Unlock()
		if err == nil && existingID != "" {
			fmt.Printf("GetOrCreatePlaylist: reusing existing local playlist %q (%s)\n", title, existingID)
			return existingID, nil
		}
	}

	// 2. Search YouTube API for a matching playlist title
	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return "", err
	}

	pageToken := ""
	for {
		call := svc.Playlists.List([]string{"snippet"}).Mine(true).MaxResults(50)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		start := time.Now()
		resp, err := call.Do()
		a.logAPICall("playlists.list", "", "mine (dedup search)", QuotaPlaylistsList, start, err)
		if err != nil {
			break // fall through to create
		}
		for _, item := range resp.Items {
			if strings.EqualFold(item.Snippet.Title, title) {
				fmt.Printf("GetOrCreatePlaylist: found existing YouTube playlist %q (%s)\n", title, item.Id)
				// Save to local DB so future calls hit the cache
				if a.db != nil {
					a.db.mu.Lock()
					thumb := ""
					if item.Snippet.Thumbnails != nil && item.Snippet.Thumbnails.Medium != nil {
						thumb = item.Snippet.Thumbnails.Medium.Url
					}
					a.db.conn.Exec(`
						INSERT INTO yt_playlists (id, title, description, video_count, thumbnail_url, published_at, synced_at)
						VALUES (?, ?, ?, 0, ?, ?, ?)
						ON CONFLICT(id) DO UPDATE SET title=excluded.title`,
						item.Id, item.Snippet.Title, item.Snippet.Description, thumb, item.Snippet.PublishedAt, time.Now().Unix())
					a.db.mu.Unlock()
				}
				return item.Id, nil
			}
		}
		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	// 3. No existing playlist found — create a new one
	fmt.Printf("GetOrCreatePlaylist: creating new playlist %q\n", title)
	return a.CreatePlaylist(title, description, privacy)
}

// AddVideoToPlaylist adds an existing video to a YouTube playlist
func (a *App) AddVideoToPlaylist(playlistID, videoID string) error {
	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return err
	}

	item := &youtube.PlaylistItem{
		Snippet: &youtube.PlaylistItemSnippet{
			PlaylistId: playlistID,
			ResourceId: &youtube.ResourceId{
				Kind:    "youtube#video",
				VideoId: videoID,
			},
		},
	}

	start := time.Now()
	_, err = svc.PlaylistItems.Insert([]string{"snippet"}, item).Do()
	a.logAPICall("playlistItems.insert", videoID, videoID, QuotaPlaylistItemsInsert, start, err)
	if err != nil {
		fmt.Printf("Error adding video %s to playlist %s: %v\n", videoID, playlistID, err)
		return err
	}
	return nil
}

// DeletePlaylist deletes a playlist from YouTube and removes it from the local DB.
// The local rows are only removed after the API call succeeds.
func (a *App) DeletePlaylist(playlistID string) error {
	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return err
	}

	start := time.Now()
	err = svc.Playlists.Delete(playlistID).Do()
	a.logAPICall("playlists.delete", playlistID, playlistID, 50, start, err)
	if err != nil {
		return fmt.Errorf("failed to delete playlist on YouTube: %w", err)
	}

	// Remove from local DB only after YouTube confirms deletion
	if a.db != nil {
		a.db.mu.Lock()
		tx, txErr := a.db.conn.Begin()
		if txErr == nil {
			tx.Exec("DELETE FROM yt_playlist_items WHERE playlist_id = ?", playlistID)
			tx.Exec("DELETE FROM yt_playlists WHERE id = ?", playlistID)
			tx.Commit()
		}
		a.db.mu.Unlock()
	}

	return nil
}

// CancelUpload cancels an ongoing video upload by its path
func (a *App) CancelUpload(path string) error {
	a.uploadsMu.Lock()
	defer a.uploadsMu.Unlock()
	if cancel, ok := a.uploads[path]; ok {
		appLog("[Queue] Cancelling active upload for: %s", filepath.Base(path))
		cancel()
		delete(a.uploads, path)
		return nil
	}
	return fmt.Errorf("no active upload found for path: %s", path)
}

// UploadToYouTube uploads a single video to YouTube and emits progress events
func (a *App) UploadToYouTube(path, title, description, privacy, playlistID, gameTag string, episode int) error {
	ctx, cancel := context.WithCancel(context.Background())
	a.uploadsMu.Lock()
	a.uploads[path] = cancel
	a.uploadsMu.Unlock()

	defer func() {
		a.uploadsMu.Lock()
		delete(a.uploads, path)
		a.uploadsMu.Unlock()
		cancel()
	}()

	svc, err := a.youtubeClient(ctx)
	if err != nil {
		runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": err.Error()})
		return err
	}

	f, err := os.Open(path)
	if err != nil {
		appLog("[Queue] Failed to open local file %s: %v", filepath.Base(path), err)
		runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": err.Error()})
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		appLog("[Queue] Failed to stat local file %s: %v", filepath.Base(path), err)
		return err
	}

	appLog("[Queue] Started uploading '%s' (Size: %d bytes)", title, info.Size())

	pr := &progressReader{
		r:          f,
		total:      info.Size(),
		lastUpdate: time.Now(),
		onProg: func(pct int, speed float64) {
			runtime.EventsEmit(a.ctx, "youtube:progress", map[string]interface{}{
				"path":    path,
				"percent": pct,
				"speed":   speed,
			})
		},
	}

	video := &youtube.Video{
		Snippet: &youtube.VideoSnippet{
			Title:       title,
			Description: description,
		},
		Status: &youtube.VideoStatus{
			PrivacyStatus: privacy,
		},
	}

	call := svc.Videos.Insert([]string{"snippet", "status"}, video).Context(ctx)
	call.Media(pr, googleapi.ContentType("video/*"))

	start := time.Now()
	result, err := call.Do()
	a.logAPICall("videos.insert", "", title, QuotaVideosInsert, start, err)
	if err != nil {
		if ctx.Err() == context.Canceled {
			appLog("[Queue] Upload cancelled by user: '%s'", title)
			runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": "Upload cancelled"})
			return fmt.Errorf("upload cancelled")
		}
		
		errMsg := err.Error()
		if strings.Contains(errMsg, "quotaExceeded") || strings.Contains(errMsg, "RATE_LIMIT_EXCEEDED") {
			appLog("[Queue] FATAL: YouTube Quota Exceeded while uploading '%s'. Wait 24h.", title)
			errMsg = "Daily YouTube upload limit reached (~6 videos/day). Please wait 24h or request a quota increase in Google Cloud Console."
		} else {
			appLog("[Queue] Upload failed for '%s': %v", title, err)
		}
		
		runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": errMsg})
		return err
	}

	elapsed := time.Since(start)
	appLog("[Queue] Successfully uploaded '%s' (ID: %s, Time taken: %s)", title, result.Id, elapsed.Round(time.Second).String())

	// Save YouTube ID locally
	a.LinkLocalToYouTube(path, result.Id, gameTag, episode)

	// Persist game_tag + episode into yt_videos so future episode-count queries
	// (which match by title LIKE '<tag> - %') have a fallback via explicit columns too.
	// This row may not exist yet if the sync hasn't run \u2014 insert or update.
	if a.db != nil && gameTag != "" {
		a.db.mu.Lock()
		a.db.conn.Exec(`
			INSERT INTO yt_videos (id, title, game_tag, episode, local_file, synced_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				game_tag = excluded.game_tag,
				episode  = excluded.episode,
				local_file = excluded.local_file`,
			result.Id, title, gameTag, episode, path, time.Now().Unix(),
		)
		a.db.mu.Unlock()
	}

	// Add to playlist if specified
	if playlistID != "" {
		if plErr := a.AddVideoToPlaylist(playlistID, result.Id); plErr != nil {
			appLog("[Queue] Warning: Failed to add video '%s' to playlist %s: %v", result.Id, playlistID, plErr)
			// Emit a warning but do not fail the whole upload
			runtime.EventsEmit(a.ctx, "youtube:playlist-error", map[string]string{
				"videoId":    result.Id,
				"playlistId": playlistID,
				"message":    plErr.Error(),
			})
		} else if a.db != nil {
			// Persist the membership immediately so the Channel view is correct
			// without needing a full sync
			a.db.mu.Lock()
			a.db.conn.Exec(`
				INSERT INTO yt_playlist_items (playlist_id, video_id, position)
				VALUES (?, ?, (SELECT COALESCE(MAX(position)+1, 0) FROM yt_playlist_items WHERE playlist_id=?))
				ON CONFLICT(playlist_id, video_id) DO NOTHING`,
				playlistID, result.Id, playlistID)
			a.db.conn.Exec(
				`UPDATE yt_playlists SET video_count = video_count + 1 WHERE id = ?`,
				playlistID)
			a.db.mu.Unlock()
		}
	}

	runtime.EventsEmit(a.ctx, "youtube:done", map[string]string{
		"path": path,
		"url":  "https://youtu.be/" + result.Id,
	})
	return nil
}

// PurgePlaylistDuplicates fetches every playlistItem from YouTube for the given
// playlist, finds video IDs that appear more than once, and deletes every
// duplicate entry (keeping only the first occurrence by position).
// Returns the number of duplicate entries removed.
func (a *App) PurgePlaylistDuplicates(playlistID string) (int, error) {
	ctx := context.Background()
	svc, err := a.youtubeClient(ctx)
	if err != nil {
		return 0, err
	}

	// --- 1. Fetch all playlist items from YouTube API ---
	type item struct {
		itemID  string // playlistItem ID (used to delete)
		videoID string
	}
	var items []item

	pageToken := ""
	for {
		call := svc.PlaylistItems.List([]string{"snippet"}).
			PlaylistId(playlistID).
			MaxResults(50)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		start := time.Now()
		resp, err := call.Do()
		a.logAPICall("playlistItems.list", playlistID, playlistID, QuotaPlaylistItemsList, start, err)
		if err != nil {
			return 0, fmt.Errorf("failed to list playlist items: %w", err)
		}
		for _, it := range resp.Items {
			items = append(items, item{
				itemID:  it.Id,
				videoID: it.Snippet.ResourceId.VideoId,
			})
		}
		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	// --- 2. Find duplicates: keep first occurrence, queue the rest for deletion ---
	seen := make(map[string]bool)
	var toDelete []string
	for _, it := range items {
		if seen[it.videoID] {
			toDelete = append(toDelete, it.itemID)
		} else {
			seen[it.videoID] = true
		}
	}

	if len(toDelete) == 0 {
		return 0, nil
	}

	// --- 3. Delete each duplicate playlistItem via the API ---
	// playlistItems.delete costs 50 quota units each — warn in logs.
	for _, itemID := range toDelete {
		start := time.Now()
		delErr := svc.PlaylistItems.Delete(itemID).Do()
		a.logAPICall("playlistItems.delete", itemID, itemID, 50, start, delErr)
		if delErr != nil {
			appLog("[PurgePlaylistDuplicates] Failed to delete playlistItem %s: %v", itemID, delErr)
			// Continue trying the others even if one fails.
		}
	}

	// --- 4. Update local DB: remove duplicate video_id rows so counts stay correct ---
	if a.db != nil {
		a.db.mu.Lock()
		// Re-build yt_playlist_items from the de-duped seen set.
		// Simplest approach: delete all rows for this playlist and re-insert
		// the survivors (one row per unique video_id).
		tx, txErr := a.db.conn.Begin()
		if txErr == nil {
			tx.Exec("DELETE FROM yt_playlist_items WHERE playlist_id = ?", playlistID)
			pos := 0
			for videoID := range seen {
				tx.Exec(
					"INSERT INTO yt_playlist_items (playlist_id, video_id, position) VALUES (?, ?, ?)",
					playlistID, videoID, pos,
				)
				pos++
			}
			// Update video_count to reflect the actual de-duped size.
			tx.Exec(
				"UPDATE yt_playlists SET video_count = ? WHERE id = ?",
				len(seen), playlistID,
			)
			tx.Commit()
		}
		a.db.mu.Unlock()
	}

	return len(toDelete), nil
}
