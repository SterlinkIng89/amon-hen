package backend

import (
	"regexp"
	"strconv"
	"strings"
)

var defaultSepRegex = regexp.MustCompile(`\s+-\s+|\s*[—–|]\s*`)
var standaloneClosingMarkerRegex = regexp.MustCompile(`(?i)^(?:end|ending|final|finale|fin|last|conclusion|epilogue|epílogo|parte\s+final)$`)
var inlineClosingMarkerRegex = regexp.MustCompile(`(?i)(?:[\s(\[–—|:-]+)(?:end|ending|final|finale|fin|last|conclusion|epilogue|epílogo|parte\s+final)(?:[\s)\]!.]*)$`)

func isYearNumber(val string, n int) bool {
	return len(val) == 4 && n >= 1990 && n <= 2099
}

func isCompactDate(val string) bool {
	return len(val) == 8 && extractTitleDate(val) != ""
}

func matchExplicitEpisode(s string) (int, bool) {
	if m := epRegex1.FindStringSubmatch(s); len(m) > 1 {
		if n, err := strconv.Atoi(m[1]); err == nil && n > 0 {
			return n, true
		}
	}
	if m := epRegex2.FindStringSubmatch(s); len(m) > 1 {
		if n, err := strconv.Atoi(m[1]); err == nil && n > 0 {
			return n, true
		}
	}
	return 0, false
}

func splitTitleSegments(title, sep string) []string {
	cleanSep := strings.TrimSpace(sep)
	if cleanSep != "" && cleanSep != "-" && cleanSep != "—" && cleanSep != "–" && cleanSep != "|" {
		pattern := `\s+-\s+|\s*[—–|]\s*|\s*` + regexp.QuoteMeta(cleanSep) + `\s*`
		if re, err := regexp.Compile(pattern); err == nil {
			return re.Split(title, -1)
		}
	}
	return defaultSepRegex.Split(title, -1)
}

// parseEpisodeFromTitle extracts an episode number (> 0) from a video title.
// Supports dash variants (" - ", " — ", " – "), pipes (" | "), custom separators,
// trailing closing markers (End, Ending, Final, Finale, Fin, Last, Conclusion, Epilogue),
// and explicit episode markers (Ep, Episode, Episodio, Part, Parte, #).
// Dates (e.g. 6/08/26, 21/07/26, 2026-08-06, 20260806) and bare calendar years (1990–2099)
// are strictly excluded from being parsed as episode numbers.
func parseEpisodeFromTitle(title, sep string) (episode int, ok bool) {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return 0, false
	}

	segments := splitTitleSegments(trimmed, sep)

	// Strip standalone trailing closing markers from the segments (e.g. "Title - 6 - End")
	for len(segments) > 1 {
		last := strings.Trim(strings.TrimSpace(segments[len(segments)-1]), " ()[]{}.!¡?¿")
		if standaloneClosingMarkerRegex.MatchString(last) {
			segments = segments[:len(segments)-1]
		} else {
			break
		}
	}

	if len(segments) > 1 {
		lastSeg := strings.TrimSpace(segments[len(segments)-1])
		if ep, found := matchExplicitEpisode(lastSeg); found {
			return ep, true
		}

		cleanedLastSeg := lastSeg
		if inlineClosingMarkerRegex.MatchString(cleanedLastSeg) {
			cleanedLastSeg = strings.TrimSpace(inlineClosingMarkerRegex.ReplaceAllString(cleanedLastSeg, ""))
			if ep, found := matchExplicitEpisode(cleanedLastSeg); found {
				return ep, true
			}
		}

		if n, err := strconv.Atoi(cleanedLastSeg); err == nil && n > 0 {
			if !isYearNumber(cleanedLastSeg, n) && !isCompactDate(cleanedLastSeg) {
				return n, true
			}
		}
	}

	if ep, found := matchExplicitEpisode(trimmed); found {
		return ep, true
	}
	if inlineClosingMarkerRegex.MatchString(trimmed) {
		cleanTrimmed := strings.TrimSpace(inlineClosingMarkerRegex.ReplaceAllString(trimmed, ""))
		if ep, found := matchExplicitEpisode(cleanTrimmed); found {
			return ep, true
		}
	}

	return 0, false
}
