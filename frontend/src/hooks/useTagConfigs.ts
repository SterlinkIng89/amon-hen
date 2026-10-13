import { useState, useEffect, useCallback } from "react";
import { GetAllGameTags, LoadConfig } from "../../wailsjs/go/backend/App";
import { TagPlaylistConfig } from "../types";
import { parseTagPlaylistConfigs } from "../utils/tagConfigParser";

export interface TagConfigsState {
  readonly allTags: string[];
  readonly configs: Record<string, TagPlaylistConfig>;
  readonly legacyPlaylists: Record<string, string>;
  readonly isLoading: boolean;
  readonly reload: () => void;
}

export function useTagConfigs(): TagConfigsState {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Record<string, TagPlaylistConfig>>({});
  const [legacyPlaylists, setLegacyPlaylists] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfigs = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      GetAllGameTags().catch(() => [] as string[]),
      LoadConfig().catch(() => null),
    ])
      .then(([tags, cfg]) => {
        if (tags) {
          setAllTags(tags);
        }
        if (cfg) {
          const legacy = cfg.tag_playlists || {};
          const raw = cfg.tag_playlist_configs || {};
          setConfigs(parseTagPlaylistConfigs(raw, legacy));
          setLegacyPlaylists(legacy);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  return {
    allTags,
    configs,
    legacyPlaylists,
    isLoading,
    reload: fetchConfigs,
  };
}
