import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ToastType = "info" | "warning" | "error" | "success";

interface Toast {
 id: string;
 message: string;
 type: ToastType;
}

interface ToastContextValue {
 addToast: (message: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
 return useContext(ToastContext);
}

// ─── Individual toast item ────────────────────────────────────────────────────

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
 info: { bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.3)", icon: "#22d3ee", text: "#cffafe" },
 success: { bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.3)", icon: "#4ade80", text: "#dcfce7" },
 warning: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.3)", icon: "#fbbf24", text: "#fef9c3" },
 error: { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", icon: "#f87171", text: "#fee2e2" },
};

function ToastIcon({ type }: { type: ToastType }) {
 const c = TOAST_COLORS[type].icon;
 if (type === "success") return (
 <svg width="14" height="14" viewBox="0 0 24 24" fill={c}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
 );
 if (type === "warning") return (
 <svg width="14" height="14" viewBox="0 0 24 24" fill={c}><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
 );
 if (type === "error") return (
 <svg width="14" height="14" viewBox="0 0 24 24" fill={c}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
 );
 // info
 return (
 <svg width="14" height="14" viewBox="0 0 24 24" fill={c}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
 );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
 const colors = TOAST_COLORS[toast.type];
 const [visible, setVisible] = useState(false);

 // Animate in
 useEffect(() => {
 const t = requestAnimationFrame(() => setVisible(true));
 return () => cancelAnimationFrame(t);
 }, []);

 return (
 <div
 style={{
 display: "flex",
 alignItems: "flex-start",
 gap: "10px",
 background: colors.bg,
 border: `1px solid ${colors.border}`,
 borderRadius: "8px",
 padding: "10px 12px",
 boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
 backdropFilter: "blur(8px)",
 maxWidth: "340px",
 transform: visible ? "translateY(0)" : "translateY(12px)",
 opacity: visible ? 1 : 0,
 transition: "transform 0.25s ease, opacity 0.25s ease",
 }}
 >
 <div style={{ flexShrink: 0, marginTop: "1px" }}>
 <ToastIcon type={toast.type} />
 </div>
 <span style={{ flex: 1, fontSize: "12px", fontWeight: 500, color: colors.text, lineHeight: 1.4 }}>
 {toast.message}
 </span>
 <button
 onClick={onRemove}
 style={{
 background: "transparent",
 border: "none",
 padding: "0",
 cursor: "pointer",
 color: colors.icon,
 opacity: 0.6,
 flexShrink: 0,
 display: "flex",
 alignItems: "center",
 }}
 title="Dismiss"
 >
 <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
 <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
 </svg>
 </button>
 </div>
 );
}

// ─── Container rendered at the bottom-right ───────────────────────────────────

function ToastStack({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
 if (toasts.length === 0) return null;
 return (
 <div
 style={{
 position: "fixed",
 bottom: "20px",
 right: "20px",
 zIndex: 9999,
 display: "flex",
 flexDirection: "column",
 gap: "8px",
 alignItems: "flex-end",
 pointerEvents: "none",
 }}
 >
 {toasts.map((t) => (
 <div key={t.id} style={{ pointerEvents: "auto" }}>
 <ToastItem toast={t} onRemove={() => onRemove(t.id)} />
 </div>
 ))}
 </div>
 );
}

// ─── Provider (wrap the app at root level) ────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
 const [toasts, setToasts] = useState<Toast[]>([]);
 const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

 const removeToast = useCallback((id: string) => {
 setToasts((prev) => prev.filter((t) => t.id !== id));
 const t = timers.current.get(id);
 if (t) {
 clearTimeout(t);
 timers.current.delete(id);
 }
 }, []);

 const addToast = useCallback((message: string, type: ToastType = "info") => {
 const id = crypto.randomUUID();
 setToasts((prev) => [...prev, { id, message, type }]);
 const t = setTimeout(() => removeToast(id), 6000);
 timers.current.set(id, t);
 }, [removeToast]);

 return (
 <ToastContext.Provider value={{ addToast }}>
 {children}
 <ToastStack toasts={toasts} onRemove={removeToast} />
 </ToastContext.Provider>
 );
}
