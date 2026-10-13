import { FC, useMemo } from "react";
import { backend } from "../../../../wailsjs/go/models";

interface PlaylistEpisodeTableProps {
  readonly videos: backend.CatalogVideoDraft[];
  readonly episodes: Record<string, number>;
  readonly onEpisodeChange: (videoId: string, episode: number) => void;
}

export const PlaylistEpisodeTable: FC<PlaylistEpisodeTableProps> = ({
  videos,
  episodes,
  onEpisodeChange,
}) => {
  // Count frequency of episode numbers to identify duplicates
  const episodeCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const ep of Object.values(episodes)) {
      if (ep > 0) {
        counts[ep] = (counts[ep] || 0) + 1;
      }
    }
    return counts;
  }, [episodes]);

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-elevated/60 text-text-secondary border-b border-border-subtle">
            <tr>
              <th className="py-2.5 px-3 font-semibold text-[11px]">Video</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-24 text-center">Inferred</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-28 text-center">Episode</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] w-36">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/50">
            {videos.map((vid) => {
              const assigned = episodes[vid.videoId] ?? vid.episode ?? 1;
              const isDuplicate = (episodeCounts[assigned] || 0) > 1;
              const isInvalid = assigned <= 0;

              return (
                <tr
                  key={vid.videoId}
                  className={`hover:bg-elevated/30 transition-colors ${
                    isDuplicate || isInvalid ? "bg-fire-dim/20" : ""
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-text-primary line-clamp-1">{vid.title}</div>
                    <div className="text-[10px] text-text-muted font-mono mt-0.5">{vid.videoId}</div>
                  </td>
                  <td className="py-2.5 px-3 text-center text-text-secondary font-mono">
                    {vid.episode > 0 ? `Ep ${vid.episode}` : "-"}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="number"
                      min="1"
                      value={assigned}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onEpisodeChange(vid.videoId, isNaN(val) ? 0 : val);
                      }}
                      className={`w-16 px-2 py-1 text-center rounded-lg bg-elevated border text-text-primary text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors ${
                        isDuplicate || isInvalid
                          ? "border-fire text-red-400 bg-fire-dim/30"
                          : "border-border-subtle"
                      }`}
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    {isDuplicate && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-fire-dim text-red-400 border border-border-fire">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        Duplicate episode
                      </span>
                    )}
                    {isInvalid && !isDuplicate && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-fire-dim text-red-400 border border-border-fire">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        Must be &gt; 0
                      </span>
                    )}
                    {!isDuplicate && !isInvalid && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Ready
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
