import { useState, useEffect, useCallback } from "react";
// @ts-ignore
import {
  GetSteamDeveloperStats,
  GetSteamPublisherStats,
  GetSteamTagStats,
  GetSteamOverallStats,
  GetSteamGamesByDeveloper,
  GetSteamGamesByPublisher,
  GetSteamGamesByTag,
  SyncSteamData,
  GetSteamAPIKey,
  GetSteamID,
  IsSteamSyncing,
} from "../../wailsjs/go/backend/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import ErrorBoundary from "../components/ui/ErrorBoundary";

interface DevPubStat {
  name: string;
  totalHours: number;
  gamesCount: number;
}

interface TagStat {
  tag: string;
  totalHours: number;
  gamesCount: number;
}

interface OverallStat {
  totalGames: number;
  totalHours: number;
  totalAchievements: number;
  unlockedAchievements: number;
}

export interface SteamGameItem {
  appid: number;
  name: string;
  playtimeHours: number;
  playtimeForever: number;
  playtime2Weeks: number;
  headerUrl: string;
  achievementsPct: number;
}

export default function SteamStats() {
  const [devs, setDevs] = useState<DevPubStat[]>([]);
  const [pubs, setPubs] = useState<DevPubStat[]>([]);
  const [tags, setTags] = useState<TagStat[]>([]);
  const [overall, setOverall] = useState<OverallStat | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [error, setError] = useState("");
  const [hasCreds, setHasCreds] = useState(false);
  const [sortBy, setSortBy] = useState<"hours" | "games">("hours");

  // Expanded items state: category:name (e.g. "dev:TaleWorlds Entertainment")
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [gamesCache, setGamesCache] = useState<Record<string, SteamGameItem[]>>(
    {},
  );
  const [loadingGames, setLoadingGames] = useState<Record<string, boolean>>({});
  const [visibleCounts, setVisibleCounts] = useState({
    dev: 20,
    pub: 20,
    tag: 20,
  });

  const loadMore = (type: "dev" | "pub" | "tag") => {
    setVisibleCounts((prev) => ({ ...prev, [type]: prev[type] + 20 }));
  };

  const loadData = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setLoading(true);
        setError("");

        const apiKey = await GetSteamAPIKey();
        const id = await GetSteamID();
        if (!apiKey || !id) {
          setHasCreds(false);
          if (showLoading) setLoading(false);
          return;
        }
        setHasCreds(true);

        const [dStats, pStats, tStats, oStats] = await Promise.all([
          GetSteamDeveloperStats(sortBy),
          GetSteamPublisherStats(sortBy),
          GetSteamTagStats(sortBy),
          GetSteamOverallStats(),
        ]);

        setDevs(dStats || []);
        setPubs(pStats || []);
        setTags(tStats || []);
        setOverall(oStats);
        setVisibleCounts({ dev: 20, pub: 20, tag: 20 }); // reset visibility on reload/sort
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [sortBy],
  );

  useEffect(() => {
    loadData(true);

    IsSteamSyncing()
      .then((inProgress: boolean) => {
        if (inProgress) setSyncing(true);
      })
      .catch(() => {});

    const unsubProgress = EventsOn("steam:sync-progress", (msg: string) => {
      setSyncing(true);
      setSyncProgress(msg);
    });

    const unsubGamesUpdated = EventsOn("steam:games-updated", () => {
      loadData(false);
    });

    const unsubDone = EventsOn("steam:sync-done", () => {
      setSyncing(false);
      setSyncProgress("");
      // Invalidate cache so newly synced details show up
      setGamesCache({});
      loadData(false);
    });

    const unsubError = EventsOn("steam:sync-error", (errMsg: string) => {
      setSyncing(false);
      setSyncProgress("");
      setError(errMsg);
    });

    const unsubAuth = EventsOn("steam:auth-complete", () => {
      loadData(true);
    });

    const unsubDisconnect = EventsOn("steam:auth-disconnected", () => {
      loadData(false);
    });

    return () => {
      unsubProgress();
      unsubGamesUpdated();
      unsubDone();
      unsubError();
      unsubAuth();
      unsubDisconnect();
    };
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    setSyncProgress("Starting sync...");
    try {
      await SyncSteamData();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSyncing(false);
      setSyncProgress("");
    }
  };

  const toggleExpand = async (type: "dev" | "pub" | "tag", name: string) => {
    const key = `${type}:${name}`;
    const willExpand = !expandedKeys[key];

    setExpandedKeys((prev) => ({ ...prev, [key]: willExpand }));

    if (willExpand && !gamesCache[key]) {
      setLoadingGames((prev) => ({ ...prev, [key]: true }));
      try {
        let games: SteamGameItem[] = [];
        if (type === "dev") {
          games = await GetSteamGamesByDeveloper(name);
        } else if (type === "pub") {
          games = await GetSteamGamesByPublisher(name);
        } else if (type === "tag") {
          games = await GetSteamGamesByTag(name);
        }
        setGamesCache((prev) => ({ ...prev, [key]: games || [] }));
      } catch (err) {
        console.error("Failed to load games for", key, err);
      } finally {
        setLoadingGames((prev) => ({ ...prev, [key]: false }));
      }
    }
  };

  if (!hasCreds && !loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-main-bg p-8 flex items-center justify-center">
        <div className="text-center max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl">
          <svg
            className="w-20 h-20 mx-auto mb-6 text-[#66c0f4] "
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M11.979 0C5.353 0 0 5.373 0 12c0 6.628 5.353 12 11.979 12 6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12zm6.604 17.581c-.244-.122-1.396-.612-1.396-.612l-.93-1.425c.37-.123.69-.328.947-.6.284-.301.442-.693.442-1.1s-.158-.799-.442-1.1c-.283-.301-.663-.468-1.077-.468-.415 0-.794.167-1.078.468-.283.301-.442.699-.442 1.1s.159.799.442 1.1c.219.232.502.413.82.528l.942 1.455c-.201.096-.423.167-.659.206-.689.117-1.42-.034-1.956-.376l-1.98 1.054c.148.431.137.904-.038 1.332-.239.585-.71.996-1.309 1.144-.6.148-1.229.006-1.722-.387-.492-.393-.787-.976-.816-1.611-.029-.635.211-1.246.66-1.685.45-.439 1.066-.644 1.687-.56l3.32-3.155c-.006-.064-.01-.129-.01-.194 0-1.258.989-2.284 2.203-2.284 1.215 0 2.203 1.026 2.203 2.284 0 .914-.51 1.7-1.245 2.067l.951 1.455c.677.309 1.305.808 1.83 1.463l-1.408.86zM9.988 18.06c-.347.086-.711.003-1-.228-.288-.231-.462-.572-.479-.944-.017-.373.123-.732.385-.989.262-.257.624-.378.971-.329s.642.345.811.687c.168.343.161.75-.02 1.085-.181.336-.505.577-.868.665-.038.009-.076.014-.113.018-.285.034-.572-.008-.887-1.065zm2.753-3.66l-3.32 3.155c.006.064.01.129.01.194 0 1.258-.989 2.284-2.203 2.284-.047 0-.094-.001-.141-.004l-2.029-4.225c.191-.123.411-.214.654-.268.689-.117 1.42.034 1.956.376l1.98-1.054c-.148-.431-.137-.904.038-1.332.239-.585.71-.996 1.309-1.144.6-.148 1.229-.006 1.722.387.492.393.787.976.816 1.611.029.635-.211 1.246-.66 1.685-.45.439-1.066.644-1.687.56l-2.029-4.225c.191-.123.411-.214.654-.268z" />
          </svg>
          <h2 className="text-2xl font-bold text-white mb-2">
            Steam Not Connected
          </h2>
          <p className="text-sm text-white/60 mb-6">
            To view your beautiful Steam statistics, please open the Settings
            panel and connect your Steam account.
          </p>
        </div>
      </div>
    );
  }

  const renderGameList = (
    key: string,
    highlightTextClass: string = "text-emerald-500",
    highlightBgClass: string = "bg-emerald-500",
  ) => {
    const isFetching = loadingGames[key];
    const games = gamesCache[key] || [];

    if (isFetching) {
      return (
        <div className="flex items-center justify-center py-6 text-xs text-white/40 animate-pulse">
          <span className="loading loading-spinner loading-sm mr-3"></span>{" "}
          Loading library...
        </div>
      );
    }

    if (games.length === 0) {
      return (
        <div className="py-4 px-4 text-xs text-white/40 italic bg-black/20 rounded-xl border border-white/5 my-2">
          No games found.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-white/5 pl-2 animate-in fade-in slide-in-from-top-2 duration-300">
        {games.map((game) => {
          const hours = Math.round(game.playtimeForever / 60);
          const recentHours = (game.playtime2Weeks / 60).toFixed(1);
          return (
            <div
              key={game.appid}
              className="flex items-center gap-4 p-2.5 rounded-xl bg-gradient-to-r hover:from-white/[0.08] hover:to-white/[0.02] border border-transparent hover:border-white/10 transition-all duration-300 group shadow-sm hover:shadow-md cursor-default"
            >
              {game.headerUrl ? (
                <img
                  src={game.headerUrl}
                  alt={game.name}
                  className="w-20 h-10 object-cover rounded-md shadow-md flex-shrink-0 bg-black/40 group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-20 h-10 bg-black/40 rounded-md flex items-center justify-center text-[10px] text-white/30 border border-white/5">
                  Steam
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h4
                    className={`text-sm font-semibold text-white/90 truncate ${highlightTextClass} transition-colors`}
                  >
                    {game.name}
                  </h4>
                  <span className="text-[12px] font-bold text-white/90 whitespace-nowrap tabular-nums tracking-tight">
                    {hours}h
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-white/40">
                  <span>
                    {game.playtime2Weeks > 0 ? (
                      <span
                        className={`${highlightTextClass} font-medium tracking-wide`}
                      >
                        {recentHours}h{" "}
                        <span className="text-white/30 font-normal">
                          past 2w
                        </span>
                      </span>
                    ) : (
                      <span>All-time</span>
                    )}
                  </span>

                  {game.achievementsPct > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1 bg-black/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${highlightBgClass} transition-all duration-500`}
                          style={{ width: `${game.achievementsPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/60 font-semibold tabular-nums w-8 text-right">
                        {Math.round(game.achievementsPct)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ErrorBoundary area="SteamStats">
      <div className="flex-1 overflow-y-auto bg-[#0a0a0c] p-8 lg:p-10">
        <div className="max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 mb-2 tracking-tight">
                Steam Insights
              </h1>
              <p className="text-sm text-white/40 font-medium">
                Analyze your lifetime library, playtime, and achievements.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {syncProgress && (
                <span className="text-xs font-semibold text-sky-400 animate-pulse bg-sky-400/10 px-3 py-1.5 rounded-full border border-sky-400/20">
                  {syncProgress}
                </span>
              )}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="btn border-none bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-lg shadow-sky-500/20 rounded-full px-6 h-10 min-h-10 text-sm font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              >
                <svg
                  className={syncing ? "animate-spin" : ""}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21L21.5 8" />
                </svg>
                {syncing ? "Syncing..." : "Sync Library"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-medium flex items-center gap-3">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="flex flex-col items-center gap-4">
                <span className="loading loading-spinner loading-lg text-sky-500"></span>
                <span className="text-sm text-white/40 font-medium animate-pulse">
                  Loading insights...
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-10">
              {/* Overall Stats Grid */}
              {overall && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    {
                      label: "Total Games",
                      value: overall.totalGames,
                      icon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
                      color: "text-sky-400",
                    },
                    {
                      label: "Hours Played",
                      value: `${overall.totalHours}h`,
                      icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
                      color: "text-amber-400",
                    },
                    {
                      label: "Achievements",
                      value: overall.totalAchievements,
                      icon: "M12 15l-3.09 1.63.59-3.45-2.5-2.44 3.47-.5L12 7l1.53 3.24 3.47.5-2.5 2.44.59 3.45z",
                      color: "text-emerald-400",
                    },
                    {
                      label: "Completion",
                      value: `${overall.totalAchievements > 0 ? Math.round((overall.unlockedAchievements / overall.totalAchievements) * 100) : 0}%`,
                      icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14",
                      color: "text-fuchsia-400",
                      progress:
                        overall.totalAchievements > 0
                          ? (overall.unlockedAchievements /
                              overall.totalAchievements) *
                            100
                          : 0,
                    },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="group relative bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-3xl p-6 transition-all duration-300 overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                        <svg
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className={stat.color}
                        >
                          <path d={stat.icon} />
                        </svg>
                      </div>
                      <div className="relative z-10">
                        <div className="text-xs font-bold text-white/40 tracking-widest mb-2">
                          {stat.label}
                        </div>
                        <div className="text-4xl font-black text-white tracking-tight">
                          {stat.value}
                        </div>

                        {stat.progress !== undefined && (
                          <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden mt-4 shadow-inner">
                            <div
                              className="bg-gradient-to-r from-fuchsia-600 to-fuchsia-400 h-full rounded-full transition-all duration-1000 ease-out"
                              style={{ width: `${stat.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end -mb-2 mt-4">
                <div className="bg-black/40 border border-white/5 rounded-xl p-1 flex items-center gap-1 shadow-inner">
                  <button
                    onClick={() => setSortBy("hours")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                      sortBy === "hours"
                        ? "bg-white/10 text-white shadow-md"
                        : "text-white/40 hover:text-white/80 hover:bg-white/5"
                    }`}
                  >
                    Sort by Hours
                  </button>
                  <button
                    onClick={() => setSortBy("games")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                      sortBy === "games"
                        ? "bg-white/10 text-white shadow-md"
                        : "text-white/40 hover:text-white/80 hover:bg-white/5"
                    }`}
                  >
                    Sort by Games
                  </button>
                </div>
              </div>

              {/* Data Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Developers Column */}
                <div className="bg-[#121214] border border-white/5 rounded-3xl p-6 flex flex-col shadow-xl">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                    <h3 className="text-base font-bold text-white flex items-center gap-3">
                      <div className="p-2 bg-sky-500/10 rounded-lg text-sky-400">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>
                      Top Developers
                    </h3>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[700px] pr-2 custom-scrollbar">
                    {devs.slice(0, visibleCounts.dev).map((d, i) => {
                      const key = `dev:${d.name}`;
                      const isExpanded = !!expandedKeys[key];
                      const maxVal =
                        sortBy === "games"
                          ? devs[0]?.gamesCount
                          : devs[0]?.totalHours;
                      const val =
                        sortBy === "games" ? d.gamesCount : d.totalHours;
                      const pct = Math.min(
                        100,
                        Math.max(2, (val / (maxVal || 1)) * 100),
                      );

                      return (
                        <div
                          key={i}
                          className={`p-3 rounded-2xl transition-all duration-300 border ${
                            isExpanded
                              ? "bg-white/[0.03] border-white/10"
                              : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/5"
                          }`}
                        >
                          <div
                            className="flex flex-col gap-2 cursor-pointer select-none group"
                            onClick={() => toggleExpand("dev", d.name)}
                          >
                            <div className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`text-white/20 group-hover:text-sky-400 transition-all duration-300 flex-shrink-0 ${isExpanded ? "rotate-90 text-sky-400" : ""}`}
                                >
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                <span className="font-bold text-white/90 truncate group-hover:text-white transition-colors tracking-tight">
                                  {d.name}
                                </span>
                              </div>
                              <span className="text-white/40 tabular-nums whitespace-nowrap text-xs font-medium">
                                {sortBy === "hours" ? (
                                  <>
                                    <strong className="text-white/90">
                                      {d.totalHours}h
                                    </strong>{" "}
                                    • {d.gamesCount}g
                                  </>
                                ) : (
                                  <>
                                    <strong className="text-white/90">
                                      {d.gamesCount}g
                                    </strong>{" "}
                                    • {d.totalHours}h
                                  </>
                                )}
                              </span>
                            </div>

                            <div className="bg-black/40 h-1.5 rounded-full overflow-hidden ml-6 w-[calc(100%-24px)]">
                              <div
                                className="bg-gradient-to-r from-sky-600 to-sky-400 h-full rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          {isExpanded &&
                            renderGameList(
                              key,
                              "text-sky-400 group-hover:text-sky-400",
                              "bg-sky-400",
                            )}
                        </div>
                      );
                    })}
                    {devs.length === 0 && (
                      <p className="text-sm text-white/30 py-8 text-center font-medium">
                        No data available.
                      </p>
                    )}
                    {devs.length > visibleCounts.dev && (
                      <button
                        onClick={() => loadMore("dev")}
                        className="w-full mt-2 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-all duration-300"
                      >
                        Load More ({devs.length - visibleCounts.dev} remaining)
                      </button>
                    )}
                  </div>
                </div>

                {/* Top Publishers Column */}
                <div className="bg-[#121214] border border-white/5 rounded-3xl p-6 flex flex-col shadow-xl">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                    <h3 className="text-base font-bold text-white flex items-center gap-3">
                      <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect
                            x="2"
                            y="7"
                            width="20"
                            height="14"
                            rx="2"
                            ry="2"
                          />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                      </div>
                      Top Publishers
                    </h3>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[700px] pr-2 custom-scrollbar">
                    {pubs.slice(0, visibleCounts.pub).map((p, i) => {
                      const key = `pub:${p.name}`;
                      const isExpanded = !!expandedKeys[key];
                      const maxVal =
                        sortBy === "games"
                          ? pubs[0]?.gamesCount
                          : pubs[0]?.totalHours;
                      const val =
                        sortBy === "games" ? p.gamesCount : p.totalHours;
                      const pct = Math.min(
                        100,
                        Math.max(2, (val / (maxVal || 1)) * 100),
                      );

                      return (
                        <div
                          key={i}
                          className={`p-3 rounded-2xl transition-all duration-300 border ${
                            isExpanded
                              ? "bg-white/[0.03] border-white/10"
                              : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/5"
                          }`}
                        >
                          <div
                            className="flex flex-col gap-2 cursor-pointer select-none group"
                            onClick={() => toggleExpand("pub", p.name)}
                          >
                            <div className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`text-white/20 group-hover:text-amber-400 transition-all duration-300 flex-shrink-0 ${isExpanded ? "rotate-90 text-amber-400" : ""}`}
                                >
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                <span className="font-bold text-white/90 truncate group-hover:text-white transition-colors tracking-tight">
                                  {p.name}
                                </span>
                              </div>
                              <span className="text-white/40 tabular-nums whitespace-nowrap text-xs font-medium">
                                {sortBy === "hours" ? (
                                  <>
                                    <strong className="text-white/90">
                                      {p.totalHours}h
                                    </strong>{" "}
                                    • {p.gamesCount}g
                                  </>
                                ) : (
                                  <>
                                    <strong className="text-white/90">
                                      {p.gamesCount}g
                                    </strong>{" "}
                                    • {p.totalHours}h
                                  </>
                                )}
                              </span>
                            </div>

                            <div className="bg-black/40 h-1.5 rounded-full overflow-hidden ml-6 w-[calc(100%-24px)]">
                              <div
                                className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          {isExpanded &&
                            renderGameList(
                              key,
                              "text-amber-400 group-hover:text-amber-400",
                              "bg-amber-400",
                            )}
                        </div>
                      );
                    })}
                    {pubs.length === 0 && (
                      <p className="text-sm text-white/30 py-8 text-center font-medium">
                        No data available.
                      </p>
                    )}
                    {pubs.length > visibleCounts.pub && (
                      <button
                        onClick={() => loadMore("pub")}
                        className="w-full mt-2 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-all duration-300"
                      >
                        Load More ({pubs.length - visibleCounts.pub} remaining)
                      </button>
                    )}
                  </div>
                </div>

                {/* Top Tags Column */}
                <div className="bg-[#121214] border border-white/5 rounded-3xl p-6 flex flex-col shadow-xl">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                    <h3 className="text-base font-bold text-white flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                          <line x1="7" y1="7" x2="7.01" y2="7" />
                        </svg>
                      </div>
                      Top Tags
                    </h3>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[700px] pr-2 custom-scrollbar">
                    {tags.slice(0, visibleCounts.tag).map((t, i) => {
                      const key = `tag:${t.tag}`;
                      const isExpanded = !!expandedKeys[key];
                      const maxVal =
                        sortBy === "games"
                          ? tags[0]?.gamesCount
                          : tags[0]?.totalHours;
                      const val =
                        sortBy === "games" ? t.gamesCount : t.totalHours;
                      const pct = Math.min(
                        100,
                        Math.max(2, (val / (maxVal || 1)) * 100),
                      );

                      return (
                        <div
                          key={i}
                          className={`p-3 rounded-2xl transition-all duration-300 border ${
                            isExpanded
                              ? "bg-white/[0.03] border-white/10"
                              : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/5"
                          }`}
                        >
                          <div
                            className="flex flex-col gap-2 cursor-pointer select-none group"
                            onClick={() => toggleExpand("tag", t.tag)}
                          >
                            <div className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`text-white/20 group-hover:text-indigo-400 transition-all duration-300 flex-shrink-0 ${isExpanded ? "rotate-90 text-indigo-400" : ""}`}
                                >
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                <span className="font-bold text-white/90 truncate group-hover:text-white transition-colors tracking-tight">
                                  {t.tag}
                                </span>
                              </div>
                              <span className="text-white/40 tabular-nums whitespace-nowrap text-xs font-medium">
                                {sortBy === "hours" ? (
                                  <>
                                    <strong className="text-white/90">
                                      {t.totalHours}h
                                    </strong>{" "}
                                    • {t.gamesCount}g
                                  </>
                                ) : (
                                  <>
                                    <strong className="text-white/90">
                                      {t.gamesCount}g
                                    </strong>{" "}
                                    • {t.totalHours}h
                                  </>
                                )}
                              </span>
                            </div>

                            <div className="bg-black/40 h-1.5 rounded-full overflow-hidden ml-6 w-[calc(100%-24px)]">
                              <div
                                className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          {isExpanded &&
                            renderGameList(
                              key,
                              "text-indigo-400 group-hover:text-indigo-400",
                              "bg-indigo-400",
                            )}
                        </div>
                      );
                    })}
                    {tags.length === 0 && (
                      <p className="text-sm text-white/30 py-8 text-center font-medium">
                        No data available.
                      </p>
                    )}
                    {tags.length > visibleCounts.tag && (
                      <button
                        onClick={() => loadMore("tag")}
                        className="w-full mt-2 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-all duration-300"
                      >
                        Load More ({tags.length - visibleCounts.tag} remaining)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
 .custom-scrollbar::-webkit-scrollbar {
 width: 4px;
 }
 .custom-scrollbar::-webkit-scrollbar-track {
 background: transparent;
 }
 .custom-scrollbar::-webkit-scrollbar-thumb {
 background: rgba(255, 255, 255, 0.1);
 border-radius: 10px;
 }
 .custom-scrollbar::-webkit-scrollbar-thumb:hover {
 background: rgba(255, 255, 255, 0.2);
 }
 `}</style>
      </div>
    </ErrorBoundary>
  );
}
