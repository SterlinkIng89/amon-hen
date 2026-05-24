//go:build !windows

package backend

import "errors"

// GetAutoLaunch always returns false on non-Windows platforms.
func (a *App) GetAutoLaunch() bool { return false }

// SetAutoLaunch is a no-op on non-Windows platforms.
func (a *App) SetAutoLaunch(_ bool) error {
	return errors.New("auto-launch is only supported on Windows")
}
