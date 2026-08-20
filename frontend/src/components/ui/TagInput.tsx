import React, { useState, useRef, useEffect } from "react";
import { useRecentTags } from "../../hooks/useRecentTags";

interface Props {
 value: string;
 onChange: (val: string) => void;
 onEnter?: () => void;
 className?: string;
 placeholder?: string;
 disabled?: boolean;
}

export default function TagInput({ value, onChange, onEnter, className, placeholder, disabled }: Props) {
 const [open, setOpen] = useState(false);
 const containerRef = useRef<HTMLDivElement>(null);
 const { suggestions } = useRecentTags();

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

 return (
 <div className="relative flex-1" ref={containerRef}>
 <input
 type="text"
 className={className || "w-full bg-elevated border border-border-subtle rounded-sm px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-border-medium focus:border-accent focus:bg-card focus:"}
 placeholder={placeholder || "e.g. Hollow Knight"}
 value={value}
 onChange={e => {
 onChange(e.target.value);
 setOpen(true);
 }}
 onFocus={() => setOpen(true)}
 onKeyDown={e => {
 if (e.key === "Enter") {
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
 className="px-3 py-2 text-sm text-text-primary cursor-pointer hover:bg-card hover:text-accent border-b border-border-subtle last:border-b-0"
 onClick={() => {
 onChange(s);
 setOpen(false);
 }}
 >
 {s}
 </div>
 ))}
 </div>
 )}
 </div>
 );
}
