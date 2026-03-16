package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}




type VideoFile struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64 `json:"size"`
}

func (a *App) GetVideos(dirPath string) ([]VideoFile, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	var videos []VideoFile

	for _,entry := range entries {
		if !entry.IsDir() {
			ext := filepath.Ext(entry.Name())
			if ext == ".mp4" || ext == ".mkv" {
				info, _ := entry.Info()
				videos = append(videos, VideoFile{
					Name: entry.Name(),
					Path: filepath.Join(dirPath, entry.Name()),
					Size: info.Size(),
				})

				
			}
		}
	}

	return videos, nil
}

// GetThumbnail generates a base64 encoded thumbnail for a video file
func (a *App) GetThumbnail(path string) (string, error) {
	// Check if ffmpeg is available
	/* _, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", fmt.Errorf("ffmpeg not found: %w", err)
	} */



	// Create command to extract a single frame at 00:00:01
	// -ss 00:00:01 : Seek to 1 second
	// -i path      : Input file
	// -vframes 1   : Output 1 frame
	// -f image2    : Force image2 format
	// -c:v png     : Use PNG codec
	// -            : Output to stdout
	cmd := exec.Command("ffmpeg", "-ss", "00:00:01", "-i", path, "-vframes", "1", "-f", "image2", "-c:v", "png", "-")
	
	var buffer bytes.Buffer
	cmd.Stdout = &buffer
	
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate thumbnail: %w", err)
	}

	// Encode to base64
	encoded := base64.StdEncoding.EncodeToString(buffer.Bytes())
	return "data:image/png;base64," + encoded, nil
}

// GetVideoPreview generates a 5x5 sprite sheet preview for a video file
func (a *App) GetVideoPreview(path string) (string, error) {
	// Using ffmpeg to generate a 5x5 tile grid
	// select=not(mod(n\,100)) selects every 100th frame
	// scale=160:-1 scales each frame width to 160px (keeping aspect ratio)
	// tile=5x5 arranges them in a grid
	// -frames:v 1 ensures output is a single image
	
	// Note: mod(n,100) syntax for exec.Command vs shell. 
	// We use "select=not(mod(n,100)),scale=160:-1,tile=5x5" directly.
	
	cmd := exec.Command("ffmpeg", 
		"-i", path, 
		"-vf", "select=not(mod(n,100)),scale=160:-1,tile=5x5", 
		"-frames:v", "1", 
		"-q:v", "5", 
		"-f", "image2", 
		"-c:v", "mjpeg", 
		"-")
	
	var buffer bytes.Buffer
	cmd.Stdout = &buffer
	
	// Capture stderr for debugging if needed, but primarily we want to run it.
	// For production, better error handling is needed.
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate preview: %w", err)
	}

	encoded := base64.StdEncoding.EncodeToString(buffer.Bytes())
	// Use jpeg mimetype since we used mjpeg code
	return "data:image/jpeg;base64," + encoded, nil
}
