package backend

import (
	"testing"
)

func TestSteamBacklogCRUDAndReordering(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// 1. Insert 3 items
	if err := app.UpsertSteamBacklogItem(100, "up_next", "Note 100"); err != nil {
		t.Fatalf("failed to insert item 100: %v", err)
	}
	if err := app.UpsertSteamBacklogItem(200, "candidate", "Note 200"); err != nil {
		t.Fatalf("failed to insert item 200: %v", err)
	}
	if err := app.UpsertSteamBacklogItem(300, "playing", "Note 300"); err != nil {
		t.Fatalf("failed to insert item 300: %v", err)
	}

	// Verify auto-incrementing ranks
	var rank100, rank200, rank300 int
	_ = app.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = 100").Scan(&rank100)
	_ = app.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = 200").Scan(&rank200)
	_ = app.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = 300").Scan(&rank300)
	if rank100 != 1 || rank200 != 2 || rank300 != 3 {
		t.Errorf("expected ranks (1, 2, 3), got (%d, %d, %d)", rank100, rank200, rank300)
	}

	// 2. Update existing item preserves rank
	if err := app.UpsertSteamBacklogItem(200, "on_hold", "Updated note"); err != nil {
		t.Fatalf("failed to update item 200: %v", err)
	}
	_ = app.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = 200").Scan(&rank200)
	if rank200 != 2 {
		t.Errorf("expected rank 2 preserved on update, got %d", rank200)
	}

	// 3. Reorder: [300, 100, 200]
	if err := app.ReorderSteamBacklog([]int{300, 100, 200}); err != nil {
		t.Fatalf("ReorderSteamBacklog failed: %v", err)
	}
	_ = app.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = 300").Scan(&rank300)
	_ = app.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = 100").Scan(&rank100)
	_ = app.db.conn.QueryRow("SELECT rank_order FROM steam_backlog_queue WHERE appid = 200").Scan(&rank200)
	if rank300 != 1 || rank100 != 2 || rank200 != 3 {
		t.Errorf("expected ranks after reorder (300:1, 100:2, 200:3), got (%d, %d, %d)", rank300, rank100, rank200)
	}

	// 4. Remove item
	if err := app.RemoveSteamBacklogItem(100); err != nil {
		t.Fatalf("RemoveSteamBacklogItem failed: %v", err)
	}
	var count int
	_ = app.db.conn.QueryRow("SELECT COUNT(*) FROM steam_backlog_queue WHERE appid = 100").Scan(&count)
	if count != 0 {
		t.Errorf("expected item 100 to be removed, but count is %d", count)
	}
}

func TestSteamGameRatingsCRUD(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// 1. Upsert rating with lowercase tier and out-of-bounds score
	if err := app.UpsertSteamGameRating(100, "s", 15, "Amazing"); err != nil {
		t.Fatalf("UpsertSteamGameRating failed: %v", err)
	}

	var tier string
	var score int
	var notes string
	_ = app.db.conn.QueryRow("SELECT tier, score, notes FROM steam_game_ratings WHERE appid = 100").Scan(&tier, &score, &notes)
	if tier != "S" {
		t.Errorf("expected normalized tier 'S', got %q", tier)
	}
	if score != 10 {
		t.Errorf("expected clamped score 10, got %d", score)
	}
	if notes != "Amazing" {
		t.Errorf("unexpected notes: %s", notes)
	}

	// 2. Score lower than 1 clamped to 1
	if err := app.UpsertSteamGameRating(200, "C", -5, "Meh"); err != nil {
		t.Fatalf("UpsertSteamGameRating failed: %v", err)
	}
	_ = app.db.conn.QueryRow("SELECT score FROM steam_game_ratings WHERE appid = 200").Scan(&score)
	if score != 1 {
		t.Errorf("expected clamped score 1, got %d", score)
	}

	// 3. Remove rating
	if err := app.RemoveSteamGameRating(100); err != nil {
		t.Fatalf("RemoveSteamGameRating failed: %v", err)
	}
	var count int
	_ = app.db.conn.QueryRow("SELECT COUNT(*) FROM steam_game_ratings WHERE appid = 100").Scan(&count)
	if count != 0 {
		t.Errorf("expected rating for 100 to be removed, but count is %d", count)
	}
}
