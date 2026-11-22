"use server";

import { revalidatePath } from "next/cache";
import { invalidateCatalogCache } from "@/lib/cache/catalogCache";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { canImportContent } from "@/modules/auth/types";
import { applyTopicTaskFile, previewTopicTaskFile } from "./topicTaskFileStore";
import type { TopicTaskPlan } from "./topicTaskFile";

const MAX_BYTES = 2_000_000;

export type TopicTaskFileState =
  | { ok: false; message: string }
  | { ok: true; plan: TopicTaskPlan; applied: boolean };

function decode(bodyBase64: string): Uint8Array | null {
  try {
    const bytes = Buffer.from(bodyBase64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    return bytes;
  } catch {
    return null;
  }
}

async function allowed(): Promise<boolean> {
  const user = await requireUser();
  return canImportContent(user.role);
}

export async function previewTopicTaskFileAction(input: {
  themeId: number;
  name: string;
  bodyBase64: string;
  deleteMissing: boolean;
}): Promise<TopicTaskFileState> {
  if (!(await allowed())) return { ok: false, message: "Немає доступу." };
  const bytes = decode(input.bodyBase64);
  if (!bytes || !Number.isInteger(input.themeId)) return { ok: false, message: "Файл не прочитано." };
  try {
    const plan = await previewTopicTaskFile(input.themeId, input.name, bytes, input.deleteMissing);
    if (!plan) return { ok: false, message: "Тему не знайдено." };
    return { ok: true, plan, applied: false };
  } catch (error) {
    console.error("previewTopicTaskFileAction", error);
    return { ok: false, message: "Не вдалося перевірити файл." };
  }
}

export async function applyTopicTaskFileAction(input: {
  themeId: number;
  name: string;
  bodyBase64: string;
  deleteMissing: boolean;
}): Promise<TopicTaskFileState> {
  if (!(await allowed())) return { ok: false, message: "Немає доступу." };
  const bytes = decode(input.bodyBase64);
  if (!bytes || !Number.isInteger(input.themeId)) return { ok: false, message: "Файл не прочитано." };
  try {
    const plan = await applyTopicTaskFile(input.themeId, input.name, bytes, input.deleteMissing);
    if (!plan) return { ok: false, message: "Тему не знайдено." };
    if (plan.errors.length > 0) return { ok: true, plan, applied: false };
    invalidateCatalogCache();
    revalidatePath("/");
    return { ok: true, plan, applied: true };
  } catch (error) {
    console.error("applyTopicTaskFileAction", error);
    return { ok: false, message: "Не вдалося записати файл. Нічого не змінено." };
  }
}
