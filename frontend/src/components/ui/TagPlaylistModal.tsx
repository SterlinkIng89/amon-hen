import React from "react";
import TagPlaylistEditor from "./TagPlaylistEditor";

interface Props {
  readonly tag: string;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export default function TagPlaylistModal({ tag, onClose, onSaved }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border-subtle rounded-lg shadow-2xl w-full max-w-4xl max-h-[88vh] overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <TagPlaylistEditor
          tag={tag}
          onSaved={onSaved}
          onCancel={onClose}
          showCancel={true}
        />
      </div>
    </div>
  );
}
