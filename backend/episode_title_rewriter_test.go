package backend

import (
	"testing"
)

func TestRewriteTitleEpisode(t *testing.T) {
	tests := []struct {
		name       string
		title      string
		sep        string
		newEpisode int
		wantTitle  string
		wantOK     bool
	}{
		{
			name:       "Preserves date with same number as episode",
			title:      "Persona 3 Reload - 10/08/26 - 26",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload - 10/08/26 - 27",
			wantOK:     true,
		},
		{
			name:       "Trailing standalone closing marker preserved",
			title:      "Persona 3 Reload - 11/08/26 - 26 - End",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload - 11/08/26 - 27 - End",
			wantOK:     true,
		},
		{
			name:       "Explicit Ep prefix preserved",
			title:      "Persona 3 Reload - 10/08/26 - Ep. 26",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload - 10/08/26 - Ep. 27",
			wantOK:     true,
		},
		{
			name:       "Explicit hash prefix preserved",
			title:      "Persona 3 Reload - 10/08/26 - #26",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload - 10/08/26 - #27",
			wantOK:     true,
		},
		{
			name:       "Inline closing marker preserved",
			title:      "Persona 3 Reload - 10/08/26 - 26 (Final)",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload - 10/08/26 - 27 (Final)",
			wantOK:     true,
		},
		{
			name:       "Custom pipe separator",
			title:      "Persona 3 Reload | 10/08/26 | 26",
			sep:        "|",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload | 10/08/26 | 27",
			wantOK:     true,
		},
		{
			name:       "En-dash separator variant",
			title:      "Persona 3 Reload – 10/08/26 – 26",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload – 10/08/26 – 27",
			wantOK:     true,
		},
		{
			name:       "Em-dash separator variant",
			title:      "Persona 3 Reload — 10/08/26 — 26",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload — 10/08/26 — 27",
			wantOK:     true,
		},
		{
			name:       "Returns false when no episode exists in title",
			title:      "Persona 3 Reload - 2026-08-10",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "Persona 3 Reload - 2026-08-10",
			wantOK:     false,
		},
		{
			name:       "Returns false on empty title or negative episode",
			title:      "",
			sep:        " - ",
			newEpisode: 27,
			wantTitle:  "",
			wantOK:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotTitle, gotOK := rewriteTitleEpisode(tt.title, tt.sep, tt.newEpisode)
			if gotOK != tt.wantOK {
				t.Fatalf("rewriteTitleEpisode(%q, %q, %d) ok = %v, want %v", tt.title, tt.sep, tt.newEpisode, gotOK, tt.wantOK)
			}
			if gotTitle != tt.wantTitle {
				t.Errorf("rewriteTitleEpisode(%q, %q, %d) title = %q, want %q", tt.title, tt.sep, tt.newEpisode, gotTitle, tt.wantTitle)
			}
		})
	}
}
