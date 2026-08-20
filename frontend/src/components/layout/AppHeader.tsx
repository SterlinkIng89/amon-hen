import React, { useEffect, useRef, useState } from "react";
import { ViewMode } from "../../types";
import { QuotaBadge } from "../youtube/DevLogsPanel";

interface AppHeaderProps {
 view: ViewMode;
 foldersCount: number;
 scanning: boolean;
 queueCount: number; // total active (pending + uploading)
 uploadingCount: number; // currently uploading
 uploadProgress: number; // 0-100 global upload progress (shown as mini arc when away from queue)
 queueAddedAt: number; // timestamp — changes whenever an item is added (triggers badge ticker)
 queueDoneAt: number; // timestamp — changes whenever an item finishes (triggers downward ticker)
 ytAuthed: boolean;
 onSetView: (view: ViewMode) => void;
 onRescan: () => void;
 onOpenSettings: () => void;
 onAddFolder: () => void;
 onOpenDevLogs: () => void;
}

export default function AppHeader({
 view,
 foldersCount,
 scanning,
 queueCount,
 uploadingCount,
 uploadProgress,
 queueAddedAt,
 queueDoneAt,
 ytAuthed,
 onSetView,
 onRescan,
 onOpenSettings,
 onAddFolder,
 onOpenDevLogs,
}: AppHeaderProps) {
 const isLibrary = view === "grid" || view === "player";

 // ── Badge ticker (slot-machine: old ↑ | +N ↓ | +N ↑ | new ↓) ──────────────────
 // tickerContent: what's rendered inside the badge right now
 // tickerPhase: which CSS animation to play on the inner span
 type TickPhase = 'out' | 'in' | 'out-down' | 'in-down' | null;
 const [tickerContent, setTickerContent] = useState<string | number>(queueCount);
 const [tickerPhase, setTickerPhase] = useState<TickPhase>(null);
 const [tickerKey, setTickerKey] = useState(0); // force remount to replay animation
 const prevAddedAt = useRef(queueAddedAt);
 const prevDoneAt = useRef(queueDoneAt);
 const prevCountRef = useRef(queueCount);

 // Keep ticker in sync when idle
 useEffect(() => {
 if (tickerPhase === null) {
 setTickerContent(queueCount);
 prevCountRef.current = queueCount;
 }
 }, [queueCount, tickerPhase]);

 useEffect(() => {
 if (queueAddedAt === 0 || queueAddedAt === prevAddedAt.current) return;
 prevAddedAt.current = queueAddedAt;

 const oldCount = prevCountRef.current;
 const newCount = queueCount;
 const delta = Math.max(newCount - oldCount, 1);
 const deltaStr = `+${delta}`;

 const bump = (content: string | number, phase: TickPhase) => {
 setTickerContent(content);
 setTickerPhase(phase);
 setTickerKey((k) => k + 1);
 };

 // 1 — old exits up
 bump(oldCount, 'out');

 // 2 — delta enters from below
 const t1 = setTimeout(() => bump(deltaStr, 'in'), 160);
 // 3 — delta exits up
 const t2 = setTimeout(() => bump(deltaStr, 'out'), 380);
 // 4 — new count enters from below
 const t3 = setTimeout(() => {
 prevCountRef.current = newCount;
 bump(newCount, 'in');
 }, 540);
 // 5 — stable
 const t4 = setTimeout(() => setTickerPhase(null), 740);

 return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
 }, [queueAddedAt, queueCount]);

 // Downward ticker when an item finishes
 useEffect(() => {
 if (queueDoneAt === 0 || queueDoneAt === prevDoneAt.current) return;
 prevDoneAt.current = queueDoneAt;

 const oldCount = prevCountRef.current;
 const newCount = queueCount;

 const bump = (content: string | number, phase: TickPhase) => {
 setTickerContent(content);
 setTickerPhase(phase);
 setTickerKey((k) => k + 1);
 };

 const checkmark = "✓";

 // 1 — old exits down
 bump(oldCount, 'out-down');

 // 2 — checkmark enters from above
 const t1 = setTimeout(() => bump(checkmark, 'in-down'), 160);
 // 3 — checkmark exits down (holds longer)
 const t2 = setTimeout(() => bump(checkmark, 'out-down'), 600);
 // 4 — new count enters from above
 const t3 = setTimeout(() => {
 prevCountRef.current = newCount;
 bump(newCount, 'in-down');
 }, 760);
 // 5 — stable
 const t4 = setTimeout(() => setTickerPhase(null), 960);

 return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
 }, [queueDoneAt, queueCount]);

 const isQueueView = view === "queue";
 const hasUploading = uploadingCount > 0;

 return (
 <header className="flex items-center justify-between px-4 h-header shrink-0 bg-surface border-b border-border-subtle gap-2.5 z-10">
 <div className="flex items-center gap-6 shrink-0 h-full border-r border-border-subtle pr-4">
 <button
 className={`text-sm font-bold tracking-tight transition-colors h-full px-2 border-b-2 ${isLibrary ? "text-text-primary border-accent" : "text-text-secondary border-transparent hover:text-text-primary"}`}
 onClick={() => onSetView("grid")}
 >
 Library
 </button>
 {ytAuthed && (
 <button
 className={`text-sm font-bold tracking-tight transition-colors h-full px-2 border-b-2 flex items-center gap-1.5 ${view === "channel" ? "text-text-primary border-accent" : "text-text-secondary border-transparent hover:text-text-primary"}`}
 onClick={() => onSetView("channel")}
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={view === "channel" ? "text-accent" : ""}>
 <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
 </svg>
 Channel
 </button>
 )}
 {ytAuthed && (
 <button
 className={`text-sm font-bold tracking-tight transition-colors h-full px-2 border-b-2 flex items-center gap-1.5 ${view === "stats" ? "text-text-primary border-accent" : "text-text-secondary border-transparent hover:text-text-primary"}`}
 onClick={() => onSetView("stats")}
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={view === "stats" ? "text-accent" : ""}>
 <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
 </svg>
 YT Stats
 </button>
 )}
 <button
 className={`text-sm font-bold tracking-tight transition-colors h-full px-2 border-b-2 flex items-center gap-1.5 ${view === "steam" ? "text-text-primary border-accent" : "text-text-secondary border-transparent hover:text-text-primary"}`}
 onClick={() => onSetView("steam" as ViewMode)}
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={view === "steam" ? "text-accent" : ""}>
 <path d="M11.979 0C5.353 0 0 5.373 0 12c0 6.628 5.353 12 11.979 12 6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12zm6.604 17.581c-.244-.122-1.396-.612-1.396-.612l-.93-1.425c.37-.123.69-.328.947-.6.284-.301.442-.693.442-1.1s-.158-.799-.442-1.1c-.283-.301-.663-.468-1.077-.468-.415 0-.794.167-1.078.468-.283.301-.442.699-.442 1.1s.159.799.442 1.1c.219.232.502.413.82.528l.942 1.455c-.201.096-.423.167-.659.206-.689.117-1.42-.034-1.956-.376l-1.98 1.054c.148.431.137.904-.038 1.332-.239.585-.71.996-1.309 1.144-.6.148-1.229.006-1.722-.387-.492-.393-.787-.976-.816-1.611-.029-.635.211-1.246.66-1.685.45-.439 1.066-.644 1.687-.56l3.32-3.155c-.006-.064-.01-.129-.01-.194 0-1.258.989-2.284 2.203-2.284 1.215 0 2.203 1.026 2.203 2.284 0 .914-.51 1.7-1.245 2.067l.951 1.455c.677.309 1.305.808 1.83 1.463l-1.408.86z"/>
 </svg>
 Steam
 </button>

 {ytAuthed && (
 <div className="relative h-full flex items-center">
 <button
 className={`relative text-sm font-bold tracking-tight transition-colors h-full px-2 border-b-2 flex items-center overflow-hidden ${isQueueView ? "text-text-primary border-accent" : "text-text-secondary border-transparent hover:text-text-primary hover:bg-elevated/30"}`}
 onClick={() => onSetView("queue")}
 >
 {/* Dynamic Fill Background */}
 {hasUploading && !isQueueView && (
 <div 
 className="absolute left-0 top-0 bottom-0 bg-accent/15 transition-all duration-300 pointer-events-none" 
 style={{ width: `${uploadProgress}%` }}
 />
 )}

 <div className="relative z-10 flex items-center gap-2 shrink-0">
 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={isQueueView ? "text-accent" : ""}>
 <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
 </svg>
 Queue
 </div>
 
 {/* Badge with slot-machine ticker (wrapped for smooth width transition) */}
 <div
 className="relative z-10"
 style={{
 width: (queueCount > 0 || tickerPhase !== null) ? "34px" : "0px", // 26px badge + 8px margin
 opacity: (queueCount > 0 || tickerPhase !== null) ? 1 : 0,
 overflow: "hidden",
 transition: "width 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease",
 display: "flex",
 justifyContent: "flex-end",
 }}
 >
 <span
 className={`
 relative inline-flex items-center justify-center overflow-hidden shrink-0
 min-w-[26px] h-[18px] px-1.5 rounded-full text-[10px] font-bold leading-none
 transition-colors duration-150 ml-2
 ${hasUploading
 ? "bg-accent text-white"
 : "bg-accent/20 text-accent border border-accent/40"
 }
 `}
 >
 <span
 key={tickerKey}
 style={{
 display: "block",
 lineHeight: 1,
 color: typeof tickerContent === "string" && tickerContent.startsWith("+") 
 ? (hasUploading ? "#a7f3d0" : "#10b981") 
 : typeof tickerContent === "string" && tickerContent === "✓"
 ? "#10b981"
 : undefined,
 transition: "color 0.15s ease",
 animation:
 tickerPhase === "out" ? "badgeNumOut 0.16s ease forwards" :
 tickerPhase === "in" ? "badgeNumIn 0.16s ease forwards" :
 tickerPhase === "out-down" ? "badgeNumOutDown 0.16s ease forwards" :
 tickerPhase === "in-down" ? "badgeNumInDown 0.16s ease forwards" :
 "none",
 }}
 >
 {tickerPhase === null ? queueCount : tickerContent}
 </span>
 </span>
 </div>
 </button>
 </div>
 )}

 </div>

 <div className="flex items-center gap-[7px] flex-1 justify-end min-w-0">
 {foldersCount > 0 && !scanning && (
 <button className="btn btn-ghost" onClick={onRescan}>
 <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
 <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
 </svg>
 Rescan
 </button>
 )}
 {ytAuthed && <QuotaBadge />}
 {ytAuthed && (
 <button
 className="btn btn-ghost"
 onClick={onOpenDevLogs}
 title="Dev: API call logs"
 style={{ opacity: 0.45 }}
 >
 <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
 <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/>
 </svg>
 </button>
 )}
 <button className="btn btn-ghost relative" onClick={onOpenSettings}>
 <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
 <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
 </svg>
 {ytAuthed && <span className="absolute top-[5px] right-[5px] w-1.5 h-1.5 bg-green-400 rounded-full " title="YouTube connected" />}
 </button>
 <button className="btn btn-primary" onClick={onAddFolder} disabled={scanning}>
 <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
 <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
 </svg>
 {scanning ? "Scanning..." : "Add Folder"}
 </button>
 </div>
 </header>
 );
}

