package backend

import (
	"testing"
)

func TestTitleNormalizationDrafts_MigrationAndIndex(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	if err := app.db.migrate(); err != nil {
		t.Fatalf("second migrate() failed: %v", err)
	}

	var tableName string
	err := app.db.conn.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='title_normalization_drafts'`).Scan(&tableName)
	if err != nil || tableName != "title_normalization_drafts" {
		t.Fatalf("expected title_normalization_drafts table to exist, err=%v", err)
	}

	var idxName string
	err = app.db.conn.QueryRow(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_title_norm_drafts_playlist'`).Scan(&idxName)
	if err != nil || idxName != "idx_title_norm_drafts_playlist" {
		t.Fatalf("expected idx_title_norm_drafts_playlist index to exist, err=%v", err)
	}
}

func TestTitleNormalizationDrafts_EmptyStateAndValidation(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	drafts, err := app.GetTitleNormalizationDrafts("")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDrafts(\"\") failed: %v", err)
	}
	if drafts == nil || len(drafts) != 0 {
		t.Fatalf("expected non-nil empty slice, got %#v", drafts)
	}

	single, err := app.GetTitleNormalizationDraft("missing-video")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDraft(\"missing-video\") failed: %v", err)
	}
	if single != nil {
		t.Fatalf("expected nil for missing draft, got %#v", single)
	}

	if err := app.SaveTitleNormalizationDraft(TitleNormalizationDraft{}); err == nil {
		t.Fatal("expected error when saving draft with empty videoId")
	}

	if err := app.SaveTitleNormalizationDraftsBatch(nil); err != nil {
		t.Fatalf("expected empty batch save to succeed, got %v", err)
	}

	if err := app.SaveTitleNormalizationDraftsBatch([]TitleNormalizationDraft{
		{VideoID: "vid-ok", ProposedTitle: "Title"},
		{VideoID: "", ProposedTitle: "Invalid"},
	}); err == nil {
		t.Fatal("expected error when batch contains empty videoId")
	}

	// Verify transaction rolled back vid-ok on batch validation failure.
	rolledBack, err := app.GetTitleNormalizationDraft("vid-ok")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDraft failed: %v", err)
	}
	if rolledBack != nil {
		t.Fatalf("expected batch failure to roll back prior inserts, got %#v", rolledBack)
	}

	if err := app.MarkTitleNormalizationDraftSynced("", "Synced Title"); err == nil {
		t.Fatal("expected error when marking empty videoId synced")
	}

	if err := app.DeleteTitleNormalizationDraft(""); err == nil {
		t.Fatal("expected error when deleting empty videoId")
	}
}

func TestTitleNormalizationDrafts_SaveGetUpsertAndCustomVars(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Nil CustomVars should serialize as "{}" and deserialize as non-nil empty map.
	initial := TitleNormalizationDraft{
		VideoID:       "vid-1",
		PlaylistID:    "pl-1",
		GameTag:       "elden_ring",
		ProfileType:   "lets_play",
		Event:         "Boss Fight",
		GameMode:      "Co-op",
		DateOverride:  "2026-01-15",
		Episode:       12,
		CustomVars:    nil,
		ProposedTitle: "Elden Ring #12 - Boss Fight",
	}
	if err := app.SaveTitleNormalizationDraft(initial); err != nil {
		t.Fatalf("SaveTitleNormalizationDraft failed: %v", err)
	}

	got, err := app.GetTitleNormalizationDraft("vid-1")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDraft failed: %v", err)
	}
	if got == nil {
		t.Fatal("expected saved draft, got nil")
	}
	if got.Status != "draft" {
		t.Fatalf("expected default status 'draft', got %q", got.Status)
	}
	if got.UpdatedAt == 0 {
		t.Fatal("expected UpdatedAt to be populated")
	}
	if got.CustomVars == nil || len(got.CustomVars) != 0 {
		t.Fatalf("expected non-nil empty CustomVars map, got %#v", got.CustomVars)
	}

	// Upsert with populated CustomVars and ready status.
	updated := *got
	updated.Episode = 13
	updated.Status = "ready"
	updated.ProposedTitle = "Elden Ring #13 - Malenia"
	updated.CustomVars = map[string]string{
		"boss":   "Malenia",
		"weapon": "Moonveil",
	}
	if err := app.SaveTitleNormalizationDraft(updated); err != nil {
		t.Fatalf("SaveTitleNormalizationDraft upsert failed: %v", err)
	}

	gotUpdated, err := app.GetTitleNormalizationDraft("vid-1")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDraft after upsert failed: %v", err)
	}
	if gotUpdated.Episode != 13 || gotUpdated.Status != "ready" || gotUpdated.ProposedTitle != "Elden Ring #13 - Malenia" {
		t.Fatalf("unexpected updated draft fields: %#v", gotUpdated)
	}
	if gotUpdated.CustomVars["boss"] != "Malenia" || gotUpdated.CustomVars["weapon"] != "Moonveil" {
		t.Fatalf("expected CustomVars round-trip, got %#v", gotUpdated.CustomVars)
	}
}

