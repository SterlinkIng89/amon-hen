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
			name:     "clean string remains unchanged",
			input:    "Valorant - Match 1 - 2026-10-10",
			expected: "Valorant - Match 1 - 2026-10-10",
		},
		{
			name:     "replaces windows forbidden characters",
			input:    `Game: Episode 1 / Level \ "Boss" <Final> *Hard* ?`,
			expected: "Game- Episode 1 - Level - -Boss- -Final- -Hard",
		},
		{
			name:     "trims dots, dashes, and whitespace",
			input:    " ...-- Test Video ---... ",
			expected: "Test Video",
		},
		{
			name:     "fallback when entirely forbidden characters",
			input:    `/?*:|"<>`,
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

	res, err := app.ExportVideos(items, destDir, true)
	if err != nil {
		t.Fatalf("ExportVideos failed: %v", err)
	}

	if res.SuccessCount != 1 || res.FailedCount != 0 {
		t.Fatalf("expected 1 success, 0 failed; got %d success, %d failed", res.SuccessCount, res.FailedCount)
	}

	expectedVid := filepath.Join(destDir, "Hades- Escape Run - Tartarus.mp4")
	if _, err := os.Stat(expectedVid); err != nil {
		t.Errorf("expected exported video at %q, err: %v", expectedVid, err)
	}

	expectedMeta := filepath.Join(destDir, "Hades- Escape Run - Tartarus.txt")
	if _, err := os.Stat(expectedMeta); err != nil {
		t.Errorf("expected metadata file at %q, err: %v", expectedMeta, err)
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
