"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/auth/getCurrentUser";
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
