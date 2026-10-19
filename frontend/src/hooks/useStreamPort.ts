import { useState, useEffect, useRef, useCallback } from "react";
import { GetStreamPort } from "../../wailsjs/go/backend/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";

export interface UseStreamPortResult {
  readonly streamPort: number;
  readonly isConnecting: boolean;
  readonly streamError: string | null;
  readonly retryStream: () => void;
}

export function useStreamPort(isPlayerActive = false): UseStreamPortResult {
  const [streamPort, setStreamPort] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStreamPort = useCallback((retriesLeft = 10, delay = 300) => {
    setIsConnecting(true);
    setStreamError(null);
    GetStreamPort()
      .then((port) => {
        if (port > 0) {
          setStreamPort(port);
          setIsConnecting(false);
          setStreamError(null);
        } else if (retriesLeft > 0) {
          retryTimeoutRef.current = setTimeout(() => {
            fetchStreamPort(retriesLeft - 1, delay);
          }, delay);
        } else {
          setIsConnecting(false);
          setStreamError("Failed to connect to local stream server.");
        }
      })
      .catch((err) => {
        if (retriesLeft > 0) {
          retryTimeoutRef.current = setTimeout(() => {
            fetchStreamPort(retriesLeft - 1, delay);
          }, delay);
        } else {
          setIsConnecting(false);
          setStreamError(err instanceof Error ? err.message : "Stream server error");
        }
      });
  }, []);

  const retryStream = useCallback(() => {
    fetchStreamPort(10, 300);
  }, [fetchStreamPort]);

  useEffect(() => {
    fetchStreamPort(10, 300);

    const unsubStreamErr = EventsOn("stream:error", (msg: string) => {
      setStreamError(typeof msg === "string" ? msg : "Stream server encountered an error");
    });

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      unsubStreamErr();
    };
  }, [fetchStreamPort]);

  useEffect(() => {
    if (isPlayerActive && streamPort === 0 && !isConnecting && !streamError) {
      fetchStreamPort(5, 300);
    }
  }, [isPlayerActive, streamPort, isConnecting, streamError, fetchStreamPort]);

  return {
    streamPort,
    isConnecting,
    streamError,
    retryStream,
  };
}
