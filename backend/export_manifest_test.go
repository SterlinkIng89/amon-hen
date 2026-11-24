package backend

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
)

func TestExportManifest_MigrationAndIndexes(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Re-running migrate() should be idempotent.
	if err := app.db.migrate(); err != nil {
		t.Fatalf("second migrate() failed: %v", err)
	}

	var tableName string
	err := app.db.conn.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='exported_videos'`).Scan(&tableName)
	if err != nil || tableName != "exported_videos" {
		t.Fatalf("expected exported_videos table to exist, err=%v", err)
	}

	for _, idx := range []string{"idx_exported_videos_status", "idx_exported_videos_source"} {
		var idxName string
		err := app.db.conn.QueryRow(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, idx).Scan(&idxName)
		if err != nil || idxName != idx {
			t.Fatalf("expected index %s to exist, err=%v", idx, err)
		}
	}
}

func TestGenerateExportID(t *testing.T) {
	pattern := regexp.MustCompile(`^AH-[A-Z0-9]{8}$`)
	seen := make(map[string]struct{}, 100)

	for i := 0; i < 100; i++ {
		id, err := GenerateExportID()
		if err != nil {
			t.Fatalf("GenerateExportID() failed: %v", err)
		}
		if !pattern.MatchString(id) {
			t.Fatalf("generated ID %q does not match expected pattern", id)
		}
		suffix := strings.TrimPrefix(id, "AH-")
		for _, ch := range suffix {
			if !strings.ContainsRune(exportIDAlphabet, ch) {
				t.Fatalf("generated ID %q contains ambiguous character %q", id, ch)
			}
		}
		if _, exists := seen[id]; exists {
			t.Fatalf("duplicate ID generated: %q", id)
		}
		seen[id] = struct{}{}
	}
}

func TestExtractExportID(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		wantID string
		wantOK bool
	}{
		{
			name:   "bare ID",
			input:  "AH-7F3K9Q2M",
			wantID: "AH-7F3K9Q2M",
			wantOK: true,
		},
		{
			name:   "decorated YouTube title",
			input:  "AH-7F3K9Q2M - League of Legends",
			wantID: "AH-7F3K9Q2M",
			wantOK: true,
		},
		{
			name:   "YouTube title with hyphen replaced by space",
			input:  "AH KZEAC3U4 League of Legends",
			wantID: "AH-KZEAC3U4",
			wantOK: true,
		},
		{
			name:   "YouTube title with multiple spaces",
			input:  "AH  KZEAC3U4   League of Legends",
			wantID: "AH-KZEAC3U4",
			wantOK: true,
		},
		{
			name:   "en-dash separator",
			input:  "AH\u2013KZEAC3U4 \u2013 League of Legends",
			wantID: "AH-KZEAC3U4",
			wantOK: true,
		},
		{
			name:   "underscore separator",
			input:  "AH_KZEAC3U4 - League of Legends",
			wantID: "AH-KZEAC3U4",
			wantOK: true,
		},
		{
			name:   "omitted separator",
			input:  "AHKZEAC3U4 League of Legends",
			wantID: "AH-KZEAC3U4",
			wantOK: true,
		},
		{
			name:   "lowercase prefix and code",
			input:  "ah kzeac3u4 league of legends",
			wantID: "AH-KZEAC3U4",
			wantOK: true,
		},
		{
			name:   "decorated filename with extension",
			input:  "2026-11-23 Gameplay [AH-9A2B3C4D].mp4",
			wantID: "AH-9A2B3C4D",
			wantOK: true,
		},
		{
			name:   "no tracking ID",
			input:  "League of Legends Episode 12",
			wantID: "",
			wantOK: false,
		},
		{
			name:   "too short",
			input:  "AH-1234567",
			wantID: "",
			wantOK: false,
		},
		{
			name:   "too long",
			input:  "AH-123456789",
			wantID: "",
			wantOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotID, gotOK := ExtractExportID(tc.input)
			if gotOK != tc.wantOK || gotID != tc.wantID {
				t.Fatalf("ExtractExportID(%q) = (%q, %v), want (%q, %v)", tc.input, gotID, gotOK, tc.wantID, tc.wantOK)
			}
		})
	}
}

func TestExportManifest_CRUDAndFiltering(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Empty DB returns non-nil slice serializing to [].
	empty, err := app.GetExportedVideos("")
	if err != nil {
		t.Fatalf("GetExportedVideos on empty DB failed: %v", err)
	}
	if empty == nil {
		t.Fatalf("expected non-nil slice on empty DB")
	}
	raw, err := json.Marshal(empty)
	if err != nil || string(raw) != "[]" {
		t.Fatalf("expected JSON [], got %s (err=%v)", string(raw), err)
	}

	rec1 := ExportedVideoRecord{
		ExportID:      "AH-1111AAAA",
		SourcePath:    "C:/videos/ep1.mp4",
		ExportedPath:  "C:/export/AH-1111AAAA - ep1.mp4",
		TargetTitle:   "Game - 11/23/2026 - Ep 1",
		Description:   "First episode",
		Privacy:       "unlisted",
		GameTag:       "EldenRing",
		PlaylistID:    "PL123",
		PlaylistTitle: "Elden Ring",
		Episode:       1,
		ContentType:   "gameplay",
		Tags:          "elden ring,rpg",
		Status:        "exported",
		ExportedAt:    1000,
	}
	if err := app.insertExportedVideo(rec1); err != nil {
		t.Fatalf("insertExportedVideo rec1 failed: %v", err)
	}

	// Inserting a new 'exported' record for the same source_path supersedes rec1.
	rec1New := ExportedVideoRecord{
		ExportID:      "AH-2222BBBB",
		SourcePath:    "C:/videos/ep1.mp4",
		ExportedPath:  "C:/export/AH-2222BBBB - ep1.mp4",
		TargetTitle:   "Game - 11/23/2026 - Ep 1 v2",
		Privacy:       "private",
		Status:        "exported",
		ExportedAt:    2000,
	}
	if err := app.insertExportedVideo(rec1New); err != nil {
		t.Fatalf("insertExportedVideo rec1New failed: %v", err)
	}

	rec2 := ExportedVideoRecord{
		ExportID:     "AH-3333CCCC",
		SourcePath:   "C:/videos/ep2.mp4",
		ExportedPath: "C:/export/AH-3333CCCC - ep2.mp4",
		TargetTitle:  "Game - 11/24/2026 - Ep 2",
		Status:       "applied",
		YouTubeID:    "yt-abc123",
		ExportedAt:   3000,
		AppliedAt:    3100,
	}
	if err := app.insertExportedVideo(rec2); err != nil {
		t.Fatalf("insertExportedVideo rec2 failed: %v", err)
	}

	// All records ordered by exported_at DESC.
	all, err := app.GetExportedVideos("")
	if err != nil {
		t.Fatalf("GetExportedVideos(\"\") failed: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("expected 3 records, got %d", len(all))
	}
	if all[0].ExportID != "AH-3333CCCC" || all[1].ExportID != "AH-2222BBBB" || all[2].ExportID != "AH-1111AAAA" {
		t.Fatalf("unexpected ordering: %+v", all)
	}

	// Filter by 'exported' should only return rec1New (rec1 was superseded).
	exported, err := app.GetExportedVideos("exported")
	if err != nil {
		t.Fatalf("GetExportedVideos(\"exported\") failed: %v", err)
	}
	if len(exported) != 1 || exported[0].ExportID != "AH-2222BBBB" {
		t.Fatalf("expected only AH-2222BBBB in exported filter, got %+v", exported)
	}

	// Filter by 'superseded' returns rec1.
	superseded, err := app.GetExportedVideos("superseded")
	if err != nil {
		t.Fatalf("GetExportedVideos(\"superseded\") failed: %v", err)
	}
	if len(superseded) != 1 || superseded[0].ExportID != "AH-1111AAAA" {
		t.Fatalf("expected AH-1111AAAA in superseded filter, got %+v", superseded)
	}

	// Dismiss rec1New.
	if err := app.DismissExportRecord("AH-2222BBBB"); err != nil {
		t.Fatalf("DismissExportRecord failed: %v", err)
	}
	exportedAfterDismiss, err := app.GetExportedVideos("exported")
	if err != nil {
		t.Fatalf("GetExportedVideos(\"exported\") after dismiss failed: %v", err)
	}
	if len(exportedAfterDismiss) != 0 {
		t.Fatalf("expected 0 exported records after dismiss, got %d", len(exportedAfterDismiss))
	}
	dismissed, err := app.GetExportedVideos("dismissed")
	if err != nil {
		t.Fatalf("GetExportedVideos(\"dismissed\") failed: %v", err)
	}
	if len(dismissed) != 1 || dismissed[0].ExportID != "AH-2222BBBB" {
		t.Fatalf("expected AH-2222BBBB in dismissed filter, got %+v", dismissed)
	}

	// Delete rec1.
	if err := app.DeleteExportRecord("AH-1111AAAA"); err != nil {
		t.Fatalf("DeleteExportRecord failed: %v", err)
	}
	allAfterDelete, err := app.GetExportedVideos("")
	if err != nil {
		t.Fatalf("GetExportedVideos(\"\") after delete failed: %v", err)
	}
	if len(allAfterDelete) != 2 {
		t.Fatalf("expected 2 records after delete, got %d", len(allAfterDelete))
	}
}
