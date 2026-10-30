"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/getCurrentUser";
import type { TextbookDraftRow, TextbookWriteResult } from "./draftTypes";
import { TEXTBOOK_BODY_MAX } from "./draftTypes";
import {
  loadTextbookVersionBody,
  readTextbookDraftRow,
  restoreTextbookVersion,
  saveTextbookDraft,
} from "./store";

function themeCode(raw: unknown): string {
  const code = String(raw ?? "").trim();
  if (!/^[A-Z0-9-]{1,32}$/.test(code)) return "";
  return code;
}

function revisionField(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 1_000_000_000) {
    return raw;
  }
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const revision = Number(text);
  if (!Number.isInteger(revision) || revision > 1_000_000_000) return null;
  return revision;
}

function normalizeBody(raw: unknown): string {
  return String(raw ?? "").replace(/\r\n/g, "\n");
}

export async function saveTextbookSectionAction(formData: FormData): Promise<void> {
  const user = await requireRole(["admin"]);
  const code = themeCode(formData.get("code"));
  if (!code) redirect("/admin/textbook?error=code");

  const body = normalizeBody(formData.get("body"));
  if (body.length > TEXTBOOK_BODY_MAX) {
    redirect(`/admin/textbook/${code}?error=size`);
  }
  const expectedRevision = revisionField(formData.get("expectedRevision"));
  if (expectedRevision === null) {
    redirect(`/admin/textbook/${code}?error=conflict`);
  }

  let saved: TextbookWriteResult;
  try {
    saved = await saveTextbookDraft({
      themeCode: code,
      body,
      expectedRevision,
      userId: user.id,
      publish: formData.get("intent") === "publish",
    });
  } catch (error) {
    console.error("textbook save failed", error);
    redirect(`/admin/textbook/${code}?error=save`);
  }
  if (!saved.ok) {
    if (saved.reason === "theme") redirect("/admin/textbook?error=theme");
    if (saved.reason === "size") redirect(`/admin/textbook/${code}?error=size`);
    if (saved.reason === "conflict") redirect(`/admin/textbook/${code}?error=conflict`);
    redirect(`/admin/textbook/${code}?error=save`);
  }
  const savedFlag = formData.get("intent") === "publish" ? "published" : "draft";
  redirect(`/admin/textbook/${code}?saved=${savedFlag}`);
}

export async function autosaveTextbookDraftAction(input: {
  code: string;
  body: string;
  expectedRevision: number;
}): Promise<TextbookWriteResult> {
  const user = await requireRole(["admin"]);
  const code = themeCode(input.code);
  if (!code) return { ok: false, reason: "theme" };
  const expectedRevision = revisionField(input.expectedRevision);
  if (expectedRevision === null) return { ok: false, reason: "conflict" };
  const body = normalizeBody(input.body);
  if (body.length > TEXTBOOK_BODY_MAX) return { ok: false, reason: "size" };
  try {
    return await saveTextbookDraft({
      themeCode: code,
      body,
      expectedRevision,
      userId: user.id,
      publish: false,
    });
  } catch (error) {
    console.error("textbook autosave failed", error);
    return { ok: false, reason: "error" };
  }
}

export async function loadTextbookDraftAction(code: string): Promise<TextbookDraftRow | null> {
  await requireRole(["admin"]);
  const theme = themeCode(code);
  if (!theme) return null;
  try {
    return await readTextbookDraftRow(theme);
  } catch (error) {
    console.error("textbook draft reload failed", error);
    return null;
  }
}

export async function loadTextbookVersionAction(
  code: string,
  versionId: number,
): Promise<{ body: string } | null> {
  await requireRole(["admin"]);
  const theme = themeCode(code);
  const id = revisionField(versionId);
  if (!theme || id === null || id < 1) return null;
  try {
    const body = await loadTextbookVersionBody(theme, id);
    return body === null ? null : { body };
  } catch (error) {
    console.error("textbook version read failed", error);
    return null;
  }
}

export async function restoreTextbookVersionAction(input: {
  code: string;
  versionId: number;
  expectedRevision: number;
}): Promise<TextbookWriteResult> {
  const user = await requireRole(["admin"]);
  const code = themeCode(input.code);
  const versionId = revisionField(input.versionId);
  const expectedRevision = revisionField(input.expectedRevision);
  if (!code || versionId === null || versionId < 1) return { ok: false, reason: "version" };
  if (expectedRevision === null) return { ok: false, reason: "conflict" };
  try {
    return await restoreTextbookVersion({
      themeCode: code,
      versionId,
      expectedRevision,
      userId: user.id,
    });
  } catch (error) {
    console.error("textbook version restore failed", error);
    return { ok: false, reason: "error" };
  }
}
