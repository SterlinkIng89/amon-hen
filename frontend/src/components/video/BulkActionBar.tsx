import React, { useState, useEffect } from "react";
import { SetVideoGames, LoadConfig } from "../../../wailsjs/go/main/App";

interface Props {
  selectedPaths: string[];
  onClearSelection: () => void;
  onTagsSaved: () => void;
}

export default function BulkActionBar({ selectedPaths, onClearSelection, onTagsSaved }: Props) {
  const [game, setGame] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    LoadConfig().then((cfg) => {
      if (cfg.video_games) {
        const uniqueGames = Array.from(new Set(Object.values(cfg.video_games))).filter(Boolean) as string[];
        setSuggestions(uniqueGames.sort());
      }
    });
  }, []);

  if (selectedPaths.length === 0) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await SetVideoGames(selectedPaths, game);
      onTagsSaved();
    } catch (e) {
      console.error("Failed to save tags", e);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onClearSelection();
    }
  };

  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-content">
        <span className="bulk-action-count">
          {selectedPaths.length} video{selectedPaths.length > 1 ? "s" : ""} selected
        </span>
        <div className="bulk-action-form">
          <input
            type="text"
            className="form-input bulk-action-input"
            placeholder="Enter Game Name..."
            value={game}
            onChange={(e) => setGame(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            list="game-suggestions"
            autoFocus
          />
          <datalist id="game-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Apply Tag"}
          </button>
          <button className="btn btn-ghost" onClick={onClearSelection} disabled={saving}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
