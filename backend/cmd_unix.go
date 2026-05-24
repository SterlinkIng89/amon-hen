//go:build !windows

package backend

import (
	"os/exec"
)

func hideWindow(cmd *exec.Cmd) {
	// Not needed on Unix
}
