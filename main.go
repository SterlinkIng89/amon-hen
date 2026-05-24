package main

import (
	"context"
	"embed"

	"amon-hen/backend"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Ensure only one instance of the app runs at a time.
	// On Windows this uses a named mutex; on other platforms it is a no-op.
	// A second launch (e.g. clicking the taskbar icon again) will exit here
	// instead of creating a duplicate system-tray entry.
	if !backend.AcquireSingleInstanceLock() {
		return
	}

	// Create an instance of the app structure
	app := backend.NewApp()

	// Channel to pass the Wails context to the system tray goroutine.
	// Buffered so the tray goroutine never blocks if it receives before startup fires.
	ctxCh := make(chan context.Context, 1)

	// Start the system tray in the background.
	// systray.Run blocks, so it must live in its own goroutine.
	go backend.SetupTray(ctxCh)

	// Wrap the startup hook so we can forward the context to the tray.
	startupWithTray := func(ctx context.Context) {
		app.Startup(ctx)
		ctxCh <- ctx
	}

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "Amon-Hen",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		// Closing the window hides it instead of quitting — the tray keeps the app alive.
		HideWindowOnClose: true,
		OnStartup:         startupWithTray,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
