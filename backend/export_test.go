package backend

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "replaces ASCII hyphens and date slashes for YouTube drag-and-drop",
			input:    "Valorant - Match 1 - 17/11/26",
			expected: "Valorant – Match 1 – 17∕11∕26",
		},
		{
			name:     "preserves em-dash and replaces date slashes",
			input:    "Valorant — 17/11/26 — 1",
			expected: "Valorant — 17∕11∕26 — 1",
		},
		{
			name:     "replaces colons, pipes, slashes, backslashes, and quotes with safe equivalents",
			input:    `Hades: Escape Run / Tartarus \ "Boss" | <Final> *Hard* ?`,
			expected: "Hades∶ Escape Run ∕ Tartarus ∕ ''Boss'' ∣ Final Hard",
		},
		{
			name:     "replaces pipe separators with divides homoglyph",
			input:    "Game | 17/11/26 | 1",
			expected: "Game ∣ 17∕11∕26 ∣ 1",
		},
		{
			name:     "trims dots, dashes, en-dashes, and whitespace",
			input:    " ...--– Test Video –---... ",
			expected: "Test Video",
		},
		{
			name:     "collapses multiple spaces when forbidden characters are stripped",
			input:    "Game  *  ?  <Episode>  1",
			expected: "Game Episode 1",
		},
		{
			name:     "fallback when entirely stripped characters",
			input:    `?*<>`,
			expected: "video",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := sanitizeFilename(tc.input)
			if actual != tc.expected {
				t.Errorf("sanitizeFilename(%q) = %q; want %q", tc.input, actual, tc.expected)
			}
		})
	}
}

func TestResolveUniqueDestination(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "amonhen-export-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	base := "My Clip"
	ext := ".mp4"

	// First file does not exist yet
	path1 := resolveUniqueDestination(tmpDir, base, ext)
	expected1 := filepath.Join(tmpDir, "My Clip.mp4")
	if path1 != expected1 {
		t.Fatalf("expected %q, got %q", expected1, path1)
	}

	// Create path1
	if err := os.WriteFile(path1, []byte("dummy"), 0644); err != nil {
		t.Fatalf("failed to write dummy file: %v", err)
	}

	// Second resolution should detect collision and append (1)
	path2 := resolveUniqueDestination(tmpDir, base, ext)
	expected2 := filepath.Join(tmpDir, "My Clip (1).mp4")
	if path2 != expected2 {
		t.Fatalf("expected %q, got %q", expected2, path2)
	}

	// Create path2
	if err := os.WriteFile(path2, []byte("dummy2"), 0644); err != nil {
		t.Fatalf("failed to write dummy2 file: %v", err)
	}

	// Third resolution should append (2)
	path3 := resolveUniqueDestination(tmpDir, base, ext)
	expected3 := filepath.Join(tmpDir, "My Clip (2).mp4")
	if path3 != expected3 {
		t.Fatalf("expected %q, got %q", expected3, path3)
	}
}

func TestCopyFileNonDestructiveAndMetadata(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "amonhen-export-copy-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	srcFile := filepath.Join(tmpDir, "source.mp4")
	srcContent := "raw video data bytes 123456"
	if err := os.WriteFile(srcFile, []byte(srcContent), 0644); err != nil {
		t.Fatalf("failed to write source file: %v", err)
	}

	dstFile := filepath.Join(tmpDir, "exported.mp4")
	if err := copyFileNonDestructive(srcFile, dstFile); err != nil {
		t.Fatalf("copyFileNonDestructive failed: %v", err)
	}

	// Verify source was untouched
	srcBytes, err := os.ReadFile(srcFile)
	if err != nil || string(srcBytes) != srcContent {
		t.Fatalf("source file was corrupted or modified")
	}

	// Verify destination content
	dstBytes, err := os.ReadFile(dstFile)
	if err != nil || string(dstBytes) != srcContent {
		t.Fatalf("destination file content mismatch")
	}

	// Test metadata companion
	metaFile := filepath.Join(tmpDir, "exported.txt")
	item := ExportItem{
		SourcePath:    srcFile,
		TargetTitle:   "Elden Ring - Boss Fight",
		Description:   "Epic battle with Malenia",
		Game:          "Elden Ring",
		PlaylistTitle: "Bosses",
		Privacy:       "unlisted",
		Tags:          []string{"elden ring", "boss", "clip"},
	}

	if err := writeMetadataCompanion(metaFile, item); err != nil {
		t.Fatalf("writeMetadataCompanion failed: %v", err)
	}

	metaBytes, err := os.ReadFile(metaFile)
	if err != nil {
		t.Fatalf("failed to read metadata file: %v", err)
	}
	metaStr := string(metaBytes)

	if !strings.Contains(metaStr, "Title: Elden Ring - Boss Fight") {
		t.Errorf("metadata missing title: %s", metaStr)
	}
	if !strings.Contains(metaStr, "Game: Elden Ring") {
		t.Errorf("metadata missing game: %s", metaStr)
	}
	if !strings.Contains(metaStr, "Epic battle with Malenia") {
		t.Errorf("metadata missing description: %s", metaStr)
	}
}

