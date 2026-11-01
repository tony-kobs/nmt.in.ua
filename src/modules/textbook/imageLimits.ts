/** Textbook figure limits. Safe to import from the editor and from the upload route. */

export const TEXTBOOK_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const TEXTBOOK_IMAGE_TYPES = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
} as const;

export type TextbookImageMime =
  (typeof TEXTBOOK_IMAGE_TYPES)[keyof typeof TEXTBOOK_IMAGE_TYPES];

export type TextbookImageCheck =
  | { ok: true; mime: TextbookImageMime }
  | { ok: false; code: "type" | "size" };

/**
 * Trust the file bytes. SVG and HTML are rejected: an SVG served from this
 * origin can run script when opened directly. GIF is allowed for diagrams.
 */
export function sniffTextbookImage(bytes: Uint8Array): TextbookImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return TEXTBOOK_IMAGE_TYPES.jpeg;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return TEXTBOOK_IMAGE_TYPES.png;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return TEXTBOOK_IMAGE_TYPES.webp;
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return TEXTBOOK_IMAGE_TYPES.gif;
  }
  return null;
}

export function checkTextbookImage(bytes: Uint8Array): TextbookImageCheck {
  if (bytes.byteLength === 0 || bytes.byteLength > TEXTBOOK_IMAGE_MAX_BYTES) {
    return { ok: false, code: "size" };
  }
  const mime = sniffTextbookImage(bytes);
  if (!mime) return { ok: false, code: "type" };
  return { ok: true, mime };
}

/** Public path stored in textbook markup. The hash is the SHA-256 of the bytes. */
export function textbookImagePath(hash: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  return `/api/textbook-media/${hash}`;
}

/** Placeholder src while an upload is in flight. The parser skips it. */
export function isUploadPlaceholderSrc(src: string): boolean {
  return /^pending-[a-z0-9]+$/.test(src);
}
