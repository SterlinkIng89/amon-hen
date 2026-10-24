package backend

const (
	appDataDirName          = "AmonHen"
	singleInstanceMutexName = `Local\AmonHenSingleInstance`
)

// appDirName returns the data directory name.
// Both development and release builds share the same directory ("AmonHen")
// so that configuration, database, logs, and cache data are unified.
func appDirName() string {
	return appDataDirName
}

// singleMutexName returns the named mutex for single-instance enforcement.
// Both development and release builds share the same mutex to prevent
// both instances from running simultaneously and corrupting shared data.
func singleMutexName() string {
	return singleInstanceMutexName
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


// WindowTitle returns the application window title depending on whether
// it is running in development mode or production.
func WindowTitle() string {
	return resolveWindowTitle(isDevBuild)
}
