package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	youtube "google.golang.org/api/youtube/v3"
)

var (
	ytUploadEndpoint  = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
	errSessionExpired = errors.New("upload session expired")
)

const resumableChunkSize = 8 * 1024 * 1024 // 8 MiB (multiple of 256 KiB required by YouTube)

// initiateResumableWithClient sends the initial request to obtain a resumable upload URI.
func (a *App) initiateResumableWithClient(ctx context.Context, client *http.Client, s *UploadSession) error {
	metadata := map[string]interface{}{
		"snippet": map[string]interface{}{
			"title":       s.Title,
			"description": s.Description,
		},
		"status": map[string]interface{}{
			"privacyStatus": s.Privacy,
		},
	}

	bodyBytes, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal video metadata: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ytUploadEndpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create upload initiation request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json; charset=UTF-8")
	req.Header.Set("X-Upload-Content-Type", "video/*")
	req.Header.Set("X-Upload-Content-Length", strconv.FormatInt(s.TotalBytes, 10))

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("initiate upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("initiate upload returned unexpected status %d: %s", resp.StatusCode, string(respBody))
	}

	sessionURL := resp.Header.Get("Location")
	if sessionURL == "" {
		return fmt.Errorf("YouTube did not return a session Location URL")
	}

	s.UploadURL = sessionURL
	return nil
}

// queryUploadOffsetWithClient queries YouTube for the number of bytes received so far.
func (a *App) queryUploadOffsetWithClient(ctx context.Context, client *http.Client, s *UploadSession) (int64, *youtube.Video, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, s.UploadURL, http.NoBody)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to create offset query request: %w", err)
	}

	req.Header.Set("Content-Range", fmt.Sprintf("bytes */%d", s.TotalBytes))

	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("query offset request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return 0, nil, errSessionExpired
	}

	// If upload was already completed
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		var vid youtube.Video
		if err := json.NewDecoder(resp.Body).Decode(&vid); err != nil {
			return s.TotalBytes, nil, fmt.Errorf("failed to decode completed video response: %w", err)
		}
		return s.TotalBytes, &vid, nil
	}

	if resp.StatusCode == 308 { // Resume Incomplete
		rangeHeader := resp.Header.Get("Range")
		if rangeHeader == "" {
			return 0, nil, nil
		}
		// Expected format: bytes=0-1048575
		parts := strings.Split(rangeHeader, "=")
		if len(parts) == 2 {
			subparts := strings.Split(parts[1], "-")
			if len(subparts) == 2 {
				end, err := strconv.ParseInt(subparts[1], 10, 64)
				if err == nil {
					return end + 1, nil, nil
				}
			}
		}
		return 0, nil, nil
	}

	respBody, _ := io.ReadAll(resp.Body)
	return 0, nil, fmt.Errorf("unexpected status %d while querying offset: %s", resp.StatusCode, string(respBody))
}

