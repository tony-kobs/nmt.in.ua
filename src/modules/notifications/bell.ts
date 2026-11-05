import { isPlatformStaff, type UserRole } from "@/modules/auth/types";
import type { NotificationSnapshot } from "./logic";

/** In-site notes that name another person. Students and teachers must not see them. */
const ADMIN_ONLY_KINDS = new Set(["admin.feedback"]);

export function notificationVisibleToRole(kind: string, role: UserRole): boolean {
  if (ADMIN_ONLY_KINDS.has(kind)) return isPlatformStaff(role);
  return true;
}

export function marathonSlugFromLink(link: string | null): string {
  if (!link) return "";
  const match = /^\/marathon\/([^/?#]+)/.exec(link.trim());
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * What the bell may show.
 * Admin feedback stays with admins. An invite the student already answered
 * drops out. Unread topic reminders collapse to the newest one so abandoned
 * one-question sessions do not stack the badge.
 * `dismissIds` are unread rows the viewer should not keep counting.
 */
export function presentBellNotifications(input: {
  items: NotificationSnapshot[];
  role: UserRole;
  joinedSlugs: ReadonlySet<string>;
  declinedSlugs: ReadonlySet<string>;
}): { visible: NotificationSnapshot[]; dismissIds: number[] } {
  const dismissIds: number[] = [];
  const allowed = input.items.filter((item) => {
    if (notificationVisibleToRole(item.kind, input.role)) return true;
    if (!item.readAt) dismissIds.push(item.id);
    return false;
  });

  const pendingInvite = allowed.filter((item) => {
    if (item.kind !== "marathon.invite") return true;
    const slug = marathonSlugFromLink(item.link);
    const answered =
      slug !== "" &&
      (input.joinedSlugs.has(slug) || input.declinedSlugs.has(slug));
    if (!answered) return true;
    if (!item.readAt) dismissIds.push(item.id);
    return false;
  });

  const newestReminder = pendingInvite.find((item) => item.kind === "topic.reminder");
  const visible = pendingInvite.filter((item) => {
    if (item.kind !== "topic.reminder") return true;
    if (item.id === newestReminder?.id) return true;
    if (!item.readAt) dismissIds.push(item.id);
    return false;
  });

  return { visible, dismissIds: [...new Set(dismissIds)] };
}
