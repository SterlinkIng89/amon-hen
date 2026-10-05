package backend

import (
	"testing"
)

func TestUploadSession_CRUD(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	session := UploadSession{
		VideoPath:     "C:/videos/gameplay.mp4",
		UploadURL:     "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test12345",
		TotalBytes:    104857600,
		BytesUploaded: 10485760,
		FileMtime:     1710000000,
		Title:         "Epic Gameplay Episode 1",
		Description:   "Description here",
		Privacy:       "unlisted",
		PlaylistID:    "PL12345",
		GameTag:       "EldenRing",
		Episode:       1,
		Status:        "uploading",
		UpdatedAt:     1710000010,
	}

	// 1. Save session
	if err := app.db.SaveUploadSession(session); err != nil {
		t.Fatalf("failed to save upload session: %v", err)
	}

	// 2. Get session
	got, err := app.db.GetUploadSession(session.VideoPath)
	if err != nil {
		t.Fatalf("failed to get upload session: %v", err)
	}
	if got == nil {
		t.Fatalf("expected upload session, got nil")
	}
	if got.Title != session.Title || got.UploadURL != session.UploadURL || got.BytesUploaded != session.BytesUploaded {
		t.Fatalf("mismatched session data: %+v vs %+v", got, session)
	}

	// 3. Update progress
	if err := app.db.UpdateUploadProgress(session.VideoPath, 20971520); err != nil {
		t.Fatalf("failed to update progress: %v", err)
	}
	gotAfterProgress, err := app.db.GetUploadSession(session.VideoPath)
	if err != nil || gotAfterProgress == nil {
		t.Fatalf("failed to get session after progress update: %v", err)
	}
	if gotAfterProgress.BytesUploaded != 20971520 {
		t.Fatalf("expected bytes_uploaded 20971520, got %d", gotAfterProgress.BytesUploaded)
	}

	// 4. Update status
	if err := app.db.SetUploadSessionStatus(session.VideoPath, "interrupted"); err != nil {
		t.Fatalf("failed to set status: %v", err)
	}
	gotAfterStatus, _ := app.db.GetUploadSession(session.VideoPath)
	if gotAfterStatus.Status != "interrupted" {
		t.Fatalf("expected status interrupted, got %s", gotAfterStatus.Status)
	}

	// 5. List sessions
	sessions, err := app.db.ListUploadSessions()
	if err != nil {
		t.Fatalf("failed to list sessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}

	// 6. Delete session
	if err := app.db.DeleteUploadSession(session.VideoPath); err != nil {
		t.Fatalf("failed to delete session: %v", err)
	}
	deleted, err := app.db.GetUploadSession(session.VideoPath)
	if err != nil {
		t.Fatalf("error checking deleted session: %v", err)
	}
	if deleted != nil {
		t.Fatalf("expected nil after delete, got %+v", deleted)
	}
}

func TestUploadSession_MarkStaleUploadsInterrupted(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	s1 := UploadSession{
		VideoPath:  "C:/videos/v1.mp4",
		UploadURL:  "https://upload.url/1",
		TotalBytes: 5000000,
		Status:     "uploading",
	}
	s2 := UploadSession{
		VideoPath:  "C:/videos/v2.mp4",
		UploadURL:  "https://upload.url/2",
		TotalBytes: 8000000,
		Status:     "interrupted",
	}

	if err := app.db.SaveUploadSession(s1); err != nil {
		t.Fatalf("failed to save s1: %v", err)
	}
	if err := app.db.SaveUploadSession(s2); err != nil {
		t.Fatalf("failed to save s2: %v", err)
	}

	if err := app.db.MarkStaleUploadsInterrupted(); err != nil {
		t.Fatalf("failed to mark stale: %v", err)
	}

	got1, _ := app.db.GetUploadSession(s1.VideoPath)
	if got1.Status != "interrupted" {
		t.Fatalf("expected s1 to be interrupted, got %s", got1.Status)
	}

	got2, _ := app.db.GetUploadSession(s2.VideoPath)
	if got2.Status != "interrupted" {
		t.Fatalf("expected s2 to stay interrupted, got %s", got2.Status)
	}
}