// sendChunksWithClient streams file slices to the resumable session URL with progress reporting and retry logic.
func (a *App) sendChunksWithClient(
	ctx context.Context,
	client *http.Client,
	f *os.File,
	s *UploadSession,
	startOffset int64,
	onProg func(int64),
) (*youtube.Video, error) {
	offset := startOffset
	var vid *youtube.Video

	for offset < s.TotalBytes {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		end := offset + resumableChunkSize - 1
		if end >= s.TotalBytes {
			end = s.TotalBytes - 1
		}
		chunkSize := end - offset + 1

		var chunkErr error

		// Exponential backoff retry loop for 5xx/network errors
		maxRetries := 5
		backoff := 1 * time.Second

		for attempt := 0; attempt <= maxRetries; attempt++ {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}

			secReader := io.NewSectionReader(f, offset, chunkSize)
			progChunk := &chunkProgressReader{
				r:            secReader,
				chunkOffset:  offset,
				onByteStream: onProg,
			}

			req, err := http.NewRequestWithContext(ctx, http.MethodPut, s.UploadURL, progChunk)
			if err != nil {
				chunkErr = fmt.Errorf("failed to create chunk request: %w", err)
				break
			}

			req.Header.Set("Content-Length", strconv.FormatInt(chunkSize, 10))
			req.Header.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", offset, end, s.TotalBytes))
			req.Header.Set("Content-Type", "video/*")

			resp, err := client.Do(req)
			if err != nil {
				chunkErr = err
			} else {
				if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
					resp.Body.Close()
					return nil, errSessionExpired
				}

				if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
					var resultVid youtube.Video
					err := json.NewDecoder(resp.Body).Decode(&resultVid)
					resp.Body.Close()
					if err != nil {
						return nil, fmt.Errorf("failed to decode upload response: %w", err)
					}
					vid = &resultVid
					offset = s.TotalBytes
					s.BytesUploaded = offset
					if onProg != nil {
						onProg(offset)
					}
					return vid, nil
				}

				if resp.StatusCode == 308 { // Resume Incomplete
					rangeHeader := resp.Header.Get("Range")
					resp.Body.Close()
					if rangeHeader != "" {
						parts := strings.Split(rangeHeader, "=")
						if len(parts) == 2 {
							subparts := strings.Split(parts[1], "-")
							if len(subparts) == 2 {
								if parsedEnd, err := strconv.ParseInt(subparts[1], 10, 64); err == nil {
									offset = parsedEnd + 1
								} else {
									offset = end + 1
								}
							}
						}
					} else {
						offset = end + 1
					}

					s.BytesUploaded = offset
					if onProg != nil {
						onProg(offset)
					}
					chunkErr = nil
					break
				}

				respBody, _ := io.ReadAll(resp.Body)
				resp.Body.Close()
				if resp.StatusCode >= 500 {
					chunkErr = fmt.Errorf("server error %d: %s", resp.StatusCode, string(respBody))
				} else {
					return nil, fmt.Errorf("upload chunk failed with status %d: %s", resp.StatusCode, string(respBody))
				}
			}

			if attempt < maxRetries {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(backoff):
					backoff *= 2
				}

				// Query actual offset before retrying
				actualOffset, completedVid, qErr := a.queryUploadOffsetWithClient(ctx, client, s)
				if qErr == nil {
					if completedVid != nil {
						return completedVid, nil
					}
					offset = actualOffset
					end = offset + resumableChunkSize - 1
					if end >= s.TotalBytes {
						end = s.TotalBytes - 1
					}
					chunkSize = end - offset + 1
				}
			}
		}

		if chunkErr != nil {
			return nil, chunkErr
		}
	}

	return vid, nil
}

type chunkProgressReader struct {
	r            io.Reader
	chunkOffset  int64
	readSoFar    int64
	onByteStream func(int64)
}

func (cpr *chunkProgressReader) Read(p []byte) (int, error) {
	n, err := cpr.r.Read(p)
	if n > 0 {
		cpr.readSoFar += int64(n)
		if cpr.onByteStream != nil {
			cpr.onByteStream(cpr.chunkOffset + cpr.readSoFar)
		}
	}
	return n, err
}