func TestAppExportVideos(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "amonhen-app-export-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	srcDir := filepath.Join(tmpDir, "source")
	destDir := filepath.Join(tmpDir, "export")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		t.Fatalf("failed to create srcDir: %v", err)
	}

	vid1 := filepath.Join(srcDir, "raw1.mp4")
	if err := os.WriteFile(vid1, []byte("clip one content"), 0644); err != nil {
		t.Fatalf("failed to create vid1: %v", err)
	}

	app := &App{
		config: Config{},
	}

	items := []ExportItem{
		{
			SourcePath:    vid1,
			TargetTitle:   "Hades: Escape Run / Tartarus",
			Description:   "First clear with Shield",
			Game:          "Hades",
			PlaylistTitle: "Hades Runs",
			Privacy:       "unlisted",
			Tags:          []string{"hades", "roguelike"},
		},
	}

	res, err := app.ExportVideos(items, destDir, true, false)
	if err != nil {
		t.Fatalf("ExportVideos failed: %v", err)
	}

	if res.SuccessCount != 1 || res.FailedCount != 0 {
		t.Fatalf("expected 1 success, 0 failed; got %d success, %d failed", res.SuccessCount, res.FailedCount)
	}
	if len(res.ExportIDs) != 0 {
		t.Fatalf("expected 0 exportIds when useTrackingID is false, got %v", res.ExportIDs)
	}

	expectedVid := filepath.Join(destDir, "Hades∶ Escape Run ∕ Tartarus.mp4")
	if _, err := os.Stat(expectedVid); err != nil {
		t.Errorf("expected exported video at %q, err: %v", expectedVid, err)
	}

	expectedMeta := filepath.Join(destDir, "Hades∶ Escape Run ∕ Tartarus.txt")
	if _, err := os.Stat(expectedMeta); err != nil {
		t.Errorf("expected metadata file at %q, err: %v", expectedMeta, err)
	}
}

