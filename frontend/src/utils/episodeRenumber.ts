/**
 * Renumbers an episode map after reordering a group of duplicate videos.
 *
 * @param episodes - Current map of videoId -> episode number
 * @param duplicateEpisode - The base episode number that had duplicates
 * @param orderedVideoIds - The video IDs assigned to this episode in the desired chronological order
 * @returns A new record with renumbered episodes, leaving non-positive values untouched
 */
export function renumberAfterReorder(
  episodes: Readonly<Record<string, number>>,
  duplicateEpisode: number,
  orderedVideoIds: readonly string[]
): Record<string, number> {
  const result: Record<string, number> = { ...episodes };
  const orderedSet = new Set(orderedVideoIds);
  const shift = Math.max(0, orderedVideoIds.length - 1);

  for (let i = 0; i < orderedVideoIds.length; i++) {
    result[orderedVideoIds[i]] = duplicateEpisode + i;
  }

  for (const [vid, ep] of Object.entries(episodes)) {
    if (!orderedSet.has(vid) && ep > duplicateEpisode) {
      result[vid] = ep + shift;
    }
  }

  return result;
}
