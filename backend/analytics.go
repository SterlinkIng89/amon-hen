package backend

import (
	"fmt"
	"regexp"
	"strings"
)

// ChannelAnalytics holds aggregated statistics about the YouTube channel
// computed entirely from the local SQLite database — no extra API calls.
type ChannelAnalytics struct {
	TotalVideos      int64   `json:"totalVideos"`
	TotalViews       int64   `json:"totalViews"`
	TotalLikes       int64   `json:"totalLikes"`
	TotalPlaylists   int64   `json:"totalPlaylists"`
	AvgViewsPerVideo float64 `json:"avgViewsPerVideo"`
	AvgLikesPerVideo float64 `json:"avgLikesPerVideo"`
	LikeRatio        float64 `json:"likeRatio"` // likes / views * 100
	PublicCount      int64   `json:"publicCount"`
	UnlistedCount    int64   `json:"unlistedCount"`
	PrivateCount     int64   `json:"privateCount"`

	// Top N most-viewed videos
	TopVideos []TopVideo `json:"topVideos"`

	// Monthly upload counts for the sparkline (last 12 months)
	UploadTrend []MonthlyCount `json:"uploadTrend"`

	// Daily upload counts for the heatmap (last 365 days)
	DailyTrend      []DailyCount `json:"dailyTrend"`
	TitleDailyTrend []DailyCount `json:"titleDailyTrend"`
}

// TopVideo represents a single entry in the top-viewed videos list.
type TopVideo struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	ThumbnailUrl string `json:"thumbnailUrl"`
	ViewCount    int64  `json:"viewCount"`
	LikeCount    int64  `json:"likeCount"`
	Duration     string `json:"duration"`
	Privacy      string `json:"privacy"`
}

// MonthlyCount holds the number of videos uploaded in a given month.
type MonthlyCount struct {
	Month string `json:"month"` // "YYYY-MM"
	Count int    `json:"count"`
}

// DailyCount holds the number of videos uploaded in a given day.
type DailyCount struct {
	Date  string `json:"date"` // "YYYY-MM-DD"
	Count int    `json:"count"`
}

// GetChannelAnalytics computes channel-wide stats from SQLite.
// No YouTube API calls are made.
func (a *App) GetChannelAnalytics() (*ChannelAnalytics, error) {
	if a.db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	a.db.mu.Lock()
	defer a.db.mu.Unlock()

	result := &ChannelAnalytics{}

	// ── 1. Aggregate totals ──────────────────────────────────────────────────
	row := a.db.conn.QueryRow(`
		SELECT
			COUNT(*),
			COALESCE(SUM(view_count), 0),
			COALESCE(SUM(like_count), 0)
		FROM yt_videos`)
	if err := row.Scan(&result.TotalVideos, &result.TotalViews, &result.TotalLikes); err != nil {
		return nil, fmt.Errorf("aggregate query failed: %w", err)
	}

	if result.TotalVideos > 0 {
		result.AvgViewsPerVideo = float64(result.TotalViews) / float64(result.TotalVideos)
		result.AvgLikesPerVideo = float64(result.TotalLikes) / float64(result.TotalVideos)
	}
	if result.TotalViews > 0 {
		result.LikeRatio = float64(result.TotalLikes) / float64(result.TotalViews) * 100
	}

	// ── 2. Playlist count ────────────────────────────────────────────────────
	a.db.conn.QueryRow(`SELECT COUNT(*) FROM yt_playlists`).Scan(&result.TotalPlaylists)

	// ── 3. Privacy breakdown ─────────────────────────────────────────────────
	privRows, privErr := a.db.conn.Query(`
		SELECT LOWER(COALESCE(privacy, '')), COUNT(*) FROM yt_videos GROUP BY LOWER(COALESCE(privacy, ''))`)
	if privErr == nil {
		for privRows.Next() {
			var priv string
			var cnt int64
			if privRows.Scan(&priv, &cnt) == nil {
				switch {
				case strings.Contains(priv, "public"):
					result.PublicCount += cnt
				case strings.Contains(priv, "unlist"):
					result.UnlistedCount += cnt
				default:
					result.PrivateCount += cnt
				}
			}
		}
		privRows.Close()
	}

	// ── 4. Top 8 most-viewed videos ──────────────────────────────────────────
	topRows, topErr := a.db.conn.Query(`
		SELECT id, title, COALESCE(thumbnail_url,''), view_count, like_count, COALESCE(duration,''), COALESCE(privacy,'')
		FROM yt_videos
		ORDER BY view_count DESC
		LIMIT 8`)
	if topErr == nil {
		for topRows.Next() {
			var v TopVideo
			if topRows.Scan(&v.ID, &v.Title, &v.ThumbnailUrl, &v.ViewCount, &v.LikeCount, &v.Duration, &v.Privacy) == nil {
				result.TopVideos = append(result.TopVideos, v)
			}
		}
		topRows.Close()
	}

	// ── 5. Upload trend — videos per month for the past 12 months ───────────
	// published_at is stored as an ISO-8601 string; substr(x,1,7) gives "YYYY-MM".
	trendRows, trendErr := a.db.conn.Query(`
		SELECT substr(published_at, 1, 7) AS month, COUNT(*) AS cnt
		FROM yt_videos
		WHERE published_at >= date('now', '-12 months')
		GROUP BY month
		ORDER BY month ASC`)
	if trendErr == nil {
		for trendRows.Next() {
			var mc MonthlyCount
			if trendRows.Scan(&mc.Month, &mc.Count) == nil {
				result.UploadTrend = append(result.UploadTrend, mc)
			}
		}
		trendRows.Close()
	}

	// ── 6. Daily Trends (Upload vs Title Dates) ──────────────────────────────
	rows, err := a.db.conn.Query(`SELECT title, substr(published_at, 1, 10) FROM yt_videos`)
	if err == nil {
		uploadCounts := make(map[string]int)
		titleCounts := make(map[string]int)

		// Regex to find DD/MM/YY
		re := regexp.MustCompile(`(\d{2})/(\d{2})/(\d{2})`)

		for rows.Next() {
			var title, pubDate string
			if err := rows.Scan(&title, &pubDate); err == nil {
				// Upload Date count
				if pubDate != "" {
					uploadCounts[pubDate]++
				}

				// Title Date count
				matches := re.FindStringSubmatch(title)
				if len(matches) == 4 {
					// DD = matches[1], MM = matches[2], YY = matches[3]
					// Convert to YYYY-MM-DD
					titleDate := fmt.Sprintf("20%s-%s-%s", matches[3], matches[2], matches[1])
					titleCounts[titleDate]++
				}
			}
		}
		rows.Close()

		for date, count := range uploadCounts {
			result.DailyTrend = append(result.DailyTrend, DailyCount{Date: date, Count: count})
		}
		for date, count := range titleCounts {
			result.TitleDailyTrend = append(result.TitleDailyTrend, DailyCount{Date: date, Count: count})
		}
	}

	return result, nil
}
