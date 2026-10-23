import { sniffAvatarMime, type AvatarMime } from "@/modules/auth/avatarConstants";

/** Fits the 2 MB server-action body together with the rest of the form. */
export const MARATHON_IMAGE_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
export const MARATHON_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
/** Telegram sendPhoto caption limit. */
export const TELEGRAM_CAPTION_LIMIT = 1024;
/** `day_id = 0` is the marathon intro. A positive id is `marathon_days.id`. */
export const INTRO_IMAGE_DAY_ID = 0;

export function marathonImagePath(token: string): string | null {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  return `/api/marathon-media/${token}`;
}

export type ImageCheck =
  | { ok: true; mime: AvatarMime }
  | { ok: false; code: "type" | "size" };

/** Trust the bytes. An empty file means “leave the current image”. */
export function checkMarathonImage(bytes: Uint8Array): ImageCheck {
  if (bytes.byteLength === 0 || bytes.byteLength > MARATHON_IMAGE_MAX_BYTES) {
    return { ok: false, code: "size" };
  }
  const mime = sniffAvatarMime(bytes);
  if (!mime) return { ok: false, code: "type" };
  return { ok: true, mime };
}
