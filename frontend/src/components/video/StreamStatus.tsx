import React from "react";

export interface StreamStatusProps {
  readonly error: string | null;
  readonly onRetry: () => void;
  readonly onBackToLibrary: () => void;
}

export default function StreamStatus({
  error,
  onRetry,
  onBackToLibrary,
}: StreamStatusProps) {
  return (
    <div
      data-testid="stream-status"
      className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-base"
    >
      {error ? (
        <div className="flex flex-col items-center max-w-md gap-4 bg-surface border border-border-medium rounded-lg p-6">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            Unable to connect to stream server
          </h3>
          <p className="text-sm text-text-secondary">{error}</p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors"
            >
              Retry connection
            </button>
            <button
              onClick={onBackToLibrary}
              className="px-4 py-2 bg-card hover:bg-card-hover text-text-primary border border-border-medium text-sm font-medium rounded-md transition-colors"
            >
              Back to library
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-text-secondary">
            Connecting to video stream server...
          </p>
        </div>
      )}
    </div>
  );
}
