import React, { useState } from "react";
import { SetVideoGames, DeleteFiles } from "../../../wailsjs/go/main/App";
import { useRecentTags } from "../../hooks/useRecentTags";
import TagInput from "../ui/TagInput";

interface Props {
  selectedPaths: string[];
  onClearSelection: () => void;
  onTagsSaved: () => void;
  onFilesDeleted: () => void;
}

export default function BulkActionBar({
  selectedPaths,
  onClearSelection,
  onTagsSaved,
  onFilesDeleted,
}: Props) {
  const [game, setGame] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const { suggestions, addRecentTag } = useRecentTags();

  if (selectedPaths.length === 0) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await SetVideoGames(selectedPaths, game);
      if (game) addRecentTag(game);
      setGame("");
      onTagsSaved();
    } catch (e) {
      console.error("Failed to save tags", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await DeleteFiles(selectedPaths);
      onFilesDeleted();
    } catch (e: any) {
      alert(e?.message || e || "Failed to delete files");
      console.error("Failed to delete files", e);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") onClearSelection();
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-50 m-4 p-2 pl-3 bg-elevated/95 backdrop-blur-md border border-accent/40 rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-between animate-slideDown">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
            <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
          </svg>
          <span>{selectedPaths.length} selected</span>
        </div>
        <button className="flex items-center gap-1 px-1.5 py-0.5 bg-transparent border-none text-[10px] text-text-secondary cursor-pointer rounded-sm hover:bg-black/20 hover:text-text-primary transition-colors uppercase font-medium" onClick={onClearSelection}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
          Clear
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Tag action */}
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6, flexShrink: 0 }}>
            <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
          </svg>
          <TagInput
            value={game}
            onChange={setGame}
            onEnter={handleSave}
            disabled={saving}
            className="w-[180px] bg-black/30 border border-white/10 rounded-sm px-2 py-1.5 text-xs text-text-primary outline-none transition-colors hover:border-white/20 focus:border-accent focus:bg-black/50"
          />
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !game.trim()}>
            {saving ? "Saving..." : "Apply Tag"}
          </button>
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* Delete action */}
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400 font-medium">Delete {selectedPaths.length} file{selectedPaths.length > 1 ? "s" : ""}?</span>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-sm hover:!text-red-400 hover:!border-red-400/30 hover:!bg-red-500/10" onClick={handleDelete}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
