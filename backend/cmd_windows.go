//go:build windows

package backend

import (
	"os/exec"
	"syscall"
)

// BELOW_NORMAL_PRIORITY_CLASS gives ffmpeg/ffprobe lower CPU scheduling priority
// than the main app process. This prevents thumbnail generation from starving the
// WebView2 paint/composite thread, which causes window-move stutter on Windows.
const belowNormalPriorityClass = 0x00004000

func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags = belowNormalPriorityClass
}
