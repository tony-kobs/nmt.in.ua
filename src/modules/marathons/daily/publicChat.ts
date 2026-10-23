/** Public participant chat for the launch course. An empty field keeps this link. */
export const ONEMATH_PUBLIC_CHAT = {
  slug: "onemath",
  url: "https://t.me/nmt_onemath",
} as const;

export function resolvePublicChatUrl(
  slug: string | null | undefined,
  stored: string | null | undefined,
): string {
  const url = (stored ?? "").trim();
  if (url) return url;
  return slug === ONEMATH_PUBLIC_CHAT.slug ? ONEMATH_PUBLIC_CHAT.url : "";
}
