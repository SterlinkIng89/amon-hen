import React, { useEffect, useState } from "react";
import {
  SetTagGameArtwork,
  UploadTagGameArtworkFile,
} from "../../../wailsjs/go/backend/App";
import { GameArtworkConfig } from "../../types";

export interface TagGameArtworkSectionProps {
  readonly tag: string;
  readonly artwork?: GameArtworkConfig;
  readonly onArtworkChange: (next: GameArtworkConfig) => void;
}

type ArtworkSlot = "poster" | "hero";

interface SlotDescriptor {
  readonly slot: ArtworkSlot;
  readonly title: string;
  readonly subtitle: string;
  readonly aspectClass: string;
  readonly placeholder: string;
}

const ARTWORK_SLOTS: readonly SlotDescriptor[] = [
  {
    slot: "poster",
    title: "Card Poster (2:3)",
    subtitle: "Used in vertical game cards and timeline stacks.",
    aspectClass: "aspect-[2/3] max-w-[140px]",
    placeholder: "https://example.com/poster.jpg",
  },
  {
    slot: "hero",
    title: "Banner / Hero (16:9)",
    subtitle: "Used in wide highlight cards and top game headers.",
    aspectClass: "aspect-video w-full",
    placeholder: "https://example.com/hero.jpg",
  },
];

interface ArtworkSlotCardProps {
  readonly descriptor: SlotDescriptor;
  readonly tag: string;
  readonly currentUrl: string;
  readonly otherUrl: string;
  readonly onCommit: (slot: ArtworkSlot, nextUrl: string) => void;
}

function ArtworkSlotCard({
  descriptor,
  tag,
  currentUrl,
  otherUrl,
  onCommit,
}: ArtworkSlotCardProps) {
  const { slot, title, subtitle, aspectClass, placeholder } = descriptor;
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setUrlInput(currentUrl);
    setErrorMsg("");
    setPreviewFailed(false);
  }, [currentUrl, tag]);

  const trimmedInput = urlInput.trim();
  const hasArtwork = Boolean(currentUrl);

  const persistUrls = async (nextSlotUrl: string) => {
    const posterUrl = slot === "poster" ? nextSlotUrl : otherUrl;
    const heroUrl = slot === "hero" ? nextSlotUrl : otherUrl;
    await SetTagGameArtwork(tag, posterUrl, heroUrl);
    onCommit(slot, nextSlotUrl);
  };

  const runSlotAction = async (action: () => Promise<void>) => {
    if (isBusy) return;
    setIsBusy(true);
    setErrorMsg("");
    try {
      await action();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpload = () =>
    runSlotAction(async () => {
      const uploadedUrl = await UploadTagGameArtworkFile(tag, slot);
      if (uploadedUrl) {
        setUrlInput(uploadedUrl);
        setPreviewFailed(false);
        onCommit(slot, uploadedUrl);
      }
    });

  const handleApplyUrl = () => {
    if (!trimmedInput) return;
    return runSlotAction(async () => {
      await persistUrls(trimmedInput);
      setPreviewFailed(false);
    });
  };

  const handleClear = () =>
    runSlotAction(async () => {
      await persistUrls("");
      setUrlInput("");
      setPreviewFailed(false);
    });

  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-lg border border-border-subtle bg-surface">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-text-primary m-0">
            {title}
          </h4>
          <p className="text-[11px] text-text-muted m-0 mt-0.5">{subtitle}</p>
        </div>
        {hasArtwork && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isBusy}
            aria-label={`Clear ${title}`}
            className="px-2 py-1 text-[11px] font-medium rounded border border-border-subtle bg-elevated hover:bg-card text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      <div
        className={`${aspectClass} rounded-md border border-border-subtle bg-elevated overflow-hidden flex items-center justify-center`}
      >
        {hasArtwork && !previewFailed ? (
          <img
            src={currentUrl}
            alt={`${tag} ${title}`}
            className="w-full h-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 p-3 text-center">
            <span className="text-[11px] font-medium text-text-muted">
              {previewFailed ? "Preview unavailable" : "No custom artwork"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={isBusy}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border-subtle bg-elevated hover:bg-card hover:border-border-medium text-text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {isBusy ? "Working..." : "Upload Image"}
          </button>
          <span className="text-[11px] text-text-muted">
            or paste an image URL below
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (errorMsg) setErrorMsg("");
            }}
            placeholder={placeholder}
            aria-label={`${title} URL`}
            disabled={isBusy}
            className="flex-1 min-w-0 h-[32px] bg-elevated border border-border-subtle rounded px-2.5 text-xs text-text-primary outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleApplyUrl}
            disabled={isBusy || !trimmedInput}
            className="btn btn-primary h-[32px] px-3 text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-50 disabled:pointer-events-none"
          >
            Apply
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5"
          >
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}

export function TagGameArtworkSection({
  tag,
  artwork,
  onArtworkChange,
}: TagGameArtworkSectionProps) {
  const posterUrl = artwork?.poster_url ?? "";
  const heroUrl = artwork?.hero_url ?? "";

  const handleCommit = (slot: ArtworkSlot, nextUrl: string) => {
    const next: GameArtworkConfig = {
      poster_url: slot === "poster" ? nextUrl || undefined : posterUrl || undefined,
      hero_url: slot === "hero" ? nextUrl || undefined : heroUrl || undefined,
    };
    onArtworkChange(next);
  };

  return (
    <div className="flex flex-col gap-3 p-4 border border-border-subtle rounded-lg bg-elevated/40">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div>
          <h3 className="text-xs font-semibold text-text-primary m-0">
            Custom Game Artwork
          </h3>
          <p className="text-[11px] text-text-muted m-0 mt-0.5">
            Override Steam artwork or provide images for non-Steam games.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {ARTWORK_SLOTS.map((descriptor) => (
          <ArtworkSlotCard
            key={descriptor.slot}
            descriptor={descriptor}
            tag={tag}
            currentUrl={descriptor.slot === "poster" ? posterUrl : heroUrl}
            otherUrl={descriptor.slot === "poster" ? heroUrl : posterUrl}
            onCommit={handleCommit}
          />
        ))}
      </div>
    </div>
  );
}
