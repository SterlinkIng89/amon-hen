import { useState, useEffect, useCallback } from "react";
import {
  LoadConfig,
  SaveRecentFieldValues,
} from "../../wailsjs/go/backend/App";

const STORAGE_KEY = "amon_hen_recent_field_values";

export function useRecentFieldValues(maxItems = 10) {
  const [recentValues, setRecentValues] = useState<Record<string, string[]>>(
    {},
  );

  useEffect(() => {
    const loadValues = async () => {
      try {
        const cfg = await LoadConfig();
        if (cfg && cfg.recent_field_values) {
          setRecentValues(cfg.recent_field_values);
        }
      } catch (e) {
        console.error("Failed to load recent field values from backend", e);
      }
    };

    loadValues();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) loadValues();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const addRecentValue = useCallback(
    (fieldKey: string, newValue: string) => {
      if (!newValue.trim()) return;
      const val = newValue.trim();

      setRecentValues((prev) => {
        const current = prev[fieldKey] || [];
        const filtered = current.filter((t) => t !== val);
        const updated = [val, ...filtered].slice(0, maxItems);

        const newCache = { ...prev, [fieldKey]: updated };

        // Save to backend asynchronously
        SaveRecentFieldValues(newCache).catch((e) => {
          console.error("Failed to save recent field values to backend", e);
        });

        window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

        return newCache;
      });
    },
    [maxItems],
  );

  const removeRecentValue = useCallback(
    (fieldKey: string, valToRemove: string) => {
      setRecentValues((prev) => {
        const current = prev[fieldKey] || [];
        const updated = current.filter((t) => t !== valToRemove);
        const newCache = { ...prev, [fieldKey]: updated };

        // Save to backend asynchronously
        SaveRecentFieldValues(newCache).catch((e) => {
          console.error("Failed to remove recent field value from backend", e);
        });

        window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

        return newCache;
      });
    },
    [],
  );

  const getRecentValues = useCallback(
    (fieldKey: string) => {
      return recentValues[fieldKey] || [];
    },
    [recentValues],
  );

  return { getRecentValues, addRecentValue, removeRecentValue };
}
