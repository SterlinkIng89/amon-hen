package backend

import (
	"testing"
)

func TestParseEpisodeFromTitle(t *testing.T) {
	tests := []struct {
		name         string
		title        string
		sep          string
		wantEpisode  int
		wantOK       bool
	}{
		// ── Standard Hyphen Separator ──────────────────────────────────────────
		{
			name:        "standard hyphen with episode",
			title:       "Persona 3 Reload - 21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},
		{
			name:        "standard hyphen with episode and empty sep param",
			title:       "Persona 3 Reload - 21",
			sep:         "",
			wantEpisode: 21,
			wantOK:      true,
		},

		// ── Em-dash Separators ────────────────────────────────────────────────
		{
			name:        "em-dash with spaces and episode",
			title:       "Persona 3 Reload — 21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},
		{
			name:        "em-dash without spaces and episode",
			title:       "Persona 3 Reload—21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},

		// ── En-dash Separators ────────────────────────────────────────────────
		{
			name:        "en-dash with spaces and episode",
			title:       "Persona 3 Reload – 21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},
		{
			name:        "en-dash without spaces and episode",
			title:       "Persona 3 Reload–21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},

		// ── Pipe Separators ───────────────────────────────────────────────────
		{
			name:        "pipe with spaces and episode",
			title:       "Persona 3 Reload | 21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},
		{
			name:        "pipe without spaces and episode",
			title:       "Persona 3 Reload|21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},

		// ── Compound Titles with Dates and Multiple Separators ─────────────────
		{
			name:        "em-dash then hyphen with date and episode",
			title:       "Persona 3 Reload — 6/08/26 - 21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},
		{
			name:        "em-dash then hyphen with 2-digit day date and episode",
			title:       "Persona 3 Reload — 21/07/26 - 4",
			sep:         " - ",
			wantEpisode: 4,
			wantOK:      true,
		},
		{
			name:        "hyphens with date and episode",
			title:       "Hades - 3/05/26 - 4",
			sep:         " - ",
			wantEpisode: 4,
			wantOK:      true,
		},
		{
			name:        "pipes with date and episode",
			title:       "Persona 3 Reload | 6/08/26 | 21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},
		{
			name:        "en-dashes with date and episode",
			title:       "Persona 3 Reload – 6/08/26 – 21",
			sep:         " - ",
			wantEpisode: 21,
			wantOK:      true,
		},

		// ── Titles with Dates ONLY (Must NOT extract date as episode) ─────────
		{
			name:        "em-dash with date only (6/08/26 must not parse as 6 or 26)",
			title:       "Persona 3 Reload — 6/08/26",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "hyphen with date only (21/07/26 must not parse as 21 or 26)",
			title:       "Persona 3 Reload - 21/07/26",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "hyphen with ISO date only",
			title:       "Persona 3 Reload - 2026-08-06",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "hyphen with compact ISO date only",
			title:       "Persona 3 Reload - 20260806",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "hyphen with dotted date only",
			title:       "Persona 3 Reload - 2026.08.06",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},

		// ── Year Exclusion (Bare 1990-2099 numbers without prefix) ─────────────
		{
			name:        "showcase with bare year 2024",
			title:       "Showcase - 2024",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "stream with bare year 2026",
			title:       "Game Stream - 2026",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "showcase with explicit Ep 2024 overrides year exclusion",
			title:       "Showcase - Ep 2024",
			sep:         " - ",
			wantEpisode: 2024,
			wantOK:      true,
		},

		// ── Explicit Regex Markers ────────────────────────────────────────────
		{
			name:        "ep with dot",
			title:       "Control Gameplay Ep. 7",
			sep:         " - ",
			wantEpisode: 7,
			wantOK:      true,
		},
		{
			name:        "ep without dot",
			title:       "Control Gameplay Ep 7",
			sep:         " - ",
			wantEpisode: 7,
			wantOK:      true,
		},
		{
			name:        "episode word",
			title:       "Control Gameplay Episode 7",
			sep:         " - ",
			wantEpisode: 7,
			wantOK:      true,
		},
		{
			name:        "episodio word (spanish)",
			title:       "Control Gameplay Episodio 7",
			sep:         " - ",
			wantEpisode: 7,
			wantOK:      true,
		},
		{
			name:        "parte word (spanish)",
			title:       "Control Gameplay Parte 8",
			sep:         " - ",
			wantEpisode: 8,
			wantOK:      true,
		},
		{
			name:        "part word",
			title:       "Control Gameplay Part 8",
			sep:         " - ",
			wantEpisode: 8,
			wantOK:      true,
		},
		{
			name:        "hash at end",
			title:       "Control Final Boss #9",
			sep:         " - ",
			wantEpisode: 9,
			wantOK:      true,
		},
		{
			name:        "hash after hyphen",
			title:       "Control - #9",
			sep:         " - ",
			wantEpisode: 9,
			wantOK:      true,
		},
		{
			name:        "pipe with explicit episode prefix",
			title:       "Elden Ring | Episode 12",
			sep:         " - ",
			wantEpisode: 12,
			wantOK:      true,
		},

		// ── Custom Configured Separator ───────────────────────────────────────
		{
			name:        "custom slash separator",
			title:       "Game // 15",
			sep:         " // ",
			wantEpisode: 15,
			wantOK:      true,
		},
		{
			name:        "custom slash separator with date",
			title:       "Game // 6/08/26 // 15",
			sep:         " // ",
			wantEpisode: 15,
			wantOK:      true,
		},

		// ── False Positive / Negative Edge Cases ──────────────────────────────
		{
			name:        "empty title",
			title:       "",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "whitespace only title",
			title:       "   ",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "game title with year/number and no separator",
			title:       "Cyberpunk 2077",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "game title with sequel number and no separator",
			title:       "Overwatch 2",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "game title with number and subtitle",
			title:       "Persona 3 Reload",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "game title with roman numerals",
			title:       "Final Fantasy VII Rebirth",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "zero episode should not be valid",
			title:       "Game - 0",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "negative episode should not be valid",
			title:       "Game - -5",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},

		// ── Trailing Closing Markers (Issue #204) ─────────────────────────────
		{
			name:        "trailing End marker after date and episode",
			title:       "Neva - 14/09/26 - 6 - End",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Final marker with pipe",
			title:       "Game - 6 | Final",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Finale marker with em-dash",
			title:       "Game - 6 — Finale",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Fin marker with hyphen",
			title:       "Game - 6 - Fin",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing End marker in parentheses in segment",
			title:       "Game - 6 (End)",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Final marker in brackets in segment",
			title:       "Game - 6 [Final]",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing End marker inline with space in segment",
			title:       "Game - 6 End",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "explicit episode with inline End marker",
			title:       "Game Ep 6 End",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Spanish Parte Final marker",
			title:       "Game - 6 - Parte Final",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Epílogo marker",
			title:       "Game - 6 - Epílogo",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Last marker",
			title:       "Game - 6 - Last",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "trailing Conclusion marker",
			title:       "Game - 6 - Conclusion",
			sep:         " - ",
			wantEpisode: 6,
			wantOK:      true,
		},
		{
			name:        "closing marker only without number must return no episode (End)",
			title:       "Game - End",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "closing marker only without number must return no episode (Final)",
			title:       "Game - Final",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "bare closing marker title",
			title:       "The End",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
		{
			name:        "year with trailing closing marker must not parse year",
			title:       "Game - 2026 - End",
			sep:         " - ",
			wantEpisode: 0,
			wantOK:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotEp, gotOK := parseEpisodeFromTitle(tt.title, tt.sep)
			if gotEp != tt.wantEpisode || gotOK != tt.wantOK {
				t.Errorf("parseEpisodeFromTitle(%q, %q) = (%d, %t); want (%d, %t)",
					tt.title, tt.sep, gotEp, gotOK, tt.wantEpisode, tt.wantOK)
			}
		})
	}
}
