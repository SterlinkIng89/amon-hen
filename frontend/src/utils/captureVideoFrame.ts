/**
 * Captures the current frame of an HTMLVideoElement onto a 1280x720 canvas
 * and returns it as a JPEG data URL.
 *
 * Returns null if the video element is invalid, not ready (readyState < 2),
 * has zero dimensions, or if 2D canvas context cannot be acquired.
 */
export function captureVideoFrameDataUrl(
  videoEl: HTMLVideoElement | null,
  quality = 0.92,
): string | null {
  if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.drawImage(videoEl, 0, 0, 1280, 720);
  return canvas.toDataURL("image/jpeg", quality);
}
