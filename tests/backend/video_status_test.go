package backend_test

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"amon-hen/backend"
)

func TestComputeVideoStatus(t *testing.T) {
	tests := []struct {
		name               string
		uploadStatus       string
		rejectionReason    string
		ytRating           string
		regionBlocked      []string
		expectedStatus     string
		expectedIssues     []string
	}{
		{
			name:            "Healthy monetized public video",
			uploadStatus:    "processed",
			rejectionReason: "",
			ytRating:        "",
			regionBlocked:   nil,
			expectedStatus:  "monetized",
			expectedIssues:  []string{},
		},
		{
			name:            "Copyright claim / rejection",
			uploadStatus:    "rejected",
			rejectionReason: "copyright",
			ytRating:        "",
			regionBlocked:   nil,
			expectedStatus:  "demonetized",
			expectedIssues:  []string{"rejected", "copyright"},
		},
		{
			name:            "Content claim rejection",
			uploadStatus:    "processed",
			rejectionReason: "claim",
			ytRating:        "",
			regionBlocked:   nil,
			expectedStatus:  "demonetized",
			expectedIssues:  []string{"claim"},
		},
		{
			name:            "Age restricted video",
			uploadStatus:    "processed",
			rejectionReason: "",
			ytRating:        "ytAgeRestricted",
			regionBlocked:   nil,
			expectedStatus:  "limited",
			expectedIssues:  []string{"age_restricted"},
		},
		{
			name:            "Region restricted video",
			uploadStatus:    "processed",
			rejectionReason: "",
			ytRating:        "",
			regionBlocked:   []string{"DE", "JP"},
			expectedStatus:  "limited",
			expectedIssues:  []string{"region_restricted"},
		},
		{
			name:            "Upload failed video",
			uploadStatus:    "failed",
			rejectionReason: "",
			ytRating:        "",
			regionBlocked:   nil,
			expectedStatus:  "demonetized",
			expectedIssues:  []string{"failed"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			status, issues := backend.ComputeVideoStatus(tc.uploadStatus, tc.rejectionReason, tc.ytRating, tc.regionBlocked)
			if status != tc.expectedStatus {
				t.Errorf("Expected status %q, got %q", tc.expectedStatus, status)
			}
			if !reflect.DeepEqual(issues, tc.expectedIssues) {
				t.Errorf("Expected issues %v, got %v", tc.expectedIssues, issues)
			}
		})
	}
}

func TestGetChannelVideosPaginated_MonetizationFields(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	err := app.InitTestDB(dbPath)
	if err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()
	_, err = db.Exec(`
		INSERT INTO yt_videos (id, title, description, published_at, thumbnail_url, view_count, like_count, duration, privacy, monetization_status, rejection_reason, status_issues)
		VALUES 
			('v1', 'Healthy Video', 'Desc', '2026-01-01T00:00:00Z', 'https://example.com/1.jpg', 1000, 50, 'PT10M', 'public', 'monetized', '', ''),
			('v2', 'Limited Video', 'Desc', '2026-01-02T00:00:00Z', 'https://example.com/2.jpg', 500, 20, 'PT5M', 'public', 'limited', '', 'age_restricted'),
			('v3', 'Demonetized Video', 'Desc', '2026-01-03T00:00:00Z', 'https://example.com/3.jpg', 200, 10, 'PT8M', 'public', 'demonetized', 'copyright', 'rejected,copyright')
	`)
	if err != nil {
		t.Fatalf("Failed to insert test videos: %v", err)
	}

	res, err := app.GetChannelVideosPaginated(1, 10, "recent", "", "", "")
	if err != nil {
		t.Fatalf("GetChannelVideosPaginated returned error: %v", err)
	}

	videos, ok := res["videos"].([]backend.YTVideo)
	if !ok {
		t.Fatalf("Expected videos slice, got %T", res["videos"])
	}

	if len(videos) != 3 {
		t.Fatalf("Expected 3 videos, got %d", len(videos))
	}

	vMap := make(map[string]backend.YTVideo)
	for _, v := range videos {
		vMap[v.ID] = v
	}

	if vMap["v1"].MonetizationStatus != "monetized" {
		t.Errorf("Expected v1 to be monetized, got %q", vMap["v1"].MonetizationStatus)
	}
	if len(vMap["v1"].StatusIssues) != 0 {
		t.Errorf("Expected v1 to have 0 issues, got %v", vMap["v1"].StatusIssues)
	}

	if vMap["v2"].MonetizationStatus != "limited" {
		t.Errorf("Expected v2 to be limited, got %q", vMap["v2"].MonetizationStatus)
	}
	if len(vMap["v2"].StatusIssues) != 1 || vMap["v2"].StatusIssues[0] != "age_restricted" {
		t.Errorf("Expected v2 issues [age_restricted], got %v", vMap["v2"].StatusIssues)
	}

	if vMap["v3"].MonetizationStatus != "demonetized" {
		t.Errorf("Expected v3 to be demonetized, got %q", vMap["v3"].MonetizationStatus)
	}
	if vMap["v3"].RejectionReason != "copyright" {
		t.Errorf("Expected v3 rejection_reason 'copyright', got %q", vMap["v3"].RejectionReason)
	}
	if len(vMap["v3"].StatusIssues) != 2 {
		t.Errorf("Expected v3 to have 2 issues, got %v", vMap["v3"].StatusIssues)
	}
}

func TestUpdateVideoMonetizationStatus(t *testing.T) {
	app, tempDir := setupTestApp(t)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	err := app.InitTestDB(dbPath)
	if err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	db := app.GetDB()
	_, err = db.Exec(`
		INSERT INTO yt_videos (id, title, description, published_at, thumbnail_url, view_count, like_count, duration, privacy, monetization_status, rejection_reason, status_issues)
		VALUES ('v_status', 'Status Test', 'Desc', '2026-01-01T00:00:00Z', 'https://example.com/s.jpg', 100, 10, 'PT1M', 'public', 'monetized', '', '')
	`)
	if err != nil {
		t.Fatalf("Failed to insert fixture: %v", err)
	}

	err = app.UpdateVideoMonetizationStatus("v_status", "demonetized", "copyright", []string{"copyright"})
	if err != nil {
		t.Fatalf("UpdateVideoMonetizationStatus returned error: %v", err)
	}

	res, err := app.GetChannelVideosPaginated(1, 10, "recent", "", "", "")
	if err != nil {
		t.Fatalf("GetChannelVideosPaginated error: %v", err)
	}
	videos := res["videos"].([]backend.YTVideo)
	if len(videos) != 1 {
		t.Fatalf("Expected 1 video, got %d", len(videos))
	}
	if videos[0].MonetizationStatus != "demonetized" {
		t.Errorf("Expected status 'demonetized', got %q", videos[0].MonetizationStatus)
	}
	if videos[0].RejectionReason != "copyright" {
		t.Errorf("Expected rejection reason 'copyright', got %q", videos[0].RejectionReason)
	}
}
