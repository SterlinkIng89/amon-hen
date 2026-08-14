/**
 * useThumbnailQueue
 *
 * A module-level async semaphore that limits the number of concurrent
 * thumbnail/preview/duration requests sent to the Go backend.
 *
 * Why: When a folder with many clips is opened, useInView fires for all
 * visible cards at once. Without throttling, N×3 backend calls hit ffmpeg
 * simultaneously and saturate the CPU. This queue caps it at CONCURRENCY
 * parallel requests regardless of how many cards become visible at once.
 *
 * The Go backend has its own semaphore too (runtime.NumCPU()/2), so this
 * is a secondary safety net that also improves perceived load order
 * (thumbnails appear top-to-bottom rather than all at once).
 */

const CONCURRENCY = 3;

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

/**
 * Enqueue an async task so that at most CONCURRENCY tasks run at the same time.
 * Returns a Promise that resolves/rejects with the result of `fn`.
 */
export function enqueueThumb<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve)
        .catch(reject)
        .finally(release);
    };

    if (active < CONCURRENCY) {
      active++;
      run();
    } else {
      queue.push(run);
    }
  });
}
