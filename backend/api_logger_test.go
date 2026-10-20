package backend

import (
	"errors"
	"testing"
	"time"
)

func TestQuotaWindow(t *testing.T) {
	// Standard day test: 2026-10-19 12:00:00 -06:00 (which is 11:00:00 PDT)
	loc, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatalf("failed to load America/Los_Angeles: %v", err)
	}

	testTime := time.Date(2026, 10, 19, 12, 0, 0, 0, time.FixedZone("CST", -6*3600))
	start, next := quotaWindow(testTime)

	expectedStart := time.Date(2026, 10, 19, 0, 0, 0, 0, loc)
	expectedNext := time.Date(2026, 10, 20, 0, 0, 0, 0, loc)

	if !start.Equal(expectedStart) {
		t.Errorf("expected start %v, got %v", expectedStart, start)
	}
	if !next.Equal(expectedNext) {
		t.Errorf("expected next %v, got %v", expectedNext, next)
	}

	// Just before midnight PT: 2026-10-19 06:59:59 UTC -> 2026-10-18 23:59:59 PDT
	utcEarly := time.Date(2026, 10, 19, 6, 59, 59, 0, time.UTC)
	startEarly, nextEarly := quotaWindow(utcEarly)

	expectedStartEarly := time.Date(2026, 10, 18, 0, 0, 0, 0, loc)
	expectedNextEarly := time.Date(2026, 10, 19, 0, 0, 0, 0, loc)

	if !startEarly.Equal(expectedStartEarly) {
		t.Errorf("expected startEarly %v, got %v", expectedStartEarly, startEarly)
	}
	if !nextEarly.Equal(expectedNextEarly) {
		t.Errorf("expected nextEarly %v, got %v", expectedNextEarly, nextEarly)
	}

	// DST change test: 2026-11-01 (Fall back in US - 25 hour day)
	dstDay := time.Date(2026, 11, 1, 12, 0, 0, 0, loc)
	startDST, nextDST := quotaWindow(dstDay)
	expectedStartDST := time.Date(2026, 11, 1, 0, 0, 0, 0, loc)
	expectedNextDST := time.Date(2026, 11, 2, 0, 0, 0, 0, loc)

	if !startDST.Equal(expectedStartDST) {
		t.Errorf("expected startDST %v, got %v", expectedStartDST, startDST)
	}
	if !nextDST.Equal(expectedNextDST) {
		t.Errorf("expected nextDST %v, got %v", expectedNextDST, nextDST)
	}
	diff := nextDST.Sub(startDST)
	if diff != 25*time.Hour {
		t.Errorf("expected 25 hour day on fall back DST transition, got %v", diff)
	}
}

func TestGetQuotaStatus(t *testing.T) {
	app := setupTestDB(t)
	defer app.db.conn.Close()

	// Initial status should be 0 used, DailyQuotaLimit remaining
	status, err := app.GetQuotaStatus()
	if err != nil {
		t.Fatalf("GetQuotaStatus failed: %v", err)
	}
	if status.Used != 0 {
		t.Errorf("expected Used 0, got %d", status.Used)
	}
	if status.Limit != DailyQuotaLimit {
		t.Errorf("expected Limit %d, got %d", DailyQuotaLimit, status.Limit)
	}
	if status.Remaining != DailyQuotaLimit {
		t.Errorf("expected Remaining %d, got %d", DailyQuotaLimit, status.Remaining)
	}
	if status.ResetsAt <= time.Now().Unix() {
		t.Errorf("expected ResetsAt in the future, got %d <= %d", status.ResetsAt, time.Now().Unix())
	}

	// Insert 1 successful call (cost 1600) and 1 failed call (cost 50)
	start := time.Now()
	app.logAPICall("videos.insert", "vid-1", "Video 1", QuotaVideosInsert, start, nil)
	app.logAPICall("thumbnails.set", "vid-1", "Video 1", QuotaThumbnailsSet, start, errors.New("fake error"))

	status, err = app.GetQuotaStatus()
	if err != nil {
		t.Fatalf("GetQuotaStatus failed: %v", err)
	}
	if status.Used != 1600 {
		t.Errorf("expected Used 1600, got %d", status.Used)
	}
	if status.Remaining != DailyQuotaLimit-1600 {
		t.Errorf("expected Remaining %d, got %d", DailyQuotaLimit-1600, status.Remaining)
	}

	// Now insert another call exceeding limit
	app.logAPICall("videos.insert", "vid-2", "Video 2", 9000, start, nil)
	status, err = app.GetQuotaStatus()
	if err != nil {
		t.Fatalf("GetQuotaStatus failed: %v", err)
	}
	if status.Used != 10600 {
		t.Errorf("expected Used 10600, got %d", status.Used)
	}
	if status.Remaining != 0 {
		t.Errorf("expected Remaining 0 when over limit, got %d", status.Remaining)
	}
}
