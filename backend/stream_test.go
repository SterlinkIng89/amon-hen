package backend

import (
	"context"
	"testing"
	"time"
)

func TestStreamServer_Lifecycle(t *testing.T) {
	app := &App{}

	// 1. GetStreamPort before explicit start should auto-start the stream server
	port1 := app.GetStreamPort()
	if port1 <= 0 {
		t.Fatalf("expected positive stream port, got %d", port1)
	}

	// 2. Subsequent call should return the exact same port
	port2 := app.GetStreamPort()
	if port2 != port1 {
		t.Fatalf("expected identical port on second call, got %d vs %d", port2, port1)
	}

	// 3. Shutdown should cleanly stop the server and reset port to 0
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	app.Shutdown(ctx)

	if app.streamPort.Load() != 0 {
		t.Fatalf("expected streamPort to be 0 after shutdown, got %d", app.streamPort.Load())
	}

	// 4. Calling GetStreamPort again after shutdown should re-bind a new valid port
	port3 := app.GetStreamPort()
	if port3 <= 0 {
		t.Fatalf("expected positive stream port on restart, got %d", port3)
	}

	// Clean up
	app.Shutdown(context.Background())
}
