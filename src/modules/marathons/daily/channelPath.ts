/** Where to send a participant after they save the delivery channel. */
export function channelSavedPath(input: {
  slug: string;
  dayNumber: number | null;
  dayReady: boolean;
}): string {
  const slug = input.slug.trim();
  if (
    slug &&
    input.dayReady &&
    input.dayNumber != null &&
    Number.isInteger(input.dayNumber) &&
    input.dayNumber >= 1
  ) {
    return `/marathon/${slug}/day/${input.dayNumber}?saved=1`;
  }
  return "/?saved=1";
}

export function withSavedFlag(path: string, saved: boolean): string {
  if (!saved || path.includes("saved=1")) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const before = hashAt >= 0 ? path.slice(0, hashAt) : path;
  return `${before}${before.includes("?") ? "&" : "?"}saved=1${hash}`;
}
