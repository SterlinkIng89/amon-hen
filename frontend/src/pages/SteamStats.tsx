import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  GetSteamAPIKey, GetSteamID, IsSteamSyncing, GetSteamLibraryPulse, GetEnrichedSteamGames, GetSteamDeveloperStats,
  GetSteamPublisherStats, GetSteamTagStats, UpsertSteamBacklogItem, ReorderSteamBacklog, RemoveSteamBacklogItem,
  UpsertSteamGameRating, RemoveSteamGameRating, SyncSteamData,
} from "../../wailsjs/go/backend/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import { SteamStatsSubHeader, SteamLogo, type SteamPageTab } from "../components/steam/SteamStatsSubHeader";
import { SteamLibraryPulseBar } from "../components/steam/SteamLibraryPulseBar";
import { SteamStudioGenrePanel, type SelectedGroupFilter, type StudioSortMode, type SteamStudioStatItem, type SteamTagStatItem } from "../components/steam/SteamStudioGenrePanel";
import { SteamGameInspectorGrid } from "../components/steam/SteamGameInspectorGrid";
import { SteamBacklogView } from "../components/steam/SteamBacklogView";
import { SteamPersonalTierView } from "../components/steam/SteamPersonalTierView";
import { filterSteamGames, normalizeGameInsight, type PlaytimeBucket, type AchievementFilter, type BacklogStatus, type TierLevel, type SteamGameInsight, type SteamLibraryPulse } from "../utils/steamInsightsUtils";

export type { SteamPageTab };

const DEFAULT_PULSE: SteamLibraryPulse = {
  totalGames: 0, totalHours: 0, unplayedGames: 0, triedGames: 0, playedGames: 0, obsessionGames: 0,
  top10SharePct: 0, totalAchievements: 0, unlockedAchievements: 0, perfectGamesCount: 0, almostThereCount: 0, recordedGamesCount: 0,
};

