/** Stay on the marathon page after the delivery toggles are saved. */
export function channelSavedPath(input: { slug: string }): string {
  const slug = input.slug.trim();
  if (!slug) return "/?saved=1";
  return `/marathon/${slug}/map?saved=1`;
}

export function withSavedFlag(path: string, saved: boolean): string {
  if (!saved || path.includes("saved=1")) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const before = hashAt >= 0 ? path.slice(0, hashAt) : path;
  return `${before}${before.includes("?") ? "&" : "?"}saved=1${hash}`;
}
