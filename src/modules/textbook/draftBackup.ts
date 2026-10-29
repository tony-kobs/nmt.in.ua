import { TEXTBOOK_BODY_MAX } from "./draftTypes";

/** Pause after the last keystroke before a draft is written. */
export const AUTOSAVE_DELAY_MS = 3000;

export type DraftBackup = {
  body: string;
  revision: number;
  savedAt: string;
};

type BackupStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function textbookDraftBackupKey(code: string): string {
  return `nmt-textbook-draft:${code}`;
}

export function parseDraftBackup(raw: string | null): DraftBackup | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as { body?: unknown; revision?: unknown; savedAt?: unknown };
    if (typeof record.body !== "string" || record.body.length > TEXTBOOK_BODY_MAX) return null;
    const revision = Number(record.revision);
    if (!Number.isInteger(revision) || revision < 0 || revision > 1_000_000_000) return null;
    if (typeof record.savedAt !== "string" || record.savedAt.length > 40) return null;
    return { body: record.body, revision, savedAt: record.savedAt };
  } catch {
    return null;
  }
}

export function readTextbookDraftBackup(storage: BackupStorage, code: string): DraftBackup | null {
  try {
    return parseDraftBackup(storage.getItem(textbookDraftBackupKey(code)));
  } catch {
    return null;
  }
}

export function writeTextbookDraftBackup(storage: BackupStorage, code: string, backup: DraftBackup): void {
  if (backup.body.length > TEXTBOOK_BODY_MAX) return;
  try {
    storage.setItem(textbookDraftBackupKey(code), JSON.stringify(backup));
  } catch {
    // A full disk must not block typing. The beforeunload warning still fires.
  }
}

export function autosaveReady(input: {
  body: string;
  savedBody: string;
  uploading: boolean;
  saving: boolean;
  held: boolean;
}): boolean {
  if (input.uploading || input.saving || input.held) return false;
  return input.body !== input.savedBody;
}

export function shouldWarnBeforeUnload(body: string, savedBody: string): boolean {
  return body !== savedBody;
}

export function isBlankTextbookDraft(body: string): boolean {
  return body.trim() === "";
}
