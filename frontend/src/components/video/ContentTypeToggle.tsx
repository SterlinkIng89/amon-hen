import React from "react";

interface ContentTypeToggleProps {
  readonly selectedContentType: "" | "vod" | "clip";
  readonly autoResolvedType: "vod" | "clip";
  readonly onChange: (type: "" | "vod" | "clip") => void;
}

export function ContentTypeToggle({
  selectedContentType,
  autoResolvedType,
  onChange,
}: ContentTypeToggleProps) {
  return (
    <div className="flex flex-col gap-2 shrink-0">
      <label className="text-sm font-medium text-white/90">Type</label>
      <div className="flex items-center h-[38px] rounded border border-border-subtle bg-elevated p-0.5">
        <button
          type="button"
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            selectedContentType === ""
              ? "bg-card text-accent border border-accent/40"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => onChange("")}
        >
          Auto ({autoResolvedType === "clip" ? "Clip" : "VOD"})
        </button>
        <button
          type="button"
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            selectedContentType === "vod"
              ? "bg-card text-accent border border-accent/40"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => onChange("vod")}
        >
          VOD
        </button>
        <button
          type="button"
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            selectedContentType === "clip"
              ? "bg-card text-accent border border-accent/40"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => onChange("clip")}
        >
          Clip
        </button>
      </div>
    </div>
  );
}
