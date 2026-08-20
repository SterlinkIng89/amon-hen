import { VideoFile, VideoGroup, GameProfile, YTVideo, VideoGroupYT } from "../types";

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
 customVars?: Record<string, string>,
 modTime?: number
): string {
 const stem = filename.replace(/\.[^/.]+$/, "");
 
 let datePart = "";
 
 // 1. OBS Pattern (YYYY-MM-DD)
 const obsPattern = /(?:^|_|-|\s)(\d{4})-(\d{2})-(\d{2})(?:_|-|\s|$)/;
 const obsMatch = stem.match(obsPattern);
 
 // 2. US/EU Pattern (MM-DD-YYYY or DD-MM-YYYY)
 const usPattern = /(?:^|_|-|\s)(\d{1,2})-(\d{1,2})-(\d{4})(?:_|-|\s|$)/;
 const usMatch = stem.match(usPattern);
 
 if (obsMatch) {
 const [, year, month, day] = obsMatch;
 datePart = `${parseInt(day)}/${month.padStart(2, '0')}/${year.slice(-2)}`;
 } else if (usMatch) {
 const [, p1, p2, year] = usMatch;
 let day = p2;
 let month = p1;
 if (parseInt(p1) > 12) {
 day = p1;
 month = p2;
 }
 datePart = `${parseInt(day)}/${month.padStart(2, '0')}/${year.slice(-2)}`;
 } else {
 const d = modTime ? new Date(modTime) : new Date();
 datePart = `${d.getDate()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(-2)}`;
 }
 
 if (!game) return datePart;

 if (profile && profile.type === "multiplayer") {
 let template = profile.titleTemplate || "{event} - {gamemode} - {date}";
 let res = template.replace(/\{game\}/gi, game);
 res = res.replace(/\{event\}/gi, event || "Title");
 res = res.replace(/\{gamemode\}/gi, gameMode || "Mode");
 res = res.replace(/\{date\}/gi, datePart);
 res = res.replace(/\{episode\}/gi, (episode || 0).toString());
 
 const detectedCustomVars = extractCustomVars(template);
 detectedCustomVars.forEach(k => {
 const v = customVars?.[k];
 const val = v || k.charAt(0).toUpperCase() + k.slice(1);
 res = res.replace(new RegExp(`\\{${k}\\}`, 'gi'), val);
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

// extractTitleDate attempts to parse a recording date from a video title.
// Returns a zero-padded "YYYY-MM-DD" string, or "" if no date is found.
// Priority: ISO (YYYY-MM-DD) → compact (YYYYMMDD) → space (YYYY MM DD) → DD/MM/YY
export function extractTitleDate(title: string): string {
 // 1. Explicit ISO: YYYY-MM-DD
 const isoMatch = title.match(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/);
 if (isoMatch) {
 const [, y, mo, d] = isoMatch;
 const yi = parseInt(y), moi = parseInt(mo), di = parseInt(d);
 if (yi >= 2000 && yi <= 2099 && moi >= 1 && moi <= 12 && di >= 1 && di <= 31) {
 return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
 }
 }

 // 2. Compact YYYYMMDD (8 consecutive digits at word boundary)
 const compactMatch = title.match(/\b(\d{4})(\d{2})(\d{2})\b/);
 if (compactMatch) {
 const [, y, mo, d] = compactMatch;
 const yi = parseInt(y), moi = parseInt(mo), di = parseInt(d);
 if (yi >= 2000 && yi <= 2099 && moi >= 1 && moi <= 12 && di >= 1 && di <= 31) {
 return `${y}-${mo}-${d}`;
 }
 }

 // 3. Space-separated YYYY MM DD
 const spaceMatch = title.match(/\b(\d{4})\s+(\d{1,2})\s+(\d{1,2})\b/);
 if (spaceMatch) {
 const [, y, mo, d] = spaceMatch;
 const yi = parseInt(y), moi = parseInt(mo), di = parseInt(d);
 if (yi >= 2000 && yi <= 2099 && moi >= 1 && moi <= 12 && di >= 1 && di <= 31) {
 return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
 }
 }

 // 4. DD/MM/YY or DD/MM/YYYY with various separators
 // Use matchAll to try all occurrences — skip any where the "day" is 4 digits (that's a year)
 const dmyRe = /\b(\d{1,2})[/／∕⁄.\-](\d{1,2})[/／∕⁄.\-](\d{2,4})\b/g;
 for (const m of title.matchAll(dmyRe)) {
 const [, part1, part2, part3] = m;
 if (part1.length === 4) continue; // skip YYYY-first false matches
 const day = part1, month = part2;
 const year = part3.length === 2 ? `20${part3}` : part3;
 const yi = parseInt(year), moi = parseInt(month), di = parseInt(day);
 if (yi >= 2000 && yi <= 2099 && moi >= 1 && moi <= 12 && di >= 1 && di <= 31) {
 return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
 }
 }

 return "";
}

export function groupByDayYT(videos: YTVideo[], sortMode: string): VideoGroupYT[] {
 const map = new Map<string, YTVideo[]>();
 for (const v of videos) {
 let k = "";
 if (sortMode === "title_date") {
 const parsed = extractTitleDate(v.title);
 k = parsed !== "" ? parsed : toLocalDateKey(new Date(v.publishedAt).getTime());
 } else {
 k = toLocalDateKey(new Date(v.publishedAt).getTime());
 }
 
 if (!map.has(k)) map.set(k, []);
 map.get(k)!.push(v);
 }
 // formatGroupLabel expects YYYY-MM-DD
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
