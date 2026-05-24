//go:build windows

package backend

import (
	"syscall"
	"unsafe"
)

var (
	_kernel32    = syscall.NewLazyDLL("kernel32.dll")
	_createMutex = _kernel32.NewProc("CreateMutexW")
)

// AcquireSingleInstanceLock tries to create a named Windows mutex.
// Returns true if this is the first (and only) instance.
// Returns false if another instance is already running.
//
// The mutex is intentionally never released so it lives for the
// entire process lifetime and is cleaned up automatically by Windows
// when the process exits.
func AcquireSingleInstanceLock() bool {
	name, _ := syscall.UTF16PtrFromString("Local\\AmonHenSingleInstance")
	_, _, err := _createMutex.Call(
		0,                             // lpMutexAttributes (nil)
		1,                             // bInitialOwner = TRUE
		uintptr(unsafe.Pointer(name)),
	)

	// ERROR_ALREADY_EXISTS is 0xB7 (183).
	// When the mutex already exists, CreateMutexW returns a valid handle
	// but sets the last error to ERROR_ALREADY_EXISTS.
	const errorAlreadyExists = syscall.Errno(183)
	return err != errorAlreadyExists
}
