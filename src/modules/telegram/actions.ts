"use server";

import { revalidatePath } from "next/cache";
import { createLinkForCurrentUser } from "./createLinkForCurrentUser";
import { unlinkTelegramForCurrentUser } from "./unlinkForCurrentUser";

export type TelegramLinkActionState =
  | { status: "idle" }
  | { status: "success"; url: string }
  | { status: "error" };

export type TelegramUnlinkActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error" };

export async function createTelegramLinkAction(
  _previous: TelegramLinkActionState,
): Promise<TelegramLinkActionState> {
  return createLinkForCurrentUser();
}

/** Signed-in user only. A user id in the form is ignored. */
export async function unlinkTelegramAction(
  _previous: TelegramUnlinkActionState,
): Promise<TelegramUnlinkActionState> {
  return unlinkTelegramForCurrentUser();
}

export async function unlinkTelegramFormAction(formData: FormData): Promise<void> {
  await unlinkTelegramForCurrentUser();
  const slug = String(formData.get("slug") ?? "").trim();
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    revalidatePath(`/marathon/${slug}`);
    revalidatePath(`/marathon/${slug}/map`);
  }
}
