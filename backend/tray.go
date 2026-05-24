//go:build windows

package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"

	"github.com/energye/systray"
	"github.com/gen2brain/beeep"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"context"
	_ "embed"
)

// trayIcon is the Windows .ico embedded at compile time.
//
//go:embed icon.ico
var trayIcon []byte

// appIconPath is the .ico written to a temp file so beeep can reference it for toast notifications.
var appIconPath string

// uploadProgressPct tracks the current upload progress (0 = idle, -1 = error/done).
var uploadProgressPct atomic.Int32

func init() {
	// Write the embedded icon to a temp file once so beeep can use it for notifications.
	tmp := filepath.Join(os.TempDir(), "amon-hen-icon.ico")
	if err := os.WriteFile(tmp, trayIcon, 0644); err == nil {
		appIconPath = tmp
	}
}

// SetupTray initialises the system tray. It must be called in a goroutine
// because systray.Run blocks until the tray is destroyed.
//
// ctxCh receives the Wails context once OnStartup fires, allowing us to
// call runtime.* methods after the window is fully ready.
func SetupTray(ctxCh <-chan context.Context) {
	// ctx will be populated once the Wails window is ready.
	var ctx context.Context

	onReady := func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("Amon-Hen")
		systray.SetTooltip("Amon-Hen — video manager")

		// Also show the window when the tray icon itself is left-clicked.
		systray.SetOnClick(func(menu systray.IMenu) {
			if ctx != nil {
				runtime.WindowShow(ctx)
			}
		})

		mShow := systray.AddMenuItem("Open Amon-Hen", "Show the main window")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Quit", "Exit the application")

		mShow.Click(func() {
			if ctx != nil {
				runtime.WindowShow(ctx)
			}
		})

		mQuit.Click(func() {
			if ctx != nil {
				runtime.Quit(ctx)
			}
		})

		// Wait for the Wails context in the background.
		go func() {
			ctx = <-ctxCh
		}()
	}

	onExit := func() {}

	systray.Run(onReady, onExit)
}

// ShowUploadNotification sends a Windows toast notification when an upload completes.
// Called by the frontend via Wails binding.
func (a *App) ShowUploadNotification(title string, videoTitle string) {
	body := fmt.Sprintf("%s is now live on YouTube.", videoTitle)
	if err := beeep.Notify(title, body, appIconPath); err != nil {
		fmt.Println("Notification error:", err)
	}
}

// SetTrayUploadProgress updates the tray icon title to show upload progress.
// Pass -1 to clear it back to the default title.
func (a *App) SetTrayUploadProgress(percent int) {
	if percent < 0 {
		systray.SetTitle("Amon-Hen")
		systray.SetTooltip("Amon-Hen — video manager")
		uploadProgressPct.Store(0)
	} else {
		uploadProgressPct.Store(int32(percent))
		systray.SetTitle(fmt.Sprintf("Amon-Hen [%d%%]", percent))
		systray.SetTooltip(fmt.Sprintf("Uploading… %d%%", percent))
	}
}
