// ── THE canonical client-side photo preparation (hardening sprint, 21 Aug) ──
//
// The same ~12-line canvas recipe existed in three components — community
// submit at 2000px/q0.85, timetable upload and the mock debrief at 1568/q0.85
// — the exact "one rule in N places drifts N−1 times" pattern of Incident
// #23. One implementation now; callers pass their limits.
//
// Every photo is RE-ENCODED to JPEG through a canvas. One mechanism removes
// two walls at once: an iPhone HEIC (which server MIME allowlists reject with
// no useful guidance) decodes natively on iOS and leaves here as JPEG, and an
// oversized photo is downscaled instead of bounced. `imageOrientation:
// 'from-image'` honours EXIF — without it, some Android cameras' portrait
// shots arrive sideways and any crop lands on the wrong region.

export interface PreparedImage {
  /** base64 JPEG payload (no data: prefix) */
  data: string;
  mime: 'image/jpeg';
  /** object-URL-style data URL for an <img> preview */
  preview: string;
  width: number;
  height: number;
}

/** Crop rectangle as FRACTIONS of the source image (0–1 each). Fractions,
 *  not pixels, so the same rect applies to the preview the student dragged
 *  on and to the full-resolution original being re-encoded. */
export interface CropRect { x: number; y: number; width: number; height: number }

/**
 * Decode → (optionally crop) → downscale to maxDim → JPEG.
 * Throws when the browser cannot decode the file at all — the caller owns the
 * student-facing sentence for that.
 */
export async function prepareImage(
  file: File | Blob,
  opts: { maxDim: number; quality: number; maxBytes: number; crop?: CropRect },
): Promise<PreparedImage | { tooLarge: true }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const c = opts.crop;
    const src = c
      ? {
          x: Math.max(0, Math.round(c.x * bitmap.width)),
          y: Math.max(0, Math.round(c.y * bitmap.height)),
          width: Math.max(1, Math.round(c.width * bitmap.width)),
          height: Math.max(1, Math.round(c.height * bitmap.height)),
        }
      : { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    // maxDim applies to the CROPPED region — cropping to one question out of a
    // page removes most of the pixels, which is what buys a tighter downscale
    // without losing legibility.
    const scale = Math.min(1, opts.maxDim / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, src.x, src.y, src.width, src.height, 0, 0, w, h);
    const url = canvas.toDataURL('image/jpeg', opts.quality);
    const b64 = url.split(',')[1] ?? '';
    // Base64 is ~4/3 of the byte size; stay under the server's cap.
    if (b64.length * 0.75 > opts.maxBytes) return { tooLarge: true };
    return { data: b64, mime: 'image/jpeg', preview: url, width: w, height: h };
  } finally {
    bitmap.close();
  }
}
