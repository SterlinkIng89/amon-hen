package backend

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const autoLaunchKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const autoLaunchName = "AmonHen"

// GetAutoLaunch returns true if the app is configured to start with Windows.
func (a *App) GetAutoLaunch() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, autoLaunchKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	val, _, err := k.GetStringValue(autoLaunchName)
	if err != nil || val == "" {
		return false
	}
	return true
}

// SetAutoLaunch enables or disables launching the app on Windows startup.
func (a *App) SetAutoLaunch(enabled bool) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, autoLaunchKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("failed to open registry key: %w", err)
	}
	defer k.Close()

	if enabled {
		exePath, err := os.Executable()
		if err != nil {
			return fmt.Errorf("could not determine executable path: %w", err)
		}
		// Use the absolute resolved path so it survives directory changes.
		exePath, err = filepath.Abs(exePath)
		if err != nil {
			return err
		}
		return k.SetStringValue(autoLaunchName, exePath)
	}
	err = k.DeleteValue(autoLaunchName)
	// If the key doesn't exist that's fine — treat as success.
	if err != nil && err != registry.ErrNotExist {
		return fmt.Errorf("failed to remove registry value: %w", err)
	}
	return nil
}
