package backend

func resolveAppDirName(dev bool) string {
	if dev {
		return "AmonHen-Dev"
	}
	return "AmonHen"
}

func resolveMutexName(dev bool) string {
	if dev {
		return `Local\AmonHenSingleInstance_Dev`
	}
	return `Local\AmonHenSingleInstance`
}

func resolveWindowTitle(dev bool) string {
	if dev {
		return "Amon-Hen [DEV]"
	}
	return "Amon-Hen"
}

func resolveTrayTooltip(dev bool) string {
	if dev {
		return "Amon-Hen [DEV] — video manager"
	}
	return "Amon-Hen — video manager"
}

func appDirName() string {
	return resolveAppDirName(isDevBuild)
}

// WindowTitle returns the application window title depending on whether
// it is running in development mode or production.
func WindowTitle() string {
	return resolveWindowTitle(isDevBuild)
}
