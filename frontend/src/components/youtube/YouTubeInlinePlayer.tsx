import { useState, useEffect } from "react";
import { YTVideo } from "../../types";
import { UpdateYouTubeVideoMetadata } from "../../../wailsjs/go/main/App";

interface YouTubeInlinePlayerProps {
  video: YTVideo;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onUpdate?: () => void;
  onEnded?: () => void;
}

export default function YouTubeInlinePlayer({
  video,
  onPrev,
  onNext,
  onUpdate,
  onEnded,
}: YouTubeInlinePlayerProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editableTitle, setEditableTitle] = useState(video.title);
  const [editableDescription, setEditableDescription] = useState(
    video.description,
  );
  const [editablePrivacy, setEditablePrivacy] = useState(video.privacy);
  const [isSaving, setIsSaving] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(window.innerWidth / window.innerHeight);

  useEffect(() => {
    const handleResize = () => setAspectRatio(window.innerWidth / window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isWide = aspectRatio >= 2.0;

  useEffect(() => {
    setEditableTitle(video.title);
    setEditableDescription(video.description);
    setEditablePrivacy(video.privacy);
    setIsEditing(false);

    let player: any = null;

    const createPlayer = () => {
      if (!(window as any).YT || !(window as any).YT.Player) return;
      
      // Clear container first
      const container = document.getElementById("yt-player-container");
      if (container) container.innerHTML = '<div id="yt-player-element"></div>';

      player = new (window as any).YT.Player("yt-player-element", {
        height: "100%",
        width: "100%",
        videoId: video.id,
        playerVars: {
          autoplay: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onStateChange: (event: any) => {
            if (event.data === (window as any).YT.PlayerState.ENDED) {
              if (onEnded) onEnded();
            }
          },
        },
      });
    };

    if (!(window as any).YT || !(window as any).YT.Player) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      (window as any).onYouTubeIframeAPIReady = createPlayer;
    } else {
      createPlayer();
    }

    return () => {
      if (player && player.destroy) {
        try {
          player.destroy();
        } catch (e) {}
      }
    };
  }, [video.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await UpdateYouTubeVideoMetadata(
        video.id,
        editableTitle,
        editableDescription,
        editablePrivacy,
      );
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error updating video metadata:", error);
      alert("Failed to update video metadata");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className={`flex-1 flex overflow-hidden bg-base ${isWide ? "flex-row" : "flex-col"}`}>
      {/* Player Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center group min-w-0">
        <div id="yt-player-container" className="w-full h-full" />

        {/* Navigation Overlays */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Info Panel */}
      <div className={`bg-surface border-border-subtle p-6 overflow-y-auto custom-scrollbar shrink-0 ${isWide ? "border-l w-[450px] h-full" : "border-t flex-1 max-h-[40%]"}`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            {isEditing ? (
              <input
                type="text"
                className="flex-1 bg-elevated border border-border-subtle rounded-md px-3 py-2 text-lg font-bold text-text-primary outline-none focus:border-accent"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
              />
            ) : (
              <h1 className="text-xl font-bold text-text-primary leading-tight">
                {editableTitle}
              </h1>
            )}

            <div className="flex items-center gap-3">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn btn-accent px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                    )}
                    SAVE
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="btn btn-elevated px-4 py-2 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary"
                  >
                    CANCEL
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  title="Edit video details"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary mb-6 pb-6 border-b border-border-subtle">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-text-primary">
                {formatNumber(video.viewCount)}
              </span>
              <span className="text-text-muted text-xs">views</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-text-primary">
                {formatNumber(video.likeCount)}
              </span>
              <span className="text-text-muted text-xs">likes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-text-muted text-xs">
                {formatDate(video.publishedAt)}
              </span>
            </div>
            {isEditing ? (
              <select
                className="bg-elevated border border-border-subtle rounded px-2 py-1 text-xs font-bold text-accent outline-none focus:border-accent ml-auto"
                value={editablePrivacy}
                onChange={(e) => setEditablePrivacy(e.target.value)}
              >
                <option value="public">PUBLIC</option>
                <option value="unlisted">UNLISTED</option>
                <option value="private">PRIVATE</option>
              </select>
            ) : (
              <span
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ml-auto ${
                  editablePrivacy === "public"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : editablePrivacy === "unlisted"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}
              >
                {editablePrivacy}
              </span>
            )}
          </div>

          {isEditing ? (
            <textarea
              className="w-full h-40 bg-elevated border border-border-subtle rounded-md px-3 py-2 text-sm text-text-secondary outline-none focus:border-accent custom-scrollbar"
              value={editableDescription}
              onChange={(e) => setEditableDescription(e.target.value)}
              placeholder="Enter video description..."
            />
          ) : (
            <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {editableDescription || "No description available."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
