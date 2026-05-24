//go:build !windows

package backend

// AcquireSingleInstanceLock always returns true on non-Windows platforms.
// Single-instance enforcement is only needed for the Windows build.
func AcquireSingleInstanceLock() bool {
	return true
}