func TestAppExportVideos_TrackingID(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	tmpDir, err := os.MkdirTemp("", "amonhen-app-export-tracked-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	srcDir := filepath.Join(tmpDir, "source")
	destDir := filepath.Join(tmpDir, "export")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		t.Fatalf("failed to create srcDir: %v", err)
	}

	vidWithGame := filepath.Join(srcDir, "raw1.mp4")
	if err := os.WriteFile(vidWithGame, []byte("clip one"), 0644); err != nil {
		t.Fatalf("failed to create vidWithGame: %v", err)
	}
	vidNoGame := filepath.Join(srcDir, "raw2.mp4")
	if err := os.WriteFile(vidNoGame, []byte("clip two"), 0644); err != nil {
		t.Fatalf("failed to create vidNoGame: %v", err)
	}

	items := []ExportItem{
		{
			SourcePath:    vidWithGame,
			TargetTitle:   "Hades: Escape / 17/11/26 - Ep 1",
			Description:   "First clear with Shield",
			Game:          "Hades: II / Test",
			PlaylistID:    "PL-HADES-1",
			PlaylistTitle: "Hades Runs",
			Episode:       1,
			ContentType:   "episode",
			Privacy:       "unlisted",
			Tags:          []string{"hades", "roguelike"},
		},
		{
			SourcePath:    vidNoGame,
			TargetTitle:   "Highlight / 18/11/26 - Clutch",
			Description:   "Random highlight",
			Game:          "",
			PlaylistID:    "",
			PlaylistTitle: "",
			Episode:       0,
			ContentType:   "clip",
			Privacy:       "private",
			Tags:          []string{"clip"},
		},
	}

	res, err := app.ExportVideos(items, destDir, false, true)
	if err != nil {
		t.Fatalf("ExportVideos(useTrackingID=true) failed: %v", err)
	}
	if res.SuccessCount != 2 || res.FailedCount != 0 {
		t.Fatalf("expected 2 success, 0 failed; got %d success, %d failed (errors=%v)", res.SuccessCount, res.FailedCount, res.Errors)
	}
	if len(res.ExportIDs) != 2 || len(res.ExportedPaths) != 2 {
		t.Fatalf("expected 2 exportIds and 2 exportedPaths, got ids=%v paths=%v", res.ExportIDs, res.ExportedPaths)
	}

	// Item 1: AH-XXXXXXXX - <SanitizedGame>.mp4
	id1 := res.ExportIDs[0]
	base1 := filepath.Base(res.ExportedPaths[0])
	wantBase1 := id1 + " - Hades∶ II ∕ Test.mp4"
	if base1 != wantBase1 {
		t.Errorf("item 1 filename = %q, want %q", base1, wantBase1)
	}

	// Item 2: AH-XXXXXXXX.mp4
	id2 := res.ExportIDs[1]
	base2 := filepath.Base(res.ExportedPaths[1])
	wantBase2 := id2 + ".mp4"
	if base2 != wantBase2 {
		t.Errorf("item 2 filename = %q, want %q", base2, wantBase2)
	}

	// Verify DB manifest records preserve unsanitized target titles and all metadata.
	records, err := app.GetExportedVideos("exported")
	if err != nil {
		t.Fatalf("GetExportedVideos failed: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 exported records in DB, got %d", len(records))
	}

	byID := make(map[string]ExportedVideoRecord, len(records))
	for _, r := range records {
		byID[r.ExportID] = r
	}

	rec1, ok := byID[id1]
	if !ok {
		t.Fatalf("missing DB record for export ID %s", id1)
	}
	if rec1.TargetTitle != "Hades: Escape / 17/11/26 - Ep 1" {
		t.Errorf("rec1.TargetTitle = %q, want unsanitized title", rec1.TargetTitle)
	}
	if rec1.PlaylistID != "PL-HADES-1" || rec1.Episode != 1 || rec1.ContentType != "episode" {
		t.Errorf("rec1 metadata mismatch: playlistId=%q episode=%d contentType=%q", rec1.PlaylistID, rec1.Episode, rec1.ContentType)
	}
	if rec1.Tags != "hades,roguelike" || rec1.Privacy != "unlisted" || rec1.GameTag != "Hades: II / Test" {
		t.Errorf("rec1 fields mismatch: tags=%q privacy=%q gameTag=%q", rec1.Tags, rec1.Privacy, rec1.GameTag)
	}
	if rec1.ExportedPath != res.ExportedPaths[0] {
		t.Errorf("rec1.ExportedPath = %q, want %q", rec1.ExportedPath, res.ExportedPaths[0])
	}

	rec2, ok := byID[id2]
	if !ok {
		t.Fatalf("missing DB record for export ID %s", id2)
	}
	if rec2.TargetTitle != "Highlight / 18/11/26 - Clutch" {
		t.Errorf("rec2.TargetTitle = %q, want unsanitized title", rec2.TargetTitle)
	}
	if rec2.ContentType != "clip" || rec2.Tags != "clip" {
		t.Errorf("rec2 fields mismatch: contentType=%q tags=%q", rec2.ContentType, rec2.Tags)
	}
}

func TestAppExportVideos_TrackingIDRequiresDB(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "amonhen-app-export-nodb-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	srcFile := filepath.Join(tmpDir, "raw.mp4")
	if err := os.WriteFile(srcFile, []byte("clip"), 0644); err != nil {
		t.Fatalf("failed to create srcFile: %v", err)
	}
	destDir := filepath.Join(tmpDir, "export")

	app := &App{config: Config{}}
	res, err := app.ExportVideos([]ExportItem{{SourcePath: srcFile, TargetTitle: "Test"}}, destDir, false, true)
	if err == nil {
		t.Fatalf("expected error when useTrackingID is true and db is nil")
	}
	if len(res.ExportIDs) != 0 || len(res.ExportedPaths) != 0 {
		t.Fatalf("expected empty ExportIDs and ExportedPaths on DB failure")
	}
	if _, statErr := os.Stat(destDir); !os.IsNotExist(statErr) {
		t.Fatalf("expected destDir not to be created when failing fast on missing DB")
	}
}

func TestOpenFolderInExplorerValidation(t *testing.T) {
	app := &App{}

	// Test empty path
	if err := app.OpenFolderInExplorer(""); err == nil {
		t.Errorf("expected error for empty folder path, got nil")
	}

	// Test non-existent path
	nonExistent := filepath.Join(os.TempDir(), "non-existent-dir-123456789")
	if err := app.OpenFolderInExplorer(nonExistent); err == nil {
		t.Errorf("expected error for non-existent path, got nil")
	}
}
