package backend

import (
	"testing"
)

func TestAppDirName(t *testing.T) {
	if got := appDirName(); got != "AmonHen" {
		t.Errorf("appDirName() = %q; want %q", got, "AmonHen")
	}
}

func TestSingleMutexName(t *testing.T) {
	if got := singleMutexName(); got != `Local\AmonHenSingleInstance` {
		t.Errorf("singleMutexName() = %q; want %q", got, `Local\AmonHenSingleInstance`)
	}
}

func TestResolveWindowTitle(t *testing.T) {
	if got := resolveWindowTitle(false); got != "Amon-Hen" {
		t.Errorf("resolveWindowTitle(false) = %q; want %q", got, "Amon-Hen")
	}
	if got := resolveWindowTitle(true); got != "Amon-Hen [DEV]" {
		t.Errorf("resolveWindowTitle(true) = %q; want %q", got, "Amon-Hen [DEV]")
	}
}

func TestResolveTrayTooltip(t *testing.T) {
	if got := resolveTrayTooltip(false); got != "Amon-Hen — video manager" {
		t.Errorf("resolveTrayTooltip(false) = %q; want %q", got, "Amon-Hen — video manager")
	}
	if got := resolveTrayTooltip(true); got != "Amon-Hen [DEV] — video manager" {
		t.Errorf("resolveTrayTooltip(true) = %q; want %q", got, "Amon-Hen [DEV] — video manager")
	}
}



func TestWindowTitleMatchesBuildTag(t *testing.T) {
	expected := resolveWindowTitle(isDevBuild)
	if got := WindowTitle(); got != expected {
		t.Errorf("WindowTitle() = %q; want %q", got, expected)
	}
}
