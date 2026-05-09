import { VideoFile, VideoGroup } from "../types";

export function formatSize(b: number) {
  return b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB" : (b / 1048576).toFixed(2) + " MB";
}

export function formatName(n: string) {
  return n.replace(/\.[^/.]+$/, "");
}

export function toLocalDateKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatGroupLabel(k: string) {
  const today = toLocalDateKey(Date.now());
  const yesterday = toLocalDateKey(Date.now() - 86400000);
  if (k === today) return "Today";
  if (k === yesterday) return "Yesterday";
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function groupByDay(videos: VideoFile[]): VideoGroup[] {
  const sorted = [...videos].sort((a, b) => b.modTime - a.modTime);
  const map = new Map<string, VideoFile[]>();
  for (const v of sorted) {
    const k = toLocalDateKey(v.modTime);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(v);
  }
  return Array.from(map.entries()).map(([dateKey, vs]) => ({ dateKey, label: formatGroupLabel(dateKey), videos: vs }));
}
