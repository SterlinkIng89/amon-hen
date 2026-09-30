/**
 * useThumbnailQueue
 *
 * Module-level async semaphore and in-memory cache for media assets
 * (thumbnails, previews, durations).
 */

const thumbCache = new Map<string, string>();
const durationCache = new Map<string, number>();
const previewCache = new Map<string, string>();

export function getCachedThumb(path: string): string | undefined {
  return thumbCache.get(path);
}

export function setCachedThumb(path: string, url: string): void {
  thumbCache.set(path, url);
}

export function clearCachedThumb(path: string): void {
  thumbCache.delete(path);
}

export function getCachedDuration(path: string): number | undefined {
  return durationCache.get(path);
}

export function setCachedDuration(path: string, duration: number): void {
  durationCache.set(path, duration);
}

export function getCachedPreview(path: string): string | undefined {
  return previewCache.get(path);
}

export function setCachedPreview(path: string, url: string): void {
  previewCache.set(path, url);
}

export function clearCachedPreview(path: string): void {
  previewCache.delete(path);
}

function createQueue(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active--;
    if (queue.length > 0) {
      const next = queue.shift()!;
      active++;
      next();
    }
  }

  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn().then(resolve).catch(reject).finally(release);
      };

      if (active < concurrency) {
        active++;
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

// High concurrency for fast thumbnail queries (cache hits resolve instantly)
export const enqueueThumb = createQueue(8);

// Dedicated queue for duration probes
export const enqueueDuration = createQueue(4);

// Dedicated queue for preview sprite generation (heavy ffmpeg on hover)
export const enqueuePreview = createQueue(2);