// UploadToYouTube uploads a single video to YouTube using resumable uploads and emits progress events.
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

	client, err := a.authedHTTPClient(ctx)
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

	var session *UploadSession
	if a.db != nil {
		existing, _ := a.db.GetUploadSession(path)
		if existing != nil {
			if existing.TotalBytes == info.Size() && existing.FileMtime == info.ModTime().Unix() {
				session = existing
			} else {
				a.db.DeleteUploadSession(path)
			}
		}
	}

	var startOffset int64
	var completedVid *youtube.Video

	if session != nil && session.UploadURL != "" {
		appLog("[Queue] Found existing upload session for '%s', querying offset...", filepath.Base(path))
		offset, vid, qErr := a.queryUploadOffsetWithClient(ctx, client, session)
		if errors.Is(qErr, errSessionExpired) {
			appLog("[Queue] Upload session expired for '%s', initiating fresh session", filepath.Base(path))
			if a.db != nil {
				a.db.DeleteUploadSession(path)
			}
			session = nil
		} else if qErr != nil {
			appLog("[Queue] Failed to query offset for '%s': %v", filepath.Base(path), qErr)
			runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": qErr.Error()})
			return qErr
		} else if vid != nil {
			completedVid = vid
			startOffset = info.Size()
		} else {
			startOffset = offset
			session.BytesUploaded = offset
			if a.db != nil {
				a.db.UpdateUploadProgress(path, offset)
				a.db.SetUploadSessionStatus(path, "uploading")
			}
			appLog("[Queue] Resuming '%s' from byte %d / %d (%.1f%%)", title, offset, info.Size(), float64(offset)/float64(info.Size())*100)
		}
	}

	if session == nil {
		appLog("[Queue] Started uploading '%s' (Size: %d bytes)", title, info.Size())
		session = &UploadSession{
			VideoPath:     path,
			TotalBytes:    info.Size(),
			BytesUploaded: 0,
			FileMtime:     info.ModTime().Unix(),
			Title:         title,
			Description:   description,
			Privacy:       privacy,
			PlaylistID:    playlistID,
			GameTag:       gameTag,
			Episode:       episode,
			Status:        "uploading",
			UpdatedAt:     time.Now().Unix(),
		}

		if err := a.initiateResumableWithClient(ctx, client, session); err != nil {
			if strings.Contains(err.Error(), "token") {
				a.InvalidateYouTubeClient()
			}
			appLog("[Queue] Failed to initiate resumable upload for '%s': %v", title, err)
			runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": err.Error()})
			return err
		}

		if a.db != nil {
			a.db.SaveUploadSession(*session)
		}
		startOffset = 0
	}

	initialPct := int(float64(startOffset) / float64(info.Size()) * 100)
	runtime.EventsEmit(a.ctx, "youtube:progress", map[string]interface{}{
		"path":    path,
		"percent": initialPct,
		"speed":   0.0,
	})

	start := time.Now()
	var result *youtube.Video

	if completedVid != nil {
		result = completedVid
	} else {
		lastUpdate := time.Now()
		lastRead := startOffset
		lastPct := initialPct

		onProg := func(uploaded int64) {
			now := time.Now()
			elapsed := now.Sub(lastUpdate)
			pct := int(float64(uploaded) / float64(info.Size()) * 100)

			if pct != lastPct || elapsed >= time.Second {
				speed := 0.0
				if elapsed.Seconds() > 0 {
					speed = float64(uploaded-lastRead) / elapsed.Seconds()
				}
				lastPct = pct
				lastUpdate = now
				lastRead = uploaded
				if a.db != nil {
					a.db.UpdateUploadProgress(path, uploaded)
				}
				runtime.EventsEmit(a.ctx, "youtube:progress", map[string]interface{}{
					"path":    path,
					"percent": pct,
					"speed":   speed,
				})
			}
		}

		resVid, err := a.sendChunksWithClient(ctx, client, f, session, startOffset, onProg)
		a.logAPICall("videos.insert", "", title, QuotaVideosInsert, start, err)

		if err != nil {
			if ctx.Err() == context.Canceled {
				appLog("[Queue] Upload cancelled or paused: '%s'", title)
				if a.db != nil {
					a.db.SetUploadSessionStatus(path, "interrupted")
				}
				runtime.EventsEmit(a.ctx, "youtube:interrupted", map[string]interface{}{
					"path":          path,
					"bytesUploaded": session.BytesUploaded,
					"totalBytes":    session.TotalBytes,
				})
				runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": "Upload cancelled/interrupted"})
				return fmt.Errorf("upload cancelled")
			}

			if errors.Is(err, errSessionExpired) {
				appLog("[Queue] Upload session expired for '%s'", title)
				if a.db != nil {
					a.db.DeleteUploadSession(path)
				}
				runtime.EventsEmit(a.ctx, "youtube:session-expired", map[string]string{
					"path":    path,
					"message": "Upload session expired. Please restart the upload.",
				})
				return err
			}

			errMsg := err.Error()
			if strings.Contains(errMsg, "token") {
				a.InvalidateYouTubeClient()
			}
			if strings.Contains(errMsg, "quotaExceeded") || strings.Contains(errMsg, "RATE_LIMIT_EXCEEDED") {
				appLog("[Queue] FATAL: YouTube Quota Exceeded while uploading '%s'. Wait 24h.", title)
				errMsg = "Daily YouTube upload limit reached (~6 videos/day). Please wait 24h or request a quota increase in Google Cloud Console."
			} else {
				appLog("[Queue] Upload failed for '%s': %v", title, err)
			}

			if a.db != nil {
				a.db.SetUploadSessionStatus(path, "interrupted")
			}
			runtime.EventsEmit(a.ctx, "youtube:interrupted", map[string]interface{}{
				"path":          path,
				"bytesUploaded": session.BytesUploaded,
				"totalBytes":    session.TotalBytes,
			})
			runtime.EventsEmit(a.ctx, "youtube:error", map[string]string{"path": path, "message": errMsg})
			return err
		}
		result = resVid
	}

	elapsed := time.Since(start)
	appLog("[Queue] Successfully uploaded '%s' (ID: %s, Time taken: %s)", title, result.Id, elapsed.Round(time.Second).String())

	if a.db != nil {
		a.db.DeleteUploadSession(path)
	}

	a.finalizeUpload(path, title, playlistID, gameTag, episode, result.Id)

	runtime.EventsEmit(a.ctx, "youtube:done", map[string]string{
		"path": path,
		"url":  "https://youtu.be/" + result.Id,
	})
	return nil
}

