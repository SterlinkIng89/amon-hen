import React, { useState, useRef, useEffect } from "react";
import { useRecentFieldValues } from "../../hooks/useRecentFieldValues";

interface Props {
 fieldKey: string;
 value: string;
 onChange: (val: string) => void;
 onBlur?: () => void;
 onEnter?: () => void;
 className?: string;
 placeholder?: string;
 disabled?: boolean;
}

export default function FieldInput({ fieldKey, value, onChange, onBlur, onEnter, className, placeholder, disabled }: Props) {
 const [open, setOpen] = useState(false);
 const containerRef = useRef<HTMLDivElement>(null);
 const { getRecentValues, addRecentValue, removeRecentValue } = useRecentFieldValues();
 const suggestions = getRecentValues(fieldKey);

 // Close dropdown on click outside
 useEffect(() => {
 const handleClickOutside = (e: MouseEvent) => {
 if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
 setOpen(false);
 }
 };
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()));

 const handleSelect = (s: string) => {
 onChange(s);
 addRecentValue(fieldKey, s);
 setOpen(false);
 };

 const handleBlur = () => {
 onBlur?.();
 };

 return (
 <div className="relative flex-1" ref={containerRef}>
 <input
 type="text"
 className={className || "w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card"}
 placeholder={placeholder}
 value={value}
 onChange={e => {
 onChange(e.target.value);
 setOpen(true);
 }}
 onFocus={() => setOpen(true)}
 onBlur={handleBlur}
 onKeyDown={e => {
 if (e.key === "Enter") {
 if (value.trim()) {
 addRecentValue(fieldKey, value.trim());
 }
 setOpen(false);
 onEnter?.();
 }
 }}
 disabled={disabled}
 />
 {open && filtered.length > 0 && (
 <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-border-subtle rounded-sm shadow-xl z-[100] max-h-48 overflow-y-auto">
 {filtered.map(s => (
 <div
 key={s}
 className="group px-3 py-2 text-sm text-text-primary cursor-pointer hover:bg-card hover:text-accent border-b border-border-subtle last:border-b-0 flex items-center justify-between gap-2"
 onMouseDown={e => {
 e.preventDefault();
 handleSelect(s);
 }}
 onClick={() => handleSelect(s)}
 >
 <span className="truncate flex-1">{s}</span>
 <button
 type="button"
 className="p-1 text-text-muted hover:text-red-400 rounded-sm transition-colors opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer flex items-center justify-center shrink-0 z-10"
 title={`Remove "${s}" from suggestions`}
 aria-label={`Remove suggestion ${s}`}
 onMouseDown={e => {
 e.preventDefault();
 e.stopPropagation();
 }}
 onClick={e => {
 e.preventDefault();
 e.stopPropagation();
 removeRecentValue(fieldKey, s);
 }}
 >
 <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
 <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
 </svg>
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 );
}

