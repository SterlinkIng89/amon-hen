package backend

import (
	"fmt"
	"regexp"
	"strconv"
)

// ── Date extraction helpers ──────────────────────────────────────────────────
//
// extractTitleDate attempts to parse a recording date from a video title.
// It returns a zero-padded "YYYY-MM-DD" string, or "" if no date is found.
//
// Supported formats (in priority order):
//  1. Explicit ISO:        "YYYY-MM-DD"   (e.g. "2024-06-27")
//  2. Compact ISO:         "YYYYMMDD"     (e.g. "20240627") — 8 consecutive digits
//  3. DD/MM/YYYY or DD/MM/YY with various separators (/, ／, ∕, ⁄, -, .)
//  4. Space-separated:     "YYYY MM DD"   (e.g. "2023 10 09")
//
// The function deliberately avoids false-matching partial numbers inside longer
// numeric strings (e.g. won't treat "2023" inside "2023-10-07" as the day).

// reISO matches an explicit ISO date:  YYYY-MM-DD
var reISO = regexp.MustCompile(`\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b`)

// reCompact matches 8 consecutive digit sequences that look like YYYYMMDD.
// We allow them at a word boundary so we don't grab 9+ digit numbers.
var reCompact = regexp.MustCompile(`\b(\d{4})(\d{2})(\d{2})\b`)

// reDMY matches DD/MM/YY or DD/MM/YYYY where the first group is 1–2 digits
// (i.e. a day, NOT a 4-digit year). We use a negative look-behind simulation
// by requiring the match to not be preceded by a digit (handled via \b).
var reDMY = regexp.MustCompile(`\b(\d{1,2})[/／∕⁄.\-](\d{1,2})[/／∕⁄.\-](\d{2,4})\b`)

// reSpaceYMD matches "YYYY MM DD" style (space separated, year first).
var reSpaceYMD = regexp.MustCompile(`\b(\d{4})\s+(\d{1,2})\s+(\d{1,2})\b`)

func extractTitleDate(title string) string {
	// ── 1. Explicit ISO: YYYY-MM-DD ─────────────────────────────────────────
	if m := reISO.FindStringSubmatch(title); m != nil {
		y, mo, d := m[1], m[2], m[3]
		if isValidDate(y, mo, d) {
			return fmt.Sprintf("%s-%02s-%02s", y, zeroPad(mo), zeroPad(d))
		}
	}

	// ── 2. Compact YYYYMMDD ─────────────────────────────────────────────────
	if m := reCompact.FindStringSubmatch(title); m != nil {
		y, mo, d := m[1], m[2], m[3]
		if isValidDate(y, mo, d) {
			return fmt.Sprintf("%s-%s-%s", y, mo, d)
		}
	}

	// ── 3. Space-separated YYYY MM DD ───────────────────────────────────────
	if m := reSpaceYMD.FindStringSubmatch(title); m != nil {
		y, mo, d := m[1], m[2], m[3]
		if isValidDate(y, mo, d) {
			return fmt.Sprintf("%s-%02s-%02s", y, zeroPad(mo), zeroPad(d))
		}
	}

	// ── 4. DD/MM/YY or DD/MM/YYYY ───────────────────────────────────────────
	// We try all matches and pick the first valid one, skipping any that would
	// produce a 4-digit "day" (which means the regex accidentally matched a
	// YYYY-first pattern that wasn't caught by step 1).
	all := reDMY.FindAllStringSubmatch(title, -1)
	for _, m := range all {
		part1, part2, part3 := m[1], m[2], m[3]
		// Skip if the first group looks like a 4-digit year — that means we
		// matched something like "2023-10-07" that the ISO regex missed.
		if len(part1) == 4 {
			continue
		}
		// Interpret as DD / MM / YY or YYYY
		day, month, year := part1, part2, part3
		if len(year) == 2 {
			year = "20" + year
		}
		if isValidDate(year, month, day) {
			return fmt.Sprintf("%s-%s-%s", year, zeroPad(month), zeroPad(day))
		}
	}

	return ""
}

// zeroPad ensures a numeric string is at least 2 characters wide.
func zeroPad(s string) string {
	if len(s) == 1 {
		return "0" + s
	}
	return s
}

// isValidDate does a basic sanity-check on year/month/day strings.
func isValidDate(year, month, day string) bool {
	y, err1 := strconv.Atoi(year)
	mo, err2 := strconv.Atoi(month)
	d, err3 := strconv.Atoi(day)
	if err1 != nil || err2 != nil || err3 != nil {
		return false
	}
	return y >= 2000 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31
}
