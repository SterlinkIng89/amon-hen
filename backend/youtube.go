package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
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
		return fmt.Errorf("could not find client_id or client_secret in JSON")
	}

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
	runtime.BrowserOpenURL(a.ctx, authURL)

	// Start local callback server
	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)

	listener, err := net.Listen("tcp", "127.0.0.1:8085")
	if err != nil {
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
		return nil

	case err := <-errCh:
		server.Close()
		return err

	case <-time.After(5 * time.Minute):
		server.Close()
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
	r       io.Reader
	total   int64
	read    int64
	lastPct int
	onProg  func(int)
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.r.Read(p)
	pr.read += int64(n)
	if pr.total > 0 {
		pct := int(float64(pr.read) / float64(pr.total) * 100)
		if pct != pr.lastPct {
			pr.lastPct = pct
			pr.onProg(pct)
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

// CreatePlaylist creates a new YouTube playlist
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

	return res.Id, nil
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

// UploadToYouTube uploads a single video to YouTube and emits progress events
func (a *App) UploadToYouTube(path, title, description, privacy, playlistID, gameTag string, episode int) error {
	ctx := context.Background()

	svc, err := a.youtubeClient(ctx)
	if err != nil {
		runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": err.Error()})
		return err
	}

	f, err := os.Open(path)
	if err != nil {
		runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": err.Error()})
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return err
	}

	pr := &progressReader{
		r:     f,
		total: info.Size(),
		onProg: func(pct int) {
			runtime.EventsEmit(a.ctx, "youtube:progress", map[string]interface{}{
				"path":    path,
				"percent": pct,
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

	call := svc.Videos.Insert([]string{"snippet", "status"}, video)
	call.Media(pr, googleapi.ContentType("video/*"))

	start := time.Now()
	result, err := call.Do()
	a.logAPICall("videos.insert", "", title, QuotaVideosInsert, start, err)
	if err != nil {
		runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": err.Error()})
		return err
	}

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
			// Emit a warning but do not fail the whole upload
			runtime.EventsEmit(a.ctx, "youtube:playlist-error", map[string]string{
				"videoId":    result.Id,
				"playlistId": playlistID,
				"message":    plErr.Error(),
			})
		}
	}

	runtime.EventsEmit(a.ctx, "youtube:done", map[string]string{
		"path": path,
		"url":  "https://youtu.be/" + result.Id,
	})
	return nil
}
