import { useState, useEffect } from "react";

import { GetVideos, GetVideoPreview } from "../../wailsjs/go/main/App";

interface VideoFile {
  name: string;
  path: string;
  size: number;
}

const VideoItem = ({ video }: { video: VideoFile }) => {
  const [spriteSheet, setSpriteSheet] = useState<string>("");
  const [bgPosition, setBgPosition] = useState<string>("0% 0%");

  useEffect(() => {
    // Fetch the 5x5 sprite sheet
    GetVideoPreview(video.path)
      .then((data) => {
        if (data) setSpriteSheet(data);
      })
      .catch((err) => console.error("Error loading preview:", err));
  }, [video.path]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!spriteSheet) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Calculate percentage (0 to 1)
    const percentage = Math.max(0, Math.min(1, x / width));

    // Total frames = 25 (5x5 grid)
    const totalFrames = 25;
    const frameIndex = Math.floor(percentage * totalFrames);

    // Calculate row and column for 5x5 grid
    const cols = 5;
    const rows = 5;

    const col = frameIndex % cols;
    const row = Math.floor(frameIndex / cols);

    // Calculate background position
    // For background-position percentage:
    // x% = (col / (cols - 1)) * 100
    // y% = (row / (rows - 1)) * 100
    const xPos = (col / (cols - 1)) * 100;
    const yPos = (row / (rows - 1)) * 100;

    setBgPosition(`${xPos}% ${yPos}%`);
  };

  const handleMouseLeave = () => {
    // Reset to first frame
    setBgPosition("0% 0%");
  };

  return (
    <li className="bg-zinc-900 p-4 border-l-4 border-orange-600 rounded flex gap-4 items-center">
      <div
        className="w-40 h-24 bg-black rounded overflow-hidden flex-shrink-0 cursor-pointer relative"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {spriteSheet ? (
          <div
            className="w-full h-full bg-no-repeat"
            style={{
              backgroundImage: `url(${spriteSheet})`,
              backgroundSize: "500% 500%", // 5 columns, 5 rows
              backgroundPosition: bgPosition,
            }}
          />
        ) : (
          <div className="w-full h-full bg-zinc-800 animate-pulse" />
        )}
      </div>
      <div>
        <p className="font-semibold text-lg">{video.name}</p>
        <p className="text-sm text-zinc-400">
          {(video.size / (1024 * 1024)).toFixed(2)} MB
        </p>
      </div>
    </li>
  );
};

export default function VideoList() {
  console.log("VideoList component rendering");
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const folderPath = "K:/";

  const loadVideos = async () => {
    try {
      const result = await GetVideos(folderPath);
      console.log("Videos loaded:", result);
      setVideos(result);
    } catch (err) {
      console.error("Error cargando archivos:", err);
    }
  };

  return (
    <div className="p-6 bg-zinc-950 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">
        Amon Hen - Archivos Detectados
      </h1>
      <button
        onClick={loadVideos}
        className="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded mb-6"
      >
        Escanear Carpeta
      </button>

      <ul className="grid gap-3">
        {videos.map((video, i) => (
          <VideoItem key={i} video={video} />
        ))}
      </ul>
    </div>
  );
}
