import { textbookTopicHref } from "@/content/learningMaterials/textbookHref";

export type TextbookTopicRef = {
  code: string;
  name: string;
  description: string;
};

export type TextbookTopicPick<T> =
  | { status: "empty" }
  | { status: "missing" }
  | { status: "ready"; index: number; active: T; prev: T | null; next: T | null };

export function readTextbookTopicParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function ready<T>(themes: readonly T[], index: number): TextbookTopicPick<T> {
  return {
    status: "ready",
    index,
    active: themes[index] as T,
    prev: index > 0 ? (themes[index - 1] as T) : null,
    next: index < themes.length - 1 ? (themes[index + 1] as T) : null,
  };
}

/**
 * No query opens the first theme. A query that is not a theme code is a missing page.
 * An empty catalog with no query stays the empty textbook, not a 404.
 */
export function pickTextbookTopic<T extends { code: string }>(
  themes: readonly T[],
  requested: string | null,
): TextbookTopicPick<T> {
  if (requested) {
    const index = themes.findIndex((theme) => theme.code === requested);
    if (index < 0) return { status: "missing" };
    return ready(themes, index);
  }
  if (themes.length === 0) return { status: "empty" };
  return ready(themes, 0);
}

export function textbookTopicMeta(
  theme: TextbookTopicRef | null,
  labels: { title: string; description: string; namedDescription: string },
): { title: string; description: string; path: string } {
  if (!theme) {
    return {
      title: labels.title,
      description: labels.description,
      path: "/materials/textbook",
    };
  }
  const name = theme.name.trim() || theme.code;
  const body = theme.description.trim();
  return {
    title: name,
    description: body ? `${name}. ${body}` : labels.namedDescription,
    path: textbookTopicHref(theme.code),
  };
}

/** One sitemap URL per theme code. Skips blanks and codes that would break a query URL. */
export function textbookSitemapPaths(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const code of codes) {
    const trimmed = code.trim();
    if (!trimmed || seen.has(trimmed) || /[\s/?#]/.test(trimmed)) continue;
    seen.add(trimmed);
    paths.push(textbookTopicHref(trimmed));
  }
  return paths;
}
