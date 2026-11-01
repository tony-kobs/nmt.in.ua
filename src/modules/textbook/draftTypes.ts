/** Shared by the editor and the server. Not `server-only`, so the client may import it. */

export const TEXTBOOK_BODY_MAX = 1_000_000;

export const TEXTBOOK_VERSION_LIMIT = 40;

export type TextbookVersionSummary = {
  id: number;
  authorName: string;
  createdAt: string;
};

export type TextbookWriteResult =
  | { ok: true; revision: number; savedAt: string; body?: string }
  | { ok: false; reason: "theme" | "conflict" | "size" | "version" | "error" };

export type TextbookDraftRow = {
  body: string;
  revision: number;
  updatedAt: string | null;
};
