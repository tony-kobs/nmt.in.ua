"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser } from "@/modules/auth/getCurrentUser";
import { defaultChannelPreferences, type UserChannelPreferences } from "./channels";
import { saveUserChannelPreferences } from "./channelStore";
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification,
} from "./store";

async function viewerId(): Promise<number | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function listMyNotificationsAction(): Promise<UserNotification[]> {
  const userId = await viewerId();
  if (!userId) return [];
  try {
    return await listUserNotifications(userId);
  } catch (error) {
    console.error("list notifications", error);
    return [];
  }
}

export async function markNotificationReadAction(id: number): Promise<void> {
  const userId = await viewerId();
  if (!userId) return;
  await markNotificationRead(userId, id);
  revalidatePath("/");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const userId = await viewerId();
  if (!userId) return;
  await markAllNotificationsRead(userId);
  revalidatePath("/");
}

export type NotificationPreferencesState = { status: "idle" | "ok" | "error" };

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "1";
}

export async function saveNotificationPreferencesAction(
  _previous: NotificationPreferencesState,
  formData: FormData,
): Promise<NotificationPreferencesState> {
  const user = await requireUser();
  const prefs: UserChannelPreferences = defaultChannelPreferences();
  prefs.marathon = {
    email: checked(formData, "marathonEmail"),
    telegram: checked(formData, "marathonTelegram"),
  };
  prefs.news = {
    email: checked(formData, "newsEmail"),
    telegram: checked(formData, "newsTelegram"),
  };
  prefs.system = {
    email: checked(formData, "systemEmail"),
    telegram: checked(formData, "systemTelegram"),
  };
  try {
    await saveUserChannelPreferences(user.id, prefs);
  } catch (error) {
    console.error("saveNotificationPreferencesAction", error);
    return { status: "error" };
  }
  revalidatePath("/account");
  return { status: "ok" };
}
