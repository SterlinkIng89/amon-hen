import { useState, useEffect } from 'react';
import { LoadConfig } from '../../wailsjs/go/main/App';

const STORAGE_KEY = 'amon_hen_recent_tags';

export function useRecentTags() {
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    const loadTags = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setRecentTags(JSON.parse(stored));
        }
      } catch (e) {
        console.error("Failed to load recent tags", e);
      }
    };

    loadTags();

    // Listen for changes from other components/tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) loadTags();
    };
    window.addEventListener('storage', handleStorage);
    
    // Also load all existing tags from config
    LoadConfig().then((cfg) => {
      if (cfg.video_games) {
        const unique = Array.from(new Set(Object.values(cfg.video_games))).filter(Boolean) as string[];
        setAllTags(unique.sort());
      }
    }).catch(console.error);

    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const addRecentTag = (newTag: string) => {
    if (!newTag.trim()) return;
    const tag = newTag.trim();
    
    const stored = localStorage.getItem(STORAGE_KEY);
    let current: string[] = stored ? JSON.parse(stored) : [];
    
    // Remove if it exists, then add to front
    const filtered = current.filter(t => t !== tag);
    const updated = [tag, ...filtered].slice(0, 20);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setRecentTags(updated);
    
    // Manually dispatch storage event for same-window sync
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    
    // Also tentatively add to allTags
    setAllTags(prev => {
      if (prev.includes(tag)) return prev;
      return [...prev, tag].sort();
    });
  };

  // Combine recent tags and all tags for suggestions
  // Recent tags appear first (in order of recency), then the rest alphabetically
  const suggestions = [
    ...recentTags,
    ...allTags.filter(t => !recentTags.includes(t))
  ];

  return { suggestions, addRecentTag };
}
