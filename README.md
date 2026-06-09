# Amon Hen

> A desktop app for gamers who upload — scan your local video library, tag gameplay clips by game and episode, and push them straight to YouTube.

Built with [Wails v2](https://wails.io/) (Go backend + React/TypeScript frontend), SQLite for local data, and the YouTube Data API v3.

---

## Features

| Feature | Details |
|---|---|
| **Multi-folder library** | Add multiple video source folders. Filter, search, and sort your clips from a single view |
| **Game tagging & episodes** | Tag videos with a game name; the app auto-assigns sequential episode numbers, including against your existing YouTube channel history |
| **YouTube upload** | Upload videos with title, description, privacy, and playlist in one click — or queue several for sequential upload |
| **Playlist management** | Create, assign, and delete YouTube playlists; dedup logic prevents accidental duplicates |
| **Channel sync** | Pull your full YouTube channel video & playlist data into a local SQLite database (syncs at most every 12 h to protect API quota) |
| **Local video player** | Stream and preview videos directly inside the app via a built-in HTTP stream server |
| **Folder watcher** | Automatically detects new video files dropped into watched folders |
| **System tray** | Minimise to tray — the app keeps running without a taskbar entry |
| **Single instance** | A second launch brings the existing window to focus instead of opening a duplicate |
| **Per-folder settings** | Configure recursion depth and maximum video duration per folder |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Desktop framework** | [Wails v2](https://wails.io/) |
| **Backend** | Go 1.25 |
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS |
| **Local DB** | SQLite via `modernc.org/sqlite` (no CGO) |
| **YouTube** | Google YouTube Data API v3 + OAuth 2.0 |
| **Notifications** | `gen2brain/beeep` |
| **System tray** | `energye/systray` |
| **File watching** | `fsnotify/fsnotify` |

---

## Prerequisites

- [Go 1.21+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/) and npm
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```
- A [Google Cloud project](https://console.cloud.google.com/) with the **YouTube Data API v3** enabled and an **OAuth 2.0 Desktop App** credential

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/SterlinkIng89/amon-hen.git
cd amon-hen
```

### 2. Set up YouTube credentials

You can supply your Google OAuth credentials in two ways:

**Option A – Import JSON (recommended)**  
In the app's **Settings** panel, click *Import OAuth JSON* and select the `client_secret_*.json` file downloaded from Google Cloud Console.

**Option B – Environment variables (dev only)**  
Copy `.env.example` to `.env` and fill in your credentials:

```env
client_id=YOUR_GOOGLE_CLIENT_ID
client_secret=YOUR_GOOGLE_CLIENT_SECRET
```

> **Note:** The `.env` file is only a fallback for local development. Credentials are persisted to `%AppData%\AmonHen\config.json` after first save.

### 3. Run in development mode

```bash
wails dev
```

This starts both the Go backend and a Vite dev server with hot-reload. You can also open `http://localhost:34115` in your browser to access the UI and call Go methods from DevTools.

### 4. Build a production binary

```bash
wails build
```

The output executable is placed in `build/bin/`.

---

## Usage

### Adding video folders

1. Click the **+** button in the header (or drag-and-drop a folder onto the app window).
2. The folder is scanned immediately; new files are detected automatically if *Folder Watching* is enabled.
3. Each folder can be individually configured (recursive scan, max video duration) via the settings icon next to its name.

### Tagging videos

- **Single video** – open it in the player view and use the sidebar to set its game tag, episode, title, description, and privacy.
- **Bulk** – hold `Ctrl`/`Cmd` or `Shift` to select multiple videos, then use the bulk action bar to assign a game tag or playlist to all of them at once.

### Uploading to YouTube

1. First-time setup: connect your YouTube account in **Settings → YouTube Account → Connect**.
2. Click the upload button on any video card to open the Upload Dialog.
3. Choose **Upload Now** (starts immediately) or **Add to Queue** (runs sequentially after existing uploads finish).
4. Progress and speed are displayed in real time in the Upload Queue panel.

### Channel sync

Switch to the **Channel** tab to see all videos and playlists from your YouTube channel. Data is fetched from YouTube on demand and cached locally. The app automatically re-syncs in the background on startup if the last sync was more than 12 hours ago.

---

## Project Structure

```
amon-hen/
├── main.go                 # Entry point — Wails setup, tray, single-instance lock
├── backend/
│   ├── app.go              # App struct, Startup hook, auto-sync logic
│   ├── config.go           # Config load/save, folder & video metadata management
│   ├── scanner.go          # Video folder scanner, episode numbering, file deletion
│   ├── youtube.go          # YouTube OAuth, upload, playlist CRUD, channel info
│   ├── youtube_sync.go     # Full channel data sync into SQLite
│   ├── database.go         # SQLite init and schema migrations
│   ├── media.go            # Thumbnail/preview generation, video duration
│   ├── stream.go           # Local HTTP video stream server
│   ├── watcher.go          # File-system watcher (fsnotify)
│   ├── tray.go             # System tray menu setup
│   ├── autolaunch.go       # Launch-on-login support
│   ├── single_instance_windows.go  # Named-mutex single-instance guard
│   └── api_logger.go       # YouTube API quota usage logger
├── frontend/
│   └── src/
│       ├── pages/          # Dashboard, ChannelPage
│       ├── components/     # layout/, video/, youtube/, ui/
│       ├── hooks/          # useVideoLibrary, etc.
│       ├── store/          # Zustand global store (useAppStore)
│       ├── types/          # Shared TypeScript types
│       └── utils/          # videoUtils, formatting helpers
├── build/                  # Wails build assets (icons, Info.plist, etc.)
├── wails.json              # Wails project configuration
└── .env.example            # Environment variable template
```

---

## Configuration

All settings are stored in `%AppData%\AmonHen\config.json` (Windows) or the equivalent OS config directory. There is no manual editing required — the Settings panel in the app handles everything.

| Setting | Description |
|---|---|
| `folders` | List of watched video source folders |
| `folder_settings` | Per-folder recursive & duration-filter options |
| `youtube_client_id/secret` | Google OAuth credentials |
| `youtube_token_json` | Stored OAuth token (refresh token included) |
| `video_metadata` | Per-file game tag, episode, title, description, privacy, playlist |
| `watch_folder_enabled` | Toggle for real-time folder watching |

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `wails dev` to start the development server.
3. Make your changes — Go for backend logic, TypeScript/React for frontend.
4. Submit a pull request with a clear description of what you changed and why.

Please keep YouTube API quota usage in mind: prefer reading from the local SQLite cache before making live API calls.

---

## License

This project is personal/private. Contact the author for permission before distributing or reusing the code.
