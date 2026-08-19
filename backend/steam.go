package backend

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SaveSteamAPIKey saves the user's Steam Web API Key
func (a *App) SaveSteamAPIKey(key string) error {
	a.configMu.Lock()
	a.config.SteamAPIKey = strings.TrimSpace(key)
	a.configMu.Unlock()
	return a.saveConfig()
}

// GetSteamAPIKey returns the current API key
func (a *App) GetSteamAPIKey() string {
	a.configMu.RLock()
	defer a.configMu.RUnlock()
	return a.config.SteamAPIKey
}

// GetSteamID returns the current Steam ID
func (a *App) GetSteamID() string {
	a.configMu.RLock()
	defer a.configMu.RUnlock()
	return a.config.SteamID
}

// DisconnectSteam clears Steam credentials
func (a *App) DisconnectSteam() error {
	a.configMu.Lock()
	a.config.SteamAPIKey = ""
	a.config.SteamID = ""
	a.configMu.Unlock()
	err := a.saveConfig()
	runtime.EventsEmit(a.ctx, "steam:auth-disconnected")
	return err
}

// LoginSteam starts the OpenID flow and blocks until completion or error
func (a *App) LoginSteam() (string, error) {
	callbackPath := "/callback"
	port := "8086"
	callbackURL := fmt.Sprintf("http://127.0.0.1:%s%s", port, callbackPath)

	params := url.Values{}
	params.Set("openid.ns", "http://specs.openid.net/auth/2.0")
	params.Set("openid.mode", "checkid_setup")
	params.Set("openid.return_to", callbackURL)
	params.Set("openid.realm", fmt.Sprintf("http://127.0.0.1:%s", port))
	params.Set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select")
	params.Set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select")

	loginURL := "https://steamcommunity.com/openid/login?" + params.Encode()

	// Create local server
	m := http.NewServeMux()
	server := &http.Server{Addr: ":" + port, Handler: m}

	resultCh := make(chan string)
	errCh := make(chan error)

	m.HandleFunc(callbackPath, func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		claimedID := query.Get("openid.claimed_id")

		if claimedID == "" {
			fmt.Fprintln(w, "Error: Steam login failed. Missing claimed_id.")
			errCh <- fmt.Errorf("missing claimed_id")
			return
		}

		// Verify authentication
		verifyParams := url.Values{}
		for k, v := range query {
			verifyParams.Set(k, v[0])
		}
		verifyParams.Set("openid.mode", "check_authentication")

		resp, err := http.PostForm("https://steamcommunity.com/openid/login", verifyParams)
		if err != nil {
			fmt.Fprintln(w, "Error: Failed to verify authentication.")
			errCh <- fmt.Errorf("verify failed: %v", err)
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(body), "is_valid:true") {
			fmt.Fprintln(w, "Error: Invalid authentication.")
			errCh <- fmt.Errorf("invalid authentication")
			return
		}

		// Extract 64-bit Steam ID
		re := regexp.MustCompile(`^https://steamcommunity.com/openid/id/(\d+)$`)
		matches := re.FindStringSubmatch(claimedID)
		if len(matches) < 2 {
			fmt.Fprintln(w, "Error: Could not parse Steam ID.")
			errCh <- fmt.Errorf("could not parse Steam ID")
			return
		}

		steamID := matches[1]
		
		// Render success HTML
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<html><body>
			<div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
				<h2>Steam Authentication Successful!</h2>
				<p>Your Steam ID has been linked. You can close this window and return to the application.</p>
				<script>setTimeout(window.close, 3000);</script>
			</div>
		</body></html>`)

		resultCh <- steamID
	})

	// Start server in background
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// Open browser
	runtime.BrowserOpenURL(a.ctx, loginURL)

	// Wait for callback
	select {
	case steamID := <-resultCh:
		server.Shutdown(context.Background())
		a.configMu.Lock()
		a.config.SteamID = steamID
		a.configMu.Unlock()
		a.saveConfig()
		runtime.EventsEmit(a.ctx, "steam:auth-complete")
		return steamID, nil
	case err := <-errCh:
		server.Shutdown(context.Background())
		return "", err
	}
}
