package backend

import (
	"strings"
	"testing"
)

func TestApplySingleVideoTitleUpdate_Validation(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Empty videoID
	err := app.ApplySingleVideoTitleUpdate("", "Valid Title")
	if err == nil || !strings.Contains(err.Error(), "video ID is required") {
		t.Fatalf("expected error for empty video ID, got %v", err)
	}

	// Empty newTitle
	err = app.ApplySingleVideoTitleUpdate("yt-123", "   ")
	if err == nil || !strings.Contains(err.Error(), "title cannot be empty") {
		t.Fatalf("expected error for empty title, got %v", err)
	}

	// Unauthenticated YouTube check
	err = app.ApplySingleVideoTitleUpdate("yt-123", "New Title")
	if err == nil || !strings.Contains(err.Error(), "not authenticated") {
		t.Fatalf("expected not authenticated error, got %v", err)
	}
}
