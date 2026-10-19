package backend

import (
	"testing"
)

func TestResolveAppDirName(t *testing.T) {
	if got := resolveAppDirName(false); got != "AmonHen" {
		t.Errorf("resolveAppDirName(false) = %q; want %q", got, "AmonHen")
	}
	if got := resolveAppDirName(true); got != "AmonHen-Dev" {
		t.Errorf("resolveAppDirName(true) = %q; want %q", got, "AmonHen-Dev")
	}
}

func TestResolveMutexName(t *testing.T) {
	if got := resolveMutexName(false); got != `Local\AmonHenSingleInstance` {
		t.Errorf("resolveMutexName(false) = %q; want %q", got, `Local\AmonHenSingleInstance`)
	}
	if got := resolveMutexName(true); got != `Local\AmonHenSingleInstance_Dev` {
		t.Errorf("resolveMutexName(true) = %q; want %q", got, `Local\AmonHenSingleInstance_Dev`)
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

func TestAppDirNameMatchesBuildTag(t *testing.T) {
	expected := resolveAppDirName(isDevBuild)
	if got := appDirName(); got != expected {
		t.Errorf("appDirName() = %q; want %q", got, expected)
	}
}

func TestWindowTitleMatchesBuildTag(t *testing.T) {
	expected := resolveWindowTitle(isDevBuild)
	if got := WindowTitle(); got != expected {
		t.Errorf("WindowTitle() = %q; want %q", got, expected)
	}
}
