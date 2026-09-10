/** Shared avatar limits — safe to import from client and server. */

export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_CROP_PX = 256;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

export const AVATAR_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type AvatarMime = (typeof AVATAR_MIME)[keyof typeof AVATAR_MIME];

/**
 * Trust the file bytes, not `Content-Type`. SVG/HTML polyglots are rejected.
 */
export function sniffAvatarMime(bytes: Uint8Array): AvatarMime | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return AVATAR_MIME.jpeg;
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return AVATAR_MIME.png;
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return AVATAR_MIME.webp;
  }

  return null;
}

export function isAvatarFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number"
  );
}
