/**
 * DevQueueSeeder — Dev-only tool for testing the Queue UI.
 * Only renders when import.meta.env.DEV === true.
 * Injects fake QueueItems directly into the store without touching the backend.
 */
import { useAppStore } from "../../store/useAppStore";
import { QueueItem } from "../youtube/UploadQueue";

const FAKE_VIDEOS = [
  { name: "Valorant_2024-06-01_15-32-10.mp4", game: "Valorant", size: 487_000_000 },
  { name: "Apex_Legends_2024-06-02_20-11-45.mp4", game: "Apex Legends", size: 321_000_000 },
  { name: "CS2_Match_Highlights_2024-06-03.mp4", game: "CS2", size: 198_500_000 },
  { name: "Fortnite_Win_2024-06-04_18-55-22.mp4", game: "Fortnite", size: 654_000_000 },
  { name: "Minecraft_Epic_Build_2024-06-05.mp4", game: "Minecraft", size: 112_000_000 },
];

function makeItem(overrides: Partial<QueueItem> & Pick<QueueItem, "status">): QueueItem {
  const vid = FAKE_VIDEOS[Math.floor(Math.random() * FAKE_VIDEOS.length)];
  return {
    id: crypto.randomUUID(),
    videoPath: `C:\\Users\\Dev\\Videos\\${vid.name}`,
    videoName: vid.name,
    size: vid.size,
    title: `${vid.game} · Epic Clip`,
    description: "Auto-generated test description",
    privacy: "unlisted",
    progress: 0,
    ...overrides,
  };
}

export default function DevQueueSeeder() {
  if (!import.meta.env.DEV) return null;

  const { setQueue, bumpQueueAdded, setView } = useAppStore();

  const addPending = () => {
    setQueue((q) => [
      ...q,
      makeItem({ status: "pending" }),
    ]);
    bumpQueueAdded();
  };

  const addUploading = () => {
    const progress = Math.floor(Math.random() * 80) + 5;
    const speed = Math.floor(Math.random() * 8_000_000) + 500_000;
    setQueue((q) => [
      ...q,
      makeItem({
        status: "uploading",
        progress,
        uploadSpeed: speed,
      }),
    ]);
    bumpQueueAdded();
  };

  const addDone = () => {
    setQueue((q) => [
      ...q,
      makeItem({
        status: "done",
        progress: 100,
        url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    bumpQueueAdded();
  };

  const addError = () => {
    setQueue((q) => [
      ...q,
      makeItem({
        status: "error",
        error: "Upload quota exceeded (403)",
      }),
    ]);
    bumpQueueAdded();
  };

  const addFullSet = () => {
    setQueue((q) => [
      ...q,
      makeItem({ status: "pending" }),
      makeItem({ status: "pending" }),
      makeItem({ status: "uploading", progress: 37, uploadSpeed: 3_200_000 }),
      makeItem({ status: "uploading", progress: 72, uploadSpeed: 5_800_000 }),
      makeItem({ status: "done", progress: 100, url: "https://youtube.com/watch?v=dQw4w9WgXcQ" }),
      makeItem({ status: "error", error: "Network timeout" }),
    ]);
    bumpQueueAdded();
  };

  const clearQueue = () => {
    setQueue([]);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        left: "16px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        background: "rgba(9,9,11,0.95)",
        border: "1px solid rgba(249,115,22,0.3)",
        borderRadius: "10px",
        padding: "10px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        backdropFilter: "blur(12px)",
        minWidth: "170px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
        <span style={{ fontSize: "9px", fontWeight: 700, color: "#f97316", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          🛠 Queue Dev Seeder
        </span>
      </div>

      {[
        { label: "+ Pending",   fn: addPending,   color: "#71717a" },
        { label: "+ Uploading", fn: addUploading, color: "#f97316" },
        { label: "+ Done",      fn: addDone,      color: "#4ade80" },
        { label: "+ Error",     fn: addError,     color: "#f87171" },
        { label: "⚡ Full set",  fn: addFullSet,   color: "#a78bfa" },
      ].map(({ label, fn, color }) => (
        <button
          key={label}
          onClick={fn}
          style={{
            background: "transparent",
            border: `1px solid ${color}30`,
            borderRadius: "6px",
            color,
            fontSize: "11px",
            fontWeight: 600,
            padding: "4px 8px",
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = `${color}15`)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {label}
        </button>
      ))}

      <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />

      <button
        onClick={() => { setView("queue"); }}
        style={{
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "6px",
          color: "#f4f4f5",
          fontSize: "11px",
          fontWeight: 600,
          padding: "4px 8px",
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        → Go to Queue
      </button>

      <button
        onClick={clearQueue}
        style={{
          background: "transparent",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: "6px",
          color: "#f87171",
          fontSize: "11px",
          fontWeight: 600,
          padding: "4px 8px",
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        🗑 Clear all
      </button>
    </div>
  );
}
