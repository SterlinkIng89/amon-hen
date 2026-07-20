import { VideoFile, VideoGroup, GameProfile } from "../types";

const STANDARD_VARS = ['game', 'date', 'episode', 'event', 'gamemode'];

export function formatSize(b: number) {
  return b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB" : (b / 1048576).toFixed(2) + " MB";
}

export function formatName(n: string) {
  return n.replace(/\.[^/.]+$/, "");
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function generateYouTubeTitle(
  filename: string,
  game?: string,
  episode?: number,
  profile?: GameProfile,
  event?: string,
  gameMode?: string,
  customVars?: Record<string, string>
): string {
  const obsPattern = /^(\d{4})-(\d{2})-(\d{2})/;
  const stem = filename.replace(/\.[^/.]+$/, "");
  const match = stem.match(obsPattern);
  
  let datePart = "";
  if (match) {
    const [, year, month, day] = match;
    datePart = `${parseInt(day)}/${month}/${year.slice(-2)}`;
  } else {
    const now = new Date();
    datePart = `${now.getDate()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear().toString().slice(-2)}`;
  }
  
  if (!game) return datePart;

  if (profile && profile.type === "multiplayer") {
    let template = profile.titleTemplate || "{event} - {gamemode} - {date}";
    let res = template.replace(/{game}/g, game);
    res = res.replace(/{event}/g, event || "Title");
    res = res.replace(/{gamemode}/g, gameMode || "Mode");
    res = res.replace(/{date}/g, datePart);
    res = res.replace(/{episode}/g, (episode || 0).toString());
    
    const detectedCustomVars = extractCustomVars(template);
    detectedCustomVars.forEach(k => {
      const v = customVars?.[k];
      const val = v || k.charAt(0).toUpperCase() + k.slice(1);
      res = res.replace(new RegExp(`{${k}}`, 'g'), val);
    });
    
    // Cleanup multiple adjacent hyphens or spaces resulting from empty variables
    res = res.replace(/(?:\s*-\s*){2,}/g, " - ");
    res = res.replace(/^\s*-\s*/, "");
    res = res.replace(/\s*-\s*$/, "");
    
    return res;
  }
  
  const epSuffix = (episode && episode > 0) ? ` — ${episode}` : "";
  
  return `${game} — ${datePart}${epSuffix}`;
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
  // Preserve caller's order — do NOT re-sort here.
  const map = new Map<string, VideoFile[]>();
  for (const v of videos) {
    const k = toLocalDateKey(v.modTime);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(v);
  }
  return Array.from(map.entries()).map(([dateKey, vs]) => ({ dateKey, label: formatGroupLabel(dateKey), videos: vs }));
}

export function extractCustomVars(template: string): string[] {
  if (!template) return [];
  const matches = [...template.matchAll(/\{([^}]+)\}/g)];
  return Array.from(new Set(matches.map(m => m[1].toLowerCase()))).filter(v => !STANDARD_VARS.includes(v));
}

export function extractOrderedInputVars(template: string): string[] {
  if (!template) return [];
  const matches = [...template.matchAll(/\{([^}]+)\}/g)];
  const allVars = matches.map(m => m[1].toLowerCase());
  return Array.from(new Set(allVars)).filter(v => v !== 'game' && v !== 'date' && v !== 'episode');
}