export default function SteamStats(): React.JSX.Element {
  const [tab, setTab] = useState<SteamPageTab>("insights");
  const [hideUtilities, setHideUtilities] = useState<boolean>(() => localStorage.getItem("steam:hideUtilities") !== "false");
  const [pulse, setPulse] = useState<SteamLibraryPulse | null>(null);
  const [allGames, setAllGames] = useState<SteamGameInsight[]>([]);
  const [devs, setDevs] = useState<SteamStudioStatItem[]>([]);
  const [pubs, setPubs] = useState<SteamStudioStatItem[]>([]);
  const [tags, setTags] = useState<SteamTagStatItem[]>([]);
  const [sortBy, setSortBy] = useState<StudioSortMode>("hours");
  const [activeBucket, setActiveBucket] = useState<PlaytimeBucket>("all");
  const [activeAchievementFilter, setActiveAchievementFilter] = useState<AchievementFilter>("all");
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroupFilter | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasCreds, setHasCreds] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError("");
      const [apiKey, id] = await Promise.all([GetSteamAPIKey(), GetSteamID()]);
      if (!apiKey || !id) {
        setHasCreds(false);
        if (showLoading) setLoading(false);
        return;
      }
      setHasCreds(true);

      const [pulseData, gamesData, dStats, pStats, tStats] = await Promise.all([
        GetSteamLibraryPulse(hideUtilities),
        GetEnrichedSteamGames(hideUtilities),
        GetSteamDeveloperStats(sortBy),
        GetSteamPublisherStats(sortBy),
        GetSteamTagStats(sortBy),
      ]);

      setPulse(pulseData || null);
      setAllGames((gamesData || []).map(normalizeGameInsight));
      setDevs(dStats || []);
      setPubs(pStats || []);
      setTags(tStats || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [hideUtilities, sortBy]);

  const refreshGames = useCallback(async () => {
    try {
      const [pulseData, gamesData] = await Promise.all([
        GetSteamLibraryPulse(hideUtilities),
        GetEnrichedSteamGames(hideUtilities),
      ]);
      if (pulseData) setPulse(pulseData);
      if (gamesData) setAllGames(gamesData.map(normalizeGameInsight));
    } catch (err: unknown) {
      console.error("Failed to refresh steam games:", err);
    }
  }, [hideUtilities]);

  useEffect(() => {
    loadData(true);
    IsSteamSyncing().then((active: boolean) => active && setSyncing(true)).catch(() => {});
    const unsubProgress = EventsOn("steam:sync-progress", (msg: string) => { setSyncing(true); setSyncProgress(msg); });
    const unsubGamesUpdated = EventsOn("steam:games-updated", () => loadData(false));
    const unsubDone = EventsOn("steam:sync-done", () => { setSyncing(false); setSyncProgress(""); loadData(false); });
    const unsubError = EventsOn("steam:sync-error", (msg: string) => { setSyncing(false); setSyncProgress(""); setError(msg); });
    const unsubAuth = EventsOn("steam:auth-complete", () => loadData(true));
    const unsubDisconnect = EventsOn("steam:auth-disconnected", () => loadData(false));
    return () => { unsubProgress(); unsubGamesUpdated(); unsubDone(); unsubError(); unsubAuth(); unsubDisconnect(); };
  }, [loadData]);

  const handleToggleUtilities = () => {
    setHideUtilities((prev) => {
      const next = !prev;
      localStorage.setItem("steam:hideUtilities", String(next));
      return next;
    });
  };

  const handleSync = async () => {
    setSyncing(true); setError(""); setSyncProgress("Starting sync...");
    try {
      await SyncSteamData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSyncing(false); setSyncProgress("");
    }
  };

  const handleQuickQueue = async (appid: number, status: BacklogStatus) => {
    await UpsertSteamBacklogItem(appid, status, ""); await refreshGames();
  };
  const handleQuickRate = async (appid: number, tier: TierLevel, score: number) => {
    await UpsertSteamGameRating(appid, tier, score, ""); await refreshGames();
  };
  const handleUpsertBacklog = async (appid: number, status: BacklogStatus, notes: string) => {
    await UpsertSteamBacklogItem(appid, status, notes); await refreshGames();
  };
  const handleReorderBacklog = async (orderedAppIds: number[]) => {
    await ReorderSteamBacklog(orderedAppIds); await refreshGames();
  };
  const handleRemoveBacklog = async (appid: number) => {
    await RemoveSteamBacklogItem(appid); await refreshGames();
  };
  const handleSaveRating = async (appid: number, tier: TierLevel, score: number, notes: string) => {
    await UpsertSteamGameRating(appid, tier, score, notes); await refreshGames();
  };
  const handleRemoveRating = async (appid: number) => {
    await RemoveSteamGameRating(appid); await refreshGames();
  };

  const filteredGames = useMemo(() => {
    return filterSteamGames(allGames, {
      search: searchQuery,
      bucket: activeBucket,
      achievementFilter: activeAchievementFilter,
      developer: selectedGroup?.type === "developers" ? selectedGroup.name : null,
      publisher: selectedGroup?.type === "publishers" ? selectedGroup.name : null,
      tag: selectedGroup && (selectedGroup.type === "genres" || selectedGroup.type === "features") ? selectedGroup.name : null,
    });
  }, [allGames, searchQuery, activeBucket, activeAchievementFilter, selectedGroup]);

  const queuedCount = useMemo(() => allGames.filter((g) => Boolean(g.backlogStatus)).length, [allGames]);
  const ratedCount = useMemo(() => allGames.filter((g) => Boolean(g.personalTier)).length, [allGames]);
  const unrecordedGemsCount = useMemo(() => allGames.filter((g) => g.playtimeForever >= 1200 && g.ytVideosCount === 0).length, [allGames]);
  const topDevs = useMemo(() => devs.slice(0, 10).map((d) => d.name), [devs]);
  const topGenres = useMemo(() => tags.filter((t) => !t.category || t.category === "genre").slice(0, 10).map((t) => t.tag), [tags]);

  const hasActiveFilter = activeBucket !== "all" || activeAchievementFilter !== "all" || selectedGroup !== null || searchQuery.trim() !== "";
  const activeFilterTitle = selectedGroup ? selectedGroup.name : activeBucket !== "all" ? `Bucket: ${activeBucket}` : activeAchievementFilter !== "all" ? `Filter: ${activeAchievementFilter}` : "";

  if (!hasCreds && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-base">
        <div className="text-center max-w-md bg-surface border border-border-subtle p-8 rounded-2xl">
          <SteamLogo className="w-16 h-16 mx-auto mb-4 text-accent" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Steam Not Connected</h2>
          <p className="text-xs text-text-muted mb-4 leading-relaxed">
            To view your Steam statistics, please open the Settings panel and connect your Steam account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      <SteamStatsSubHeader
        tab={tab}
        queuedCount={queuedCount}
        ratedCount={ratedCount}
        syncing={syncing}
        syncProgress={syncProgress}
        hideUtilities={hideUtilities}
        onSelectTab={setTab}
        onToggleUtilities={handleToggleUtilities}
        onSync={handleSync}
      />

      {error && (
        <div className="px-5 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
      )}

      {tab === "insights" && (
        <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-5 gap-5">
          <ErrorBoundary area="Steam Library Pulse">
            <SteamLibraryPulseBar
              pulse={pulse || DEFAULT_PULSE}
              activeBucket={activeBucket}
              activeAchievementFilter={activeAchievementFilter}
              unrecordedGemsCount={unrecordedGemsCount}
              onSelectBucket={setActiveBucket}
              onSelectAchievementFilter={setActiveAchievementFilter}
            />
          </ErrorBoundary>

          <div className="flex-1 flex gap-5 min-h-[600px]">
            <div className="w-[35%] shrink-0">
              <ErrorBoundary area="Steam Studio & Genre Panel">
                <SteamStudioGenrePanel
                  developers={devs}
                  publishers={pubs}
                  tags={tags}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  selectedGroup={selectedGroup}
                  onSelectGroup={setSelectedGroup}
                />
              </ErrorBoundary>
            </div>

            <div className="flex-1 min-w-0">
              <ErrorBoundary area="Steam Game Inspector Grid">
                <SteamGameInspectorGrid
                  games={filteredGames}
                  activeFilterTitle={activeFilterTitle}
                  hasActiveFilter={hasActiveFilter}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onClearFilters={() => {
                    setActiveBucket("all");
                    setActiveAchievementFilter("all");
                    setSelectedGroup(null);
                    setSearchQuery("");
                  }}
                  onQuickQueue={handleQuickQueue}
                  onQuickRate={handleQuickRate}
                  onRemoveRating={handleRemoveRating}
                  onRemoveBacklog={handleRemoveBacklog}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {tab === "backlog" && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <ErrorBoundary area="Steam Backlog View">
            <SteamBacklogView
              allGames={allGames}
              topGenres={topGenres}
              topDevs={topDevs}
              onUpsertBacklog={handleUpsertBacklog}
              onReorderBacklog={handleReorderBacklog}
              onRemoveBacklog={handleRemoveBacklog}
            />
          </ErrorBoundary>
        </div>
      )}

      {tab === "rankings" && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <ErrorBoundary area="Steam Personal Tier View">
            <SteamPersonalTierView
              allGames={allGames}
              onSaveRating={handleSaveRating}
              onRemoveRating={handleRemoveRating}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
