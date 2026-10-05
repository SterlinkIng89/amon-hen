package backend

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestResumableUpload_Initiate(t *testing.T) {
	expectedSessionURL := "http://fake-youtube.com/upload/resumable-session-123"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("X-Upload-Content-Length") != "1000" {
			t.Errorf("expected X-Upload-Content-Length 1000, got %s", r.Header.Get("X-Upload-Content-Length"))
		}
		if r.Header.Get("X-Upload-Content-Type") != "video/*" {
			t.Errorf("expected X-Upload-Content-Type video/*, got %s", r.Header.Get("X-Upload-Content-Type"))
		}
		w.Header().Set("Location", expectedSessionURL)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	oldEndpoint := ytUploadEndpoint
	ytUploadEndpoint = srv.URL
	defer func() { ytUploadEndpoint = oldEndpoint }()

	app := &App{}
	session := &UploadSession{
		TotalBytes:  1000,
		Title:       "Test Video",
		Description: "Test Description",
		Privacy:     "private",
	}

	err := app.initiateResumableWithClient(context.Background(), srv.Client(), session)
	if err != nil {
		t.Fatalf("unexpected error initiating: %v", err)
	}
	if session.UploadURL != expectedSessionURL {
		t.Fatalf("expected UploadURL %s, got %s", expectedSessionURL, session.UploadURL)
	}
}

func TestResumableUpload_QueryOffset(t *testing.T) {
	tests := []struct {
		name           string
		status         int
		rangeHeader    string
		responseBody   string
		expectedOffset int64
		expectedErr    error
		expectVideo    bool
	}{
		{
			name:           "partial upload returns 308 with Range",
			status:         308,
			rangeHeader:    "bytes=0-1048575",
			expectedOffset: 1048576,
		},
		{
			name:           "no bytes uploaded yet 308 without Range",
			status:         308,
			rangeHeader:    "",
			expectedOffset: 0,
		},
		{
			name:           "already finished upload returns 200 with video json",
			status:         200,
			responseBody:   `{"id":"completed_vid_123"}`,
			expectedOffset: 2000000,
			expectVideo:    true,
		},
		{
			name:        "expired session 404 returns errSessionExpired",
			status:      404,
			expectedErr: errSessionExpired,
		},
		{
			name:        "expired session 410 returns errSessionExpired",
			status:      410,
			expectedErr: errSessionExpired,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPut {
					t.Errorf("expected PUT, got %s", r.Method)
				}
				if r.Header.Get("Content-Range") != "bytes */2000000" {
					t.Errorf("expected Content-Range bytes */2000000, got %s", r.Header.Get("Content-Range"))
				}
				if tc.rangeHeader != "" {
					w.Header().Set("Range", tc.rangeHeader)
				}
				w.WriteHeader(tc.status)
				if tc.responseBody != "" {
					io.WriteString(w, tc.responseBody)
				}
			}))
			defer srv.Close()

			app := &App{}
			session := &UploadSession{
				UploadURL:  srv.URL,
				TotalBytes: 2000000,
			}

			offset, vid, err := app.queryUploadOffsetWithClient(context.Background(), srv.Client(), session)
			if tc.expectedErr != nil {
				if err != tc.expectedErr {
					t.Fatalf("expected error %v, got %v", tc.expectedErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if offset != tc.expectedOffset {
				t.Errorf("expected offset %d, got %d", tc.expectedOffset, offset)
			}
			if tc.expectVideo && (vid == nil || vid.Id != "completed_vid_123") {
				t.Errorf("expected video ID completed_vid_123, got %+v", vid)
			}
		})
	}
}

func TestResumableUpload_SendChunks(t *testing.T) {
	// Create a temp file of 500 bytes
	content := strings.Repeat("A", 500)
	tmp, err := os.CreateTemp("", "test_upload_*.bin")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmp.Name())
	tmp.WriteString(content)
	tmp.Close()

	var putCalls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := atomic.AddInt32(&putCalls, 1)
		body, _ := io.ReadAll(r.Body)
		if len(body) != 500 {
			t.Errorf("call %d: expected 500 bytes, got %d", call, len(body))
		}
		if r.Header.Get("Content-Range") != "bytes 0-499/500" {
			t.Errorf("call %d: unexpected Content-Range %s", call, r.Header.Get("Content-Range"))
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":"vid_new_456"}`))
	}))
	defer srv.Close()

	app := &App{}
	f, _ := os.Open(tmp.Name())
	defer f.Close()

	session := &UploadSession{
		UploadURL:     srv.URL,
		TotalBytes:    500,
		BytesUploaded: 0,
	}

	var progressedBytes int64
	vid, err := app.sendChunksWithClient(context.Background(), srv.Client(), f, session, 0, func(uploaded int64) {
		progressedBytes = uploaded
	})
	if err != nil {
		t.Fatalf("unexpected error sending chunks: %v", err)
	}
	if vid == nil || vid.Id != "vid_new_456" {
		t.Fatalf("expected video id vid_new_456, got %+v", vid)
	}
	if progressedBytes != 500 {
		t.Errorf("expected 500 progressed bytes, got %d", progressedBytes)
	}
}