func (a *App) finalizeUpload(path, title, playlistID, gameTag string, episode int, videoID string) {
	a.LinkLocalToYouTube(path, videoID, gameTag, episode)

	if a.db != nil && gameTag != "" {
		dur, _ := a.GetVideoDuration(path)
		durStr := ""
		if dur > 0 {
			durStr = fmt.Sprintf("%.2f", dur)
		}
		a.db.mu.Lock()
		a.db.conn.Exec(`
			INSERT INTO yt_videos (id, title, game_tag, episode, local_file, duration, published_at, synced_at)
			VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
			ON CONFLICT(id) DO UPDATE SET
				game_tag = excluded.game_tag,
				episode  = excluded.episode,
				local_file = excluded.local_file,
				duration = CASE WHEN yt_videos.duration IS NULL OR yt_videos.duration = '' THEN excluded.duration ELSE yt_videos.duration END,
				published_at = CASE WHEN yt_videos.published_at IS NULL OR yt_videos.published_at = '' THEN excluded.published_at ELSE yt_videos.published_at END`,
			videoID, title, gameTag, episode, path, durStr, time.Now().Unix(),
		)
		a.db.mu.Unlock()
	}

	if playlistID != "" {
		if plErr := a.AddVideoToPlaylist(playlistID, videoID); plErr != nil {
			appLog("[Queue] Warning: Failed to add video '%s' to playlist %s: %v", videoID, playlistID, plErr)
			runtime.EventsEmit(a.ctx, "youtube:playlist-error", map[string]string{
				"videoId":    videoID,
				"playlistId": playlistID,
				"message":    plErr.Error(),
			})
		} else if a.db != nil {
			a.db.mu.Lock()
			a.db.conn.Exec(`
				INSERT INTO yt_playlist_items (playlist_id, video_id, position)
				VALUES (?, ?, (SELECT COALESCE(MAX(position)+1, 0) FROM yt_playlist_items WHERE playlist_id=?))`,
				playlistID, videoID, playlistID)
			a.db.conn.Exec(
				`UPDATE yt_playlists SET video_count = video_count + 1 WHERE id = ?`,
				playlistID)
			a.db.mu.Unlock()
		}
	}
}

// GetUploadSessions returns all persisted upload sessions from the database.
func (a *App) GetUploadSessions() ([]UploadSession, error) {
	if a.db == nil {
		return []UploadSession{}, nil
	}
	return a.db.ListUploadSessions()
}

// DiscardUploadSession deletes an upload session from SQLite.
func (a *App) DiscardUploadSession(path string) error {
	if a.db == nil {
		return nil
	}
	appLog("[Queue] Discarding upload session for: %s", filepath.Base(path))
	return a.db.DeleteUploadSession(path)
}

// ResumeUpload resumes an existing interrupted upload session.
func (a *App) ResumeUpload(path string) error {
	session, err := a.db.GetUploadSession(path)
	if err != nil {
		return fmt.Errorf("failed to retrieve session: %w", err)
	}
	if session == nil {
		return fmt.Errorf("no upload session found for %s", path)
	}

	return a.UploadToYouTube(
		session.VideoPath,
		session.Title,
		session.Description,
		session.Privacy,
		session.PlaylistID,
		session.GameTag,
		session.Episode,
	)
}