func TestTitleNormalizationDrafts_BatchQuerySyncAndDelete(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	batch := []TitleNormalizationDraft{
		{
			VideoID:       "vid-a",
			PlaylistID:    "pl-alpha",
			GameTag:       "hades",
			Episode:       1,
			CustomVars:    map[string]string{"heat": "32"},
			ProposedTitle: "Hades #1",
			Status:        "ready",
		},
		{
			VideoID:       "vid-b",
			PlaylistID:    "pl-alpha",
			GameTag:       "hades",
			Episode:       2,
			ProposedTitle: "Hades #2",
			Status:        "draft",
		},
		{
			VideoID:       "vid-c",
			PlaylistID:    "pl-beta",
			GameTag:       "celeste",
			Episode:       5,
			ProposedTitle: "Celeste #5",
			Status:        "draft",
		},
	}
	if err := app.SaveTitleNormalizationDraftsBatch(batch); err != nil {
		t.Fatalf("SaveTitleNormalizationDraftsBatch failed: %v", err)
	}

	allDrafts, err := app.GetTitleNormalizationDrafts("")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDrafts(\"\") failed: %v", err)
	}
	if len(allDrafts) != 3 {
		t.Fatalf("expected 3 drafts total, got %d", len(allDrafts))
	}

	alphaDrafts, err := app.GetTitleNormalizationDrafts("pl-alpha")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDrafts(\"pl-alpha\") failed: %v", err)
	}
	if len(alphaDrafts) != 2 {
		t.Fatalf("expected 2 drafts for pl-alpha, got %d", len(alphaDrafts))
	}

	// Verify ordering by updated_at DESC when timestamps differ.
	if _, err := app.db.conn.Exec(`UPDATE title_normalization_drafts SET updated_at = 100 WHERE video_id = 'vid-a'`); err != nil {
		t.Fatalf("failed to set updated_at for vid-a: %v", err)
	}
	if _, err := app.db.conn.Exec(`UPDATE title_normalization_drafts SET updated_at = 200 WHERE video_id = 'vid-b'`); err != nil {
		t.Fatalf("failed to set updated_at for vid-b: %v", err)
	}
	alphaOrdered, err := app.GetTitleNormalizationDrafts("pl-alpha")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDrafts ordered check failed: %v", err)
	}
	if alphaOrdered[0].VideoID != "vid-b" || alphaOrdered[1].VideoID != "vid-a" {
		t.Fatalf("expected updated_at DESC ordering [vid-b, vid-a], got [%s, %s]", alphaOrdered[0].VideoID, alphaOrdered[1].VideoID)
	}

	// Mark synced.
	if err := app.MarkTitleNormalizationDraftSynced("vid-a", "Hades #1 [32 Heat]"); err != nil {
		t.Fatalf("MarkTitleNormalizationDraftSynced failed: %v", err)
	}
	synced, err := app.GetTitleNormalizationDraft("vid-a")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDraft after sync failed: %v", err)
	}
	if synced.Status != "synced" || synced.ProposedTitle != "Hades #1 [32 Heat]" {
		t.Fatalf("unexpected synced state: %#v", synced)
	}

	// Delete.
	if err := app.DeleteTitleNormalizationDraft("vid-b"); err != nil {
		t.Fatalf("DeleteTitleNormalizationDraft failed: %v", err)
	}
	deleted, err := app.GetTitleNormalizationDraft("vid-b")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDraft after delete failed: %v", err)
	}
	if deleted != nil {
		t.Fatalf("expected nil after delete, got %#v", deleted)
	}

	remainingAlpha, err := app.GetTitleNormalizationDrafts("pl-alpha")
	if err != nil {
		t.Fatalf("GetTitleNormalizationDrafts after delete failed: %v", err)
	}
	if len(remainingAlpha) != 1 || remainingAlpha[0].VideoID != "vid-a" {
		t.Fatalf("expected only vid-a remaining in pl-alpha, got %#v", remainingAlpha)
	}
}
