import React, { useState, useId } from "react";
import { YTVideo } from "../../types";
import { UpdateYouTubeVideoMetadata } from "../../../wailsjs/go/backend/App";

export interface ChannelBulkEditModalProps {
  readonly open: boolean;
  readonly selectedVideos: YTVideo[];
  readonly onClose: () => void;
  readonly onCompleted: () => void;
}

function computeNewTitle(
  title: string,
  find: string,
  replace: string,
  caseSensitive: boolean,
): string {
  if (!find) return title;
  try {
    const flags = caseSensitive ? "g" : "gi";
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, flags);
    return title.replace(regex, replace);
  } catch {
    return title;
  }
}

function computeNewDescription(
  original: string,
  mode: "unchanged" | "replace" | "append",
  text: string,
): string {
  if (mode === "unchanged") return original;
  if (mode === "replace") return text;
  if (mode === "append") {
    if (!text.trim()) return original;
    return original ? `${original}\n\n${text}` : text;
  }
  return original;
}

function computeNewPrivacy(
  original: string,
  mode: "unchanged" | "public" | "unlisted" | "private",
): string {
  if (mode === "unchanged") return original;
  return mode;
}

export default function ChannelBulkEditModal({
  open,
  selectedVideos,
  onClose,
  onCompleted,
}: ChannelBulkEditModalProps) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<
    "unchanged" | "public" | "unlisted" | "private"
  >("unchanged");
  const [descMode, setDescMode] = useState<"unchanged" | "replace" | "append">(
    "unchanged",
  );
  const [descText, setDescText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const privacySelectId = useId();
  const matchCaseId = useId();
  const descUnchangedId = useId();
  const descReplaceId = useId();
  const descAppendId = useId();

  if (!open) return null;

  const handleApply = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setProgress({ current: 0, total: selectedVideos.length });

    try {
      for (let i = 0; i < selectedVideos.length; i++) {
        const v = selectedVideos[i];
        const nextTitle = computeNewTitle(v.title, findText, replaceText, matchCase);
        const nextDesc = computeNewDescription(v.description || "", descMode, descText);
        const nextPrivacy = computeNewPrivacy(v.privacy, privacyMode);

        setProgress({ current: i + 1, total: selectedVideos.length });
        await UpdateYouTubeVideoMetadata(v.id, nextTitle, nextDesc, nextPrivacy);
      }
      onCompleted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || "Failed to update videos");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-elevated border border-border-medium rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/50">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Bulk Edit {selectedVideos.length} Videos
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Update titles, descriptions, and privacy across selected YouTube videos
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Section: Title Find & Replace */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-text-muted">
              Title Find & Replace
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-text-secondary mb-1">
                  Find
                </label>
                <input
                  type="text"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                  placeholder="Text to find..."
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-text-secondary mb-1">
                  Replace With
                </label>
                <input
                  type="text"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                  placeholder="Replacement text..."
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <input
                id={matchCaseId}
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                disabled={isSaving}
                className="rounded border-white/20 bg-black/40 text-accent focus:ring-accent"
              />
              <label
                htmlFor={matchCaseId}
                className="text-xs text-text-secondary cursor-pointer select-none"
              >
                Match case
              </label>
            </div>

            {/* Live Preview List */}
            <div className="mt-2 bg-surface/40 border border-border-subtle rounded-xl p-3">
              <div className="text-[11px] font-medium text-text-muted mb-2 flex items-center justify-between">
                <span>Title Preview ({selectedVideos.length} videos)</span>
                {findText && (
                  <span className="text-[10px] text-accent">
                    Replacing &ldquo;{findText}&rdquo; &rarr; &ldquo;{replaceText}&rdquo;
                  </span>
                )}
              </div>
              <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                {selectedVideos.map((v) => {
                  const newTitle = computeNewTitle(
                    v.title,
                    findText,
                    replaceText,
                    matchCase,
                  );
                  const isModified = newTitle !== v.title;
                  return (
                    <div
                      key={v.id}
                      className="text-xs p-2 rounded-lg bg-black/20 border border-white/5 flex flex-col gap-0.5"
                    >
                      <span className="text-text-muted truncate line-through opacity-70">
                        {v.title}
                      </span>
                      <span
                        className={`truncate font-medium ${
                          isModified ? "text-accent font-semibold" : "text-text-primary"
                        }`}
                      >
                        {newTitle}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section: Visibility / Privacy */}
          <div className="space-y-2">
            <label
              htmlFor={privacySelectId}
              className="block text-xs font-semibold text-text-muted"
            >
              Visibility / Privacy
            </label>
            <select
              id={privacySelectId}
              value={privacyMode}
              onChange={(e) =>
                setPrivacyMode(
                  e.target.value as "unchanged" | "public" | "unlisted" | "private",
                )
              }
              disabled={isSaving}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
            >
              <option value="unchanged">Keep current visibility</option>
              <option value="public">Public - Visible to everyone</option>
              <option value="unlisted">Unlisted - Anyone with link can view</option>
              <option value="private">Private - Only you can view</option>
            </select>
          </div>

          {/* Section: Description */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-text-muted">
              Description
            </h4>
            <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              <label htmlFor={descUnchangedId} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  id={descUnchangedId}
                  type="radio"
                  name="descMode"
                  value="unchanged"
                  checked={descMode === "unchanged"}
                  onChange={() => setDescMode("unchanged")}
                  disabled={isSaving}
                  className="text-accent focus:ring-accent"
                />
                <span>Leave unchanged</span>
              </label>

              <label htmlFor={descReplaceId} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  id={descReplaceId}
                  type="radio"
                  name="descMode"
                  value="replace"
                  checked={descMode === "replace"}
                  onChange={() => setDescMode("replace")}
                  disabled={isSaving}
                  className="text-accent focus:ring-accent"
                />
                <span>Replace description</span>
              </label>

              <label htmlFor={descAppendId} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  id={descAppendId}
                  type="radio"
                  name="descMode"
                  value="append"
                  checked={descMode === "append"}
                  onChange={() => setDescMode("append")}
                  disabled={isSaving}
                  className="text-accent focus:ring-accent"
                />
                <span>Append to description</span>
              </label>
            </div>

            {descMode !== "unchanged" && (
              <textarea
                rows={4}
                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-text-primary outline-none focus:border-accent resize-none custom-scrollbar"
                placeholder="Description text..."
                value={descText}
                onChange={(e) => setDescText(e.target.value)}
                disabled={isSaving}
              />
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle bg-surface/50 flex items-center justify-between">
          <div className="text-xs text-text-muted">
            {progress && isSaving && (
              <span>
                Updating {progress.current} of {progress.total}...
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isSaving}
              className="btn btn-primary btn-sm flex items-center gap-2"
            >
              {isSaving && (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>Apply Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
