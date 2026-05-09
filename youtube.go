package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
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
	return a.saveConfig()
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
	authURL := cfg.AuthCodeURL("amon-hen", oauth2.AccessTypeOffline, oauth2.ApprovalForce)

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

// youtubeClient builds an authenticated YouTube API client, refreshing tokens if needed
func (a *App) youtubeClient(ctx context.Context) (*youtube.Service, error) {
	if a.config.YouTubeTokenJSON == "" {
		return nil, fmt.Errorf("not authenticated with YouTube")
	}
	var token oauth2.Token
	if err := json.Unmarshal([]byte(a.config.YouTubeTokenJSON), &token); err != nil {
		return nil, err
	}
	cfg := a.oauthConfig()
	tokenSource := cfg.TokenSource(ctx, &token)

	// Persist refreshed token
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
	return svc, err
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

// UploadToYouTube uploads a single video to YouTube and emits progress events
func (a *App) UploadToYouTube(path, title, description, privacy string) error {
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

	result, err := call.Do()
	if err != nil {
		runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": err.Error()})
		return err
	}

	runtime.EventsEmit(a.ctx, "youtube:done", map[string]string{
		"path": path,
		"url":  "https://youtu.be/" + result.Id,
	})
	return nil
}
