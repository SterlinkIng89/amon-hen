package backend

import (
	"regexp"
	"strconv"
	"strings"
)

var bareDigitsRegex = regexp.MustCompile(`\b(\d+)\b`)

// rewriteTitleEpisode replaces the episode number in title with newEpisode,
// following the exact segment and marker extraction rules of parseEpisodeFromTitle.
// Returns the updated title and true if successfully replaced, or original title and false if not found.
func rewriteTitleEpisode(title, sep string, newEpisode int) (string, bool) {
	if newEpisode <= 0 || strings.TrimSpace(title) == "" {
		return title, false
	}

	targetEp, ok := parseEpisodeFromTitle(title, sep)
	if !ok {
		return title, false
	}

	cleanSep := strings.TrimSpace(sep)
	var sepRe *regexp.Regexp
	if cleanSep != "" && cleanSep != "-" && cleanSep != "—" && cleanSep != "–" && cleanSep != "|" {
		pattern := `\s+-\s+|\s*[—–|]\s*|\s*` + regexp.QuoteMeta(cleanSep) + `\s*`
		sepRe, _ = regexp.Compile(pattern)
	}
	if sepRe == nil {
		sepRe = defaultSepRegex
	}

	// Find segment spans in title
	type span struct {
		start int
		end   int
	}

	sepMatches := sepRe.FindAllStringIndex(title, -1)
	var segmentSpans []span
	currStart := 0
	for _, m := range sepMatches {
		segmentSpans = append(segmentSpans, span{start: currStart, end: m[0]})
		currStart = m[1]
	}
	segmentSpans = append(segmentSpans, span{start: currStart, end: len(title)})

	// Discard standalone trailing closing markers (e.g., "End", "Final") from the end
	activeIdx := len(segmentSpans) - 1
	for activeIdx > 0 {
		segText := strings.Trim(strings.TrimSpace(title[segmentSpans[activeIdx].start:segmentSpans[activeIdx].end]), " ()[]{}.!¡?¿")
		if standaloneClosingMarkerRegex.MatchString(segText) {
			activeIdx--
		} else {
			break
		}
	}

	if activeIdx < 0 {
		return title, false
	}

	targetSegSpan := segmentSpans[activeIdx]
	segText := title[targetSegSpan.start:targetSegSpan.end]

	var digitSpan *span

	if m := epRegex1.FindStringSubmatchIndex(segText); len(m) >= 4 && m[2] >= 0 {
		if val, err := strconv.Atoi(segText[m[2]:m[3]]); err == nil && val == targetEp {
			digitSpan = &span{start: targetSegSpan.start + m[2], end: targetSegSpan.start + m[3]}
		}
	} else if m := epRegex2.FindStringSubmatchIndex(segText); len(m) >= 4 && m[2] >= 0 {
		if val, err := strconv.Atoi(segText[m[2]:m[3]]); err == nil && val == targetEp {
			digitSpan = &span{start: targetSegSpan.start + m[2], end: targetSegSpan.start + m[3]}
		}
	}

	if digitSpan == nil {
		cleanedSegText := segText
		if inlineClosingMarkerRegex.MatchString(cleanedSegText) {
			cleanedSegText = inlineClosingMarkerRegex.ReplaceAllString(cleanedSegText, "")
		}

		allMatches := bareDigitsRegex.FindAllStringSubmatchIndex(cleanedSegText, -1)
		for i := len(allMatches) - 1; i >= 0; i-- {
			m := allMatches[i]
			valStr := cleanedSegText[m[2]:m[3]]
			if val, err := strconv.Atoi(valStr); err == nil && val == targetEp {
				if !isYearNumber(valStr, val) && !isCompactDate(valStr) {
					digitSpan = &span{start: targetSegSpan.start + m[2], end: targetSegSpan.start + m[3]}
					break
				}
			}
		}
	}

	if digitSpan == nil {
		allMatches := bareDigitsRegex.FindAllStringSubmatchIndex(title, -1)
		for i := len(allMatches) - 1; i >= 0; i-- {
			m := allMatches[i]
			valStr := title[m[2]:m[3]]
			if val, err := strconv.Atoi(valStr); err == nil && val == targetEp {
				if !isYearNumber(valStr, val) && !isCompactDate(valStr) {
					digitSpan = &span{start: m[2], end: m[3]}
					break
				}
			}
		}
	}

	if digitSpan == nil {
		return title, false
	}

	newStr := title[:digitSpan.start] + strconv.Itoa(newEpisode) + title[digitSpan.end:]

	verifiedEp, verifiedOK := parseEpisodeFromTitle(newStr, sep)
	if !verifiedOK || verifiedEp != newEpisode {
		return title, false
	}

	return newStr, true
}
