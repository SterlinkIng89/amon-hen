//go:build !windows

package backend

import "context"

// SetupTray is a no-op on non-Windows platforms.
func SetupTray(_ <-chan context.Context) {}

// ShowUploadNotification is a no-op on non-Windows platforms.
func (a *App) ShowUploadNotification(_ string, _ string) {}

// SetTrayUploadProgress is a no-op on non-Windows platforms.
func (a *App) SetTrayUploadProgress(_ int) {}
