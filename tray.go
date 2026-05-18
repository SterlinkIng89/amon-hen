package main

import (
	"context"
	_ "embed"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// trayIcon is the Windows .ico embedded at compile time.
//
//go:embed build/windows/icon.ico
var trayIcon []byte

// setupTray initialises the system tray. It must be called in a goroutine
// because systray.Run blocks until the tray is destroyed.
//
// ctxCh receives the Wails context once OnStartup fires, allowing us to
// call runtime.* methods after the window is fully ready.
func setupTray(ctxCh <-chan context.Context) {
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
